/**
 * POST /api/jobs/search
 *
 * Two modes:
 *   - mode: "auto"   → derives query from career_profile + user_profiles preferences
 *   - mode: "manual" → uses the caller-provided what/where/jobType/etc.
 *
 * Both modes hit the Adzuna adapter under the hood. Returns iCareerOS-shaped
 * OpportunityResult[] so the /jobs page can render them as-is.
 *
 * Body shape:
 *   { mode: "auto" }
 *   { mode: "manual", what?: string, where?: string, remote?: boolean,
 *     jobType?: string, salaryMin?: number, salaryMax?: number, page?: number }
 *
 * Server-side only — ADZUNA_APP_ID + ADZUNA_APP_KEY never reach the client.
 */

import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { withCrossSubdomainCookie } from "@/lib/supabase-cookie-options";
import type { CookieOptions } from "@supabase/ssr";
import { createClient as createServiceRoleClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { type AdzunaSearchParams } from "@/services/integrations/adzunaAdapter";
import { searchOpportunities } from "@/services/integrations/opportunityAggregator";
import type { OpportunitySearchFilters } from "@/services/opportunityTypes";
import type { OpportunityResult } from "@/services/opportunityTypes";
import { attachCompanyApplyUrls } from "@/services/jobs/companyUrlResolver";
import { chaseApplyUrlsBatch }    from "@/services/jobs/applyUrlChaser";

interface SearchRequestBody {
  mode?: "auto" | "manual";
  what?: string;
  where?: string;
  remote?: boolean;
  jobType?: string;
  salaryMin?: number;
  salaryMax?: number;
  page?: number;
  resultsPerPage?: number;
}

async function makeSupabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, withCrossSubdomainCookie(options))
          );
        },
      },
    }
  );
}

export async function POST(req: Request) {
  try {
    const supabase = await makeSupabaseServer();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({})) as SearchRequestBody;
    const mode = body.mode ?? "auto";

    let params: AdzunaSearchParams = {
      page: body.page ?? 1,
      resultsPerPage: body.resultsPerPage ?? 25,
    };

    let derivedFrom: { source: "auto" | "manual"; what: string; where: string } | null = null;

    if (mode === "auto") {
      // Build query from profile + preferences
      const [cp, up] = await Promise.all([
        supabase
          .from("career_profiles")
          .select("headline, target_skills, skills")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("user_profiles")
          .select("target_roles, current_position, location_city, location_state, location_country, work_mode, job_type, salary_min, salary_max")
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);

      const targetRoles = ((up.data?.target_roles as string[] | null) ?? []).filter(Boolean);
      const headline   = (cp.data?.headline as string | null) ?? "";
      const currentPos = (up.data?.current_position as string | null) ?? "";
      const skills     = ((cp.data?.skills as string[] | null) ?? []).filter(Boolean);

      // Pick the strongest TITLE signal: target_roles[0] > headline > current_position
      const titlePart =
        targetRoles[0]?.trim() ||
        headline.trim() ||
        currentPos.trim() ||
        "";

      // Augment with top-3 skills from the resume so Adzuna ranks results
      // that match BOTH the role title AND the candidate's actual skill set.
      // Adzuna's `what` is space-separated AND-ish — we keep it short to
      // avoid over-constraining (skills aren't required keywords on every JD).
      const skillSeasoning = skills.slice(0, 3).filter(s => s.length <= 25).join(" ");
      const what = [titlePart, skillSeasoning].filter(Boolean).join(" ").trim();

      // Compose location: City, State (or just State, or just Country if nothing else)
      const city  = (up.data?.location_city as string | null) ?? "";
      const state = (up.data?.location_state as string | null) ?? "";
      const where = [city, state].filter(Boolean).join(", ");

      // Work mode: if remote-only is checked, set remote filter
      const workModes = (up.data?.work_mode as string[] | null) ?? [];
      const remote    = workModes.length === 1 && workModes[0] === "remote";

      // Job type — Adzuna takes one
      const jobTypes = (up.data?.job_type as string[] | null) ?? [];
      const jobType  =
        jobTypes.includes("Full-time")  ? "full_time" :
        jobTypes.includes("Part-time")  ? "part_time" :
        jobTypes.includes("Contract")   ? "contract"  :
        undefined;

      params = {
        ...params,
        what,
        where: where || undefined,
        remote,
        jobType,
        salaryMin: (up.data?.salary_min as number | null) ?? undefined,
        salaryMax: (up.data?.salary_max as number | null) ?? undefined,
        sortBy:    "relevance",
      };
      derivedFrom = { source: "auto", what, where };
    } else {
      // Manual mode — use caller-provided values
      params = {
        ...params,
        what:      (body.what  ?? "").trim() || undefined,
        where:     (body.where ?? "").trim() || undefined,
        remote:    !!body.remote,
        jobType:   body.jobType,
        salaryMin: body.salaryMin,
        salaryMax: body.salaryMax,
        sortBy:    "date",
      };
      derivedFrom = {
        source: "manual",
        what:   params.what  ?? "",
        where:  params.where ?? "",
      };
    }

    if (!params.what) {
      return NextResponse.json({
        opportunities: [],
        total: 0,
        derivedFrom,
        warning: mode === "auto"
          ? "We need a bit more about you to personalize results. Add a target role or headline in your profile."
          : "Please enter a keyword to search.",
      });
    }

    // Capture user.id here so the nested buildQueryVariants closure has
    // a non-null value (TypeScript loses the narrowing inside async
    // functions even after the `if (!user) return 401` guard above).
    const authedUserId = user.id;

    // ── W4-B-2 (UAT 2026-05-10): multi-query fan-out for manual search ──
    // Single Adzuna query returned 1-2 results too often. Fan-out into:
    //   Q1: exact title (original params.what)
    //   Q2: seniority variant — strips a Senior/Junior/Sr/Jr/Lead prefix if
    //       present, or adds Senior if not, to widen relevant matches.
    //   Q3: related title from the user's career_profiles.headline when
    //       available, so a "Product Manager" search also surfaces the
    //       user's adjacent target. Skipped if headline is empty or echoes
    //       params.what.
    // Results are merged + deduped (by URL fallback to company::title).
    async function buildQueryVariants(baseWhat: string): Promise<string[]> {
      const seen = new Set<string>();
      const variants: string[] = [];
      const push = (s: string) => {
        const norm = s.trim().toLowerCase();
        if (!norm || seen.has(norm)) return;
        seen.add(norm);
        variants.push(s.trim());
      };
      push(baseWhat);

      // Q2: seniority swap
      const SENIORITY_RE = /^(senior|sr\.?|junior|jr\.?|lead|staff|principal|chief)\s+/i;
      const stripped = baseWhat.replace(SENIORITY_RE, "").trim();
      if (stripped !== baseWhat.trim()) {
        push(stripped);
      } else {
        push(`Senior ${baseWhat}`);
      }

      // Q3: related title from headline
      if (mode === "manual") {
        try {
          const cpRow = await supabase
            .from("career_profiles")
            .select("headline")
            .eq("user_id", authedUserId)
            .maybeSingle();
          const headline = (cpRow.data?.headline as string | null)?.trim();
          if (headline && headline.length > 0 && headline.length < 80) {
            // Take the first comma-or-pipe-separated chunk as the title-ish part.
            const firstChunk = headline.split(/[|,—-]/)[0]?.trim();
            if (firstChunk) push(firstChunk);
          }
        } catch { /* not fatal — keep the 1-2 variants we have */ }
      }
      return variants;
    }

    const variants = await buildQueryVariants(params.what ?? "");

    // 2026-06-18 (feat/jobs-opportunity-aggregator) — route through the
    // aggregator so each variant fans out to LinkedIn / Indeed / DB / Adzuna
    // in parallel instead of Adzuna-only. The aggregator handles per-source
    // dedupe + fallback already; we still dedupe again ACROSS variants since
    // each variant is a separate query.
    function paramsToFilters(what: string): OpportunitySearchFilters {
      const isRemote = !!params.remote
        || (params.where ?? "").toLowerCase().includes("remote");
      const types = params.jobType ? [params.jobType] : [];
      return {
        skills:       [],
        jobTypes:     types,
        location:     isRemote ? "remote" : (params.where ?? ""),
        query:        what,
        careerLevel:  "",
        targetTitles: [what],
        salaryMin:    params.salaryMin !== undefined ? String(params.salaryMin) : undefined,
        salaryMax:    params.salaryMax !== undefined ? String(params.salaryMax) : undefined,
        searchSource: "all",
        minFitScore:  0,
        showFlagged:  false,
      };
    }

    const variantResults = await Promise.all(
      variants.map((what) =>
        searchOpportunities({
          filters: paramsToFilters(what),
          limit:   40,                  // ~ 4 sources × 10
          offset:  0,
        }).catch((e) => {
          console.warn(`[/api/jobs/search] variant "${what}" failed:`, e instanceof Error ? e.message : e);
          return { opportunities: [] as OpportunityResult[], total: 0, sources: {} };
        }),
      ),
    );

    // Merge + dedupe across variants AND aggregate per-source counts so the
    // UI can show "25 jobs from Adzuna · LinkedIn · Database" without
    // double-counting.
    const seenKeys = new Set<string>();
    const mergedOpps: OpportunityResult[] = [];
    let rawTotal = 0;
    const sourceCounts: Record<string, { count: number; fallback?: boolean }> = {};
    for (const vr of variantResults) {
      rawTotal += vr.total;
      for (const opp of vr.opportunities) {
        const key = (opp.url || `${opp.company}::${opp.title}`).toLowerCase();
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          mergedOpps.push(opp);
        }
      }
      for (const [src, info] of Object.entries(vr.sources ?? {})) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const i = info as any;
        const acc = sourceCounts[src] ?? { count: 0, fallback: undefined };
        acc.count += i.count ?? 0;
        if (typeof i.fallback === "boolean") {
          acc.fallback = (acc.fallback ?? true) && i.fallback;
        }
        sourceCounts[src] = acc;
      }
    }
    // ── Merge quality-gate filtered counts (Brief Task 3) ─────────────
    const filteredAcc: { count: number; reasons: Array<{ title: string; company: string; reason: string }> } = { count: 0, reasons: [] };
    for (const vr of variantResults) {
      const f = (vr as { filtered?: { count: number; reasons?: Array<{ title: string; company: string; reason: string }> } }).filtered;
      if (!f) continue;
      filteredAcc.count += f.count ?? 0;
      if (Array.isArray(f.reasons)) {
        for (const r of f.reasons) {
          if (!filteredAcc.reasons.some(x => x.title === r.title && x.company === r.company)) {
            filteredAcc.reasons.push(r);
          }
        }
      }
    }

    // Treat the whole result as "fallback" only when every source that
    // reported a fallback flag was in fallback mode.
    const anyFallback = Object.values(sourceCounts).every(s => s.fallback === true);
    const result = {
      opportunities: mergedOpps,
      total:         rawTotal,
      fallback:      anyFallback,
      sources:       sourceCounts,
      filtered:      filteredAcc,
    };

    // Resolve direct apply-on-company URLs from descriptions, then chase
    // the Adzuna redirect to its actual destination so the Apply button
    // points to the company / ATS instead of the aggregator wherever
    // possible. Aggregator final destinations are skipped automatically.
    const enriched0 = attachCompanyApplyUrls(result.opportunities);
    const enriched  = await chaseApplyUrlsBatch(enriched0);

    // Upsert into the opportunities table so fit-scoring (which keys off the
    // DB UUID via /api/jobs/fit-scores) can find them. ON CONFLICT (source,
    // source_id) requires the non-partial UNIQUE constraint added by migration
    // opportunities_source_source_id_unique_constraint_v1 (Phase 6 Item 3).
    // DB UUID) can match these listings. Conflict target is (source, source_id).
    let opportunitiesWithDbIds: typeof enriched = enriched;
    if (enriched.length > 0) {
      const rows = enriched.map(o => ({
        source:           "adzuna",
        source_id:        o.id?.replace(/^adzuna-/, "") ?? null,
        title:            o.title,
        company:          o.company,
        location:         o.location || null,
        description:      o.description || null,
        url:              o.url || null,
        job_type:         o.type || null,
        is_remote:        o.is_remote ?? false,
        salary_min:       o.salary_min ?? null,
        salary_max:       o.salary_max ?? null,
        salary_currency:  o.salary_currency ?? null,
        posted_at:        o.first_seen_at ?? null,
        is_active:        true,
      }));

      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const upsertClient = serviceKey
        ? createServiceRoleClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            serviceKey,
            { auth: { persistSession: false } },
          )
        : supabase; // fallback — will fail RLS but matches prior behaviour
      const { data: upserted, error: upsertErr } = await upsertClient
        .from("opportunities")
        .upsert(rows, { onConflict: "source,source_id", ignoreDuplicates: false })
        .select("id, source, source_id, title, company");

      if (upsertErr) {
        // Don't fail the search — log and continue with synthetic IDs.
        console.warn("[/api/jobs/search] upsert failed:", upsertErr.message);
      } else if (Array.isArray(upserted)) {
        // Map DB IDs back to result objects by (source, source_id)
        const idMap = new Map<string, string>();
        for (const row of upserted) {
          if (row.source_id) idMap.set(`${row.source}::${row.source_id}`, row.id as string);
        }
        opportunitiesWithDbIds = enriched.map(o => {
          const sid = o.id?.replace(/^adzuna-/, "") ?? "";
          const dbId = idMap.get(`adzuna::${sid}`);
          return dbId ? { ...o, id: dbId } : o;
        });
      }
    }

    return NextResponse.json({
      opportunities: opportunitiesWithDbIds,
      total: result.total,
      derivedFrom,
      page: params.page,
      sourceFallback: result.fallback,
      // 2026-06-18 — per-source counts so the page can show
      // "N opportunities from Adzuna · LinkedIn · Database".
      sources: result.sources,
      // 2026-06-20 — quality-gate filtered postings (Brief Task 3).
      filtered: result.filtered,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Search failed";
    console.error("[/api/jobs/search] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
