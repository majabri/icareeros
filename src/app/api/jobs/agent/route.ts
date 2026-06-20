/**
 * POST /api/jobs/agent — AI Job-Matching Agent
 *
 * Two-phase flow:
 *   1. PLAN  — Claude reads the user's resume + preferences and produces
 *              3-5 strategic Adzuna search plans (queries that will, together,
 *              surface the most relevant jobs).
 *   2. RUN   — Server runs every plan against Adzuna in parallel, merges +
 *              dedupes by URL, upserts into the opportunities table so
 *              fit-scoring can later attach UUIDs.
 *
 * The agent solves the empty-target_roles case: when the user hasn't filled
 * out their preferences, Claude infers intent from work history, summary,
 * skills, and headline.
 *
 * Server-side only — ANTHROPIC_API_KEY + ADZUNA_APP_* never reach the client.
 */

import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { withCrossSubdomainCookie } from "@/lib/supabase-cookie-options";
import { createClient as createServiceRoleClient } from "@supabase/supabase-js";
import type { CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createTracedClient } from "@/lib/observability/langfuse";
import { type AdzunaSearchParams } from "@/services/integrations/adzunaAdapter";
import { searchOpportunities } from "@/services/integrations/opportunityAggregator";
import type { OpportunitySearchFilters } from "@/services/opportunityTypes";
import type { OpportunityResult } from "@/services/opportunityTypes";
import { validateJobs } from "@/services/jobs/jobValidator";
import { attachCompanyApplyUrls } from "@/services/jobs/companyUrlResolver";
import { chaseApplyUrlsBatch }   from "@/services/jobs/applyUrlChaser";
import { cleanJobDescription } from "@/services/jobs/descriptionCleaner";
import { scoreJobQuality, FILTER_THRESHOLD } from "@/services/jobs/qualityAnalyzer";
import { scoreJobs } from "@/services/jobs/jobMatching";

interface SearchPlan {
  what:        string;
  where?:      string;
  jobType?:    "full_time" | "part_time" | "contract" | "permanent";
  remote?:     boolean;
  rationale:   string;
}

interface PlanResponse {
  plans: SearchPlan[];
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

export async function POST() {
  try {
    const supabase = await makeSupabaseServer();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── Load context in parallel ───────────────────────────────────────────
    const [cpRes, upRes, cycleRes] = await Promise.all([
      supabase
        .from("career_profiles")
        .select("headline, summary, skills, work_experience, target_skills")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("user_profiles")
        .select("target_roles, current_position, career_levels, location_city, location_state, location_country, work_mode, job_type, salary_min, salary_max")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("career_os_cycles")
        .select("goal, current_stage")
        .eq("user_id", user.id)
        .eq("status", "active")
        .order("cycle_number", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const cp = cpRes.data;
    const up = upRes.data;
    const cycle = cycleRes.data;

    if (!cp) {
      return NextResponse.json(
        { error: "No career profile yet. Add one in /mycareer/profile.", opportunities: [], total: 0 },
        { status: 400 }
      );
    }

    // ── Build the resume context block for the planner ────────────────────
    const skills        = (cp.skills as string[] | null) ?? [];
    const targetRoles   = ((up?.target_roles as string[] | null) ?? []).filter(Boolean);
    const workExp       = (cp.work_experience as Array<{
      title?: string; company?: string; description?: string; startDate?: string; endDate?: string;
    }> | null) ?? [];

    const recentWork = workExp.slice(0, 4).map(w => {
      const dates = [w.startDate, w.endDate].filter(Boolean).join(" — ");
      const desc  = w.description ? ` — ${(w.description as string).replace(/\s+/g, " ").slice(0, 150)}` : "";
      return `• ${w.title ?? "?"} at ${w.company ?? "?"}${dates ? ` (${dates})` : ""}${desc}`;
    }).join("\n");

    const city  = (up?.location_city as string | null) ?? "";
    const state = (up?.location_state as string | null) ?? "";
    const userLocation = [city, state].filter(Boolean).join(", ");

    const resumeBlock = [
      cp.headline ? `Headline: ${cp.headline}` : null,
      up?.current_position ? `Current position: ${up.current_position}` : null,
      cp.summary  ? `Summary: ${(cp.summary as string).slice(0, 500)}` : null,
      `Skills (${skills.length}): ${skills.slice(0, 30).join(", ") || "—"}`,
      recentWork ? `Recent work:\n${recentWork}` : null,
      targetRoles.length > 0 ? `User-stated target roles: ${targetRoles.join(", ")}` : `User-stated target roles: NOT SET — infer from work history`,
      cycle?.goal ? `Current career goal: ${cycle.goal}` : null,
      userLocation ? `Preferred location: ${userLocation}` : null,
      (up?.work_mode as string[] | null)?.includes("remote") ? "Open to remote" : null,
    ].filter(Boolean).join("\n");

    // ── Phase 1: Ask Claude to plan ────────────────────────────────────────
    const anthropic = createTracedClient(user.id, "jobs/agent/plan");

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      tool_choice: { type: "tool", name: "plan_searches" },
      tools: [
        {
          name: "plan_searches",
          description: "Plan 3-5 strategic job searches that, together, will surface the most relevant roles for this candidate.",
          input_schema: {
            type: "object",
            properties: {
              plans: {
                type: "array",
                description: "3-5 search plans, ordered by expected relevance.",
                items: {
                  type: "object",
                  properties: {
                    what: {
                      type: "string",
                      description: "The Adzuna 'what' query — a job title or short title+keyword combo (max 60 chars). Title-led for high relevance.",
                    },
                    where: {
                      type: "string",
                      description: "Location filter (City, State or just City). Omit for nationwide. Use the user's preferred location when set.",
                    },
                    jobType: {
                      type: "string",
                      enum: ["full_time", "part_time", "contract", "permanent"],
                      description: "Optional Adzuna contract filter. Only set when the user has a clear preference.",
                    },
                    remote: {
                      type: "boolean",
                      description: "Set true if the user is open to remote AND the role title is one that's commonly remote.",
                    },
                    rationale: {
                      type: "string",
                      description: "One sentence — why this query will surface relevant matches for this candidate.",
                    },
                  },
                  required: ["what", "rationale"],
                },
              },
            },
            required: ["plans"],
          },
        },
      ],
      system: `You are a job-search strategist inside iCareerOS. Given a candidate's resume and preferences, produce 3-5 Adzuna search plans that together will surface the most relevant roles.

PRINCIPLES
- Title-led queries beat keyword soup. Each 'what' should lead with a clean job title.
- Cover the candidate's plausible role variants (e.g., 'Full-Cycle Accountant', 'Senior Accountant', 'Tax Accountant') rather than 5 copies of the same query.
- Match level. Don't suggest VP roles to entry-level candidates and vice versa.
- Use user-stated target_roles when present; otherwise infer titles from recent work history + headline + summary.
- Set 'where' from the user's preferred location when set. Omit for nationwide.
- Only set jobType when the user has a clear preference signal (e.g., they only listed Full-time in preferences).
- Only set remote=true when the user is explicitly open to remote AND the role is one that hires remotely.

QUALITY
- Each rationale should reference something specific from the candidate (current role, a domain, a key skill).
- Don't produce 5 identical queries with minor word changes — diversity wins.
- Don't produce queries the candidate is overqualified or underqualified for.`,
      messages: [
        {
          role: "user",
          content: `Plan strategic job searches for this candidate:\n\n${resumeBlock}\n\nReturn 3-5 Adzuna search plans that, together, maximize relevant matches.`,
        },
      ],
    });

    const toolBlock = response.content.find(b => b.type === "tool_use");
    if (!toolBlock || toolBlock.type !== "tool_use") {
      return NextResponse.json({ error: "Agent failed to produce a plan" }, { status: 500 });
    }
    const planResponse = toolBlock.input as PlanResponse;
    const plans = (planResponse.plans ?? []).slice(0, 5);

    if (plans.length === 0) {
      return NextResponse.json({
        opportunities: [], total: 0, plans, agent: { phase: "no_plans" },
      });
    }

    // ── Phase 2: Run every plan against Adzuna in parallel ────────────────
    const adzunaParamsList: AdzunaSearchParams[] = plans.map(p => ({
      what:    p.what,
      where:   p.where || undefined,
      jobType: p.jobType,
      remote:  p.remote,
      sortBy:  "relevance",
      resultsPerPage: 12,        // 12 × 5 = up to 60 raw, dedupe → ~30-40 unique
      page:    1,
    }));

    // 2026-06-18 (feat/jobs-opportunity-aggregator) — route each plan
    // through the aggregator so it fans out to LinkedIn / Indeed / DB /
    // Adzuna in parallel instead of Adzuna-only. The aggregator handles
    // per-source dedupe; we still dedupe ACROSS plans below.
    function planParamsToFilters(p: AdzunaSearchParams): OpportunitySearchFilters {
      const isRemote = !!p.remote || (p.where ?? "").toLowerCase().includes("remote");
      return {
        skills:       [],
        jobTypes:     p.jobType ? [p.jobType] : [],
        location:     isRemote ? "remote" : (p.where ?? ""),
        query:        p.what ?? "",
        careerLevel:  "",
        targetTitles: p.what ? [p.what] : [],
        searchSource: "all",
        minFitScore:  0,
        showFlagged:  false,
      };
    }

    const results = await Promise.all(
      adzunaParamsList.map(p => searchOpportunities({
        filters: planParamsToFilters(p),
        limit:   40,   // ~4 sources × 10 per plan
        offset:  0,
      }).catch(e => {
        console.warn("[jobs/agent] one plan failed:", e instanceof Error ? e.message : e);
        return { opportunities: [] as OpportunityResult[], total: 0, sources: {} };
      }))
    );

    // ── Merge + dedupe by URL (fall back to title+company key) ────────────
    const seen = new Set<string>();
    const merged: OpportunityResult[] = [];
    let aggregateTotal = 0;
    // Per-source counts across all plans, summed pre-dedupe — the UI uses
    // this for the "from Adzuna · LinkedIn · Database" line. allFallback
    // stays true only when EVERY source that reports a fallback flag is in
    // fallback mode (i.e. nothing real came back).
    const sourceCounts: Record<string, { count: number; fallback?: boolean }> = {};
    results.forEach((res) => {
      aggregateTotal += res.total;
      for (const opp of res.opportunities) {
        const key = (opp.url || `${opp.company}::${opp.title}`).toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          merged.push(opp);
        }
      }
      for (const [src, info] of Object.entries(res.sources ?? {})) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const i = info as any;
        const acc = sourceCounts[src] ?? { count: 0, fallback: undefined };
        acc.count += i.count ?? 0;
        if (typeof i.fallback === "boolean") {
          acc.fallback = (acc.fallback ?? true) && i.fallback;
        }
        sourceCounts[src] = acc;
      }
    });
    const allFallback = Object.values(sourceCounts).every(s => s.fallback === true);

    // ── Merge quality-gate filtered results across plans (Brief Task 3) ──
    const filteredAcc: { count: number; reasons: Array<{ title: string; company: string; reason: string }> } = { count: 0, reasons: [] };
    results.forEach((res) => {
      if (res && (res as { filtered?: { count: number; reasons?: Array<{ title: string; company: string; reason: string }> } }).filtered) {
        const f = (res as { filtered: { count: number; reasons?: Array<{ title: string; company: string; reason: string }> } }).filtered;
        filteredAcc.count += f.count ?? 0;
        if (Array.isArray(f.reasons)) {
          for (const r of f.reasons) {
            if (!filteredAcc.reasons.some(x => x.title === r.title && x.company === r.company)) {
              filteredAcc.reasons.push(r);
            }
          }
        }
      }
    });

    // ── Validate quality + drop bad jobs ─────────────────────────────────
    const validated = validateJobs(merged);
    const cleaned   = validated.kept;

    // ── Resolve direct apply-on-company URLs (when description has one) ──
    const enriched0 = attachCompanyApplyUrls(cleaned);

    // ── Chase Adzuna redirects to their final destination so the Apply
    //    button goes company-direct (or ATS) whenever possible. Aggregator
    //    final destinations are skipped — keeping the resolver's answer or
    //    falling back to opp.url at the UI layer.
    const enriched  = await chaseApplyUrlsBatch(enriched0);

    // ── Upsert into opportunities for fit-scoring ─────────────────────────
    // NOTE: ON CONFLICT (source, source_id) requires the non-partial UNIQUE
    // constraint added by migration opportunities_source_source_id_unique_constraint_v1
    // (Phase 6 Item 3). The prior partial unique index did not match this
    // form and the upsert silently failed.
    //
    // RLS NOTE: opportunities only has policies for service_role. Writing
    // through the user-session client errors with "new row violates
    // row-level security policy". We use a separate service-role client
    // for the write, then return DB UUIDs to the caller so /api/jobs/fit-scores
    // can look them up. If SUPABASE_SERVICE_ROLE_KEY is missing the upsert
    // is skipped and raw Adzuna IDs flow through (degraded fit-scoring).
    let opportunitiesWithIds: typeof enriched = enriched;
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
        is_flagged:       o.is_flagged ?? false,
        flag_reasons:     o.flag_reasons ?? null,
        quality_score:    o.quality_score ?? null,
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
        .select("id, source, source_id");

      if (upsertErr) {
        console.warn("[jobs/agent] upsert failed:", upsertErr.message);
      } else if (Array.isArray(upserted)) {
        const idMap = new Map<string, string>();
        for (const row of upserted) {
          if (row.source_id) idMap.set(`${row.source}::${row.source_id}`, row.id as string);
        }
        opportunitiesWithIds = enriched.map(o => {
          const sid = o.id?.replace(/^adzuna-/, "") ?? "";
          const dbId = idMap.get(`adzuna::${sid}`);
          return dbId ? { ...o, id: dbId } : o;
        });
      }
    }

    // ──────────────────────────────────────────────────────────────
    // Task 2 (post-Wave-5): always mix ATS rows into the curated feed.
    //
    // Until today the only path from `opportunities` (where Wave 4 ATS
    // ingestion writes) into the curated response was the empty-fallback
    // below — which fires only when Adzuna returns nothing. That meant
    // ATS jobs effectively never appeared alongside Adzuna jobs.
    //
    // New behaviour: fetch the freshest ATS rows on every request, in
    // parallel with everything above, merge into the curated array, dedupe
    // by case-folded title+company, then let the existing scoring pipeline
    // re-rank the union. No source preference — pure decisionScore wins.
    // ──────────────────────────────────────────────────────────────
    try {
      const mixServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const mixClient = mixServiceKey
        ? createServiceRoleClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            mixServiceKey,
            { auth: { persistSession: false } },
          )
        : supabase;
      const { data: atsRows } = await mixClient
        .from("opportunities")
        .select("id, title, company, location, description, url, job_type, is_remote, salary_min, salary_max, salary_currency, posted_at, first_seen_at, is_flagged, flag_reasons, quality_score, source")
        .eq("source", "ats")
        .eq("is_active", true)
        .or("is_flagged.is.null,is_flagged.eq.false")
        .order("first_seen_at", { ascending: false })
        .limit(50);
      if (Array.isArray(atsRows) && atsRows.length > 0) {
        // Build a dedupe key from title+company for the current set so we
        // never double-list a role that appeared in both Adzuna and the
        // ATS scrape.
        const key = (t: string | null | undefined, c: string | null | undefined) =>
          `${(t ?? "").trim().toLowerCase()}::${(c ?? "").trim().toLowerCase()}`;
        const seen = new Set<string>(
          opportunitiesWithIds.map(o => key(o.title, o.company))
        );
        const atsShaped = atsRows
          .filter(r => !seen.has(key(r.title as string, r.company as string)))
          .map(r => ({
            id:               r.id as string,
            title:            r.title as string,
            company:          r.company as string,
            location:         (r.location as string | null) ?? "",
            description:      cleanJobDescription(r.description as string | null),
            url:              (r.url as string | null) ?? "",
            type:             (r.job_type as string | null) ?? "",
            is_remote:        Boolean(r.is_remote),
            salary_min:       (r.salary_min as number | null) ?? null,
            salary_max:       (r.salary_max as number | null) ?? null,
            salary_currency:  (r.salary_currency as string | null) ?? null,
            first_seen_at:    (r.first_seen_at as string | null)
                                ?? (r.posted_at as string | null)
                                ?? null,
            is_flagged:       Boolean(r.is_flagged),
            flag_reasons:     (r.flag_reasons as string[] | null) ?? null,
            quality_score:    (r.quality_score as number | null) ?? null,
            // ATS rows store the company URL directly in `url`; expose it
            // as apply_url_company so OpportunityCard renders the direct
            // "Apply at <Company>" CTA instead of the Google fallback.
            apply_url_company: (r.url as string | null) ?? null,
            source:           "ats",
          })) as typeof opportunitiesWithIds;
        opportunitiesWithIds = [...opportunitiesWithIds, ...atsShaped];
        console.info(`[jobs/agent] merged ${atsShaped.length} ATS rows into curated set (deduped from ${atsRows.length})`);
      }
    } catch (e) {
      console.warn("[jobs/agent] ATS mix failed (non-fatal):", e instanceof Error ? e.message : e);
    }

    // ── W4-B-1 (UAT 2026-05-10): curated-empty fallback ─────────────
    // If the AI plans + Adzuna + validator pipeline returned NOTHING for
    // this user, fall back to the shared `opportunities` table populated
    // by the prefetch cron. The user sees jobs instead of "No matches" —
    // not personally curated, but better than an empty state. We flag
    // these rows with `agent.usedFallback=true` so the UI can label them.
    //
    // RLS fix 2026-05-11: opportunities is service_role-only for reads.
    // The original query used the user-session client which silently got
    // 0 rows back and triggered the empty state on every load. Use a
    // service-role client for the fallback read.
    let usedFallback = false;
    if (opportunitiesWithIds.length === 0) {
      const fallbackServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const fallbackClient = fallbackServiceKey
        ? createServiceRoleClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            fallbackServiceKey,
            { auth: { persistSession: false } },
          )
        : supabase; // Last-ditch fallback: hit user-session client and
                    // accept that RLS will likely return [].
      // Best-effort filter: match on remote-friendly if the user wants
      // remote, else open it up. Limit to recently-seen, active, non-flagged.
      let q = fallbackClient
        .from("opportunities")
        .select("id, title, company, location, description, url, job_type, is_remote, salary_min, salary_max, salary_currency, posted_at, first_seen_at, is_flagged, flag_reasons, quality_score, source")
        .eq("is_active", true)
        .or("is_flagged.is.null,is_flagged.eq.false")
        .order("first_seen_at", { ascending: false })
        .limit(30);
      // user_profiles.work_mode is an ARRAY column (e.g. ['remote'],
      // ['hybrid','onsite']). The earlier `as string` cast lied — at runtime
      // .toLowerCase() on an array TypeErrors. UAT 2026-05-11 saw
      // /api/jobs/agent return 500 with that exact stack.
      const workModes = Array.isArray(up?.work_mode)
        ? (up!.work_mode as unknown as string[])
        : [];
      const wantsRemote = workModes.some(m => typeof m === "string" && m.toLowerCase() === "remote");
      if (wantsRemote) {
        q = q.eq("is_remote", true);
      }
      const { data: fallbackRows, error: fallbackErr } = await q;
      if (!fallbackErr && Array.isArray(fallbackRows) && fallbackRows.length > 0) {
        usedFallback = true;
        // Shape rows to match OpportunityResult so the UI doesn't care
        // they came from the fallback path.
        opportunitiesWithIds = fallbackRows.map((r) => ({
          id:               r.id as string, // already a UUID
          title:            r.title as string,
          company:          r.company as string,
          location:         (r.location as string | null) ?? "",
          description:      cleanJobDescription(r.description as string | null),
          url:              (r.url as string | null) ?? "",
          type:             (r.job_type as string | null) ?? "",
          is_remote:        Boolean(r.is_remote),
          salary_min:       (r.salary_min as number | null) ?? null,
          salary_max:       (r.salary_max as number | null) ?? null,
          salary_currency:  (r.salary_currency as string | null) ?? null,
          first_seen_at:    (r.first_seen_at as string | null)
                              ?? (r.posted_at as string | null)
                              ?? null,
          is_flagged:       Boolean(r.is_flagged),
          flag_reasons:     (r.flag_reasons as string[] | null) ?? null,
          quality_score:    (r.quality_score as number | null) ?? null,
          // ATS-sourced rows are already a clean company URL — wire it to
          // apply_url_company so the OpportunityCard renders the direct
          // "Apply at <Company>" button instead of the Google fallback.
          apply_url_company: (r.source as string | null) === "ats"
            ? ((r.url as string | null) ?? null)
            : null,
        })) as typeof opportunitiesWithIds;
      }
    }

    // ──────────────────────────────────────────────────────────────
    // Wave 3: quality filter + scoring enrichment (azjobs port)
    //
    // 1. Run every job through `scoreJobQuality` (v2 anti-fraud signals).
    //    Drop anything < FILTER_THRESHOLD (60) from the curated feed.
    //    Keep flag_reasons + quality_score on survivors so the UI can
    //    surface caution chips on the rows that scraped through.
    // 2. Enrich survivors with `scoreJobs` from jobMatching.ts — adds
    //    responseProbability, decisionScore, effortEstimate, smartTag,
    //    flags, trustScore, trustLevel, strategy.
    // 3. Sort by decisionScore descending — the new primary ranking key.
    //
    // The AI fit-scoring pipeline (fitScoreService.scoreFitBatch) is
    // kicked off client-side from /jobs against the IDs we return here.
    // We do NOT clobber any fit_score the AI later writes back.
    // ──────────────────────────────────────────────────────────────
    const beforeQuality = opportunitiesWithIds.length;
    const qualityFiltered = opportunitiesWithIds.flatMap(o => {
      const q = scoreJobQuality(o);
      if (q.quality_score < FILTER_THRESHOLD) return [];
      // Surface any new flag reasons alongside whatever was already there.
      const mergedFlags = Array.from(new Set([
        ...(o.flag_reasons ?? []),
        ...q.flag_reasons,
      ]));
      return [{
        ...o,
        quality_score: q.quality_score,
        is_flagged:    (o.is_flagged ?? false) || q.high_risk,
        flag_reasons:  mergedFlags.length > 0 ? mergedFlags : undefined,
      }];
    });
    const droppedByQuality = beforeQuality - qualityFiltered.length;
    if (droppedByQuality > 0) {
      console.info(`[jobs/agent] quality filter dropped ${droppedByQuality}/${beforeQuality} jobs (< ${FILTER_THRESHOLD})`);
    }

    const enrichedCurated = scoreJobs({
      jobs:    qualityFiltered,
      skills,
      salaryMin: undefined,
      salaryMax: undefined,
      remotePreferred: Array.isArray(up?.work_mode) && (up!.work_mode as unknown as string[]).some(m => typeof m === "string" && m.toLowerCase() === "remote"),
    });
    enrichedCurated.sort((a, b) => (b.decisionScore ?? 0) - (a.decisionScore ?? 0));
    // Task 2: cap the curated feed at the top 25 after sort. With Adzuna
    // + ATS merged this can balloon past 30; the UI is built for ~25.
    const TOP_N = 25;
    enrichedCurated.length = Math.min(enrichedCurated.length, TOP_N);
    // Strip the EnrichedJob-only `flags` field (structured FakeJobFlag[])
    // before assigning back — `flag_reasons` already carries the human
    // labels the UI uses, so the structured `flags` is redundant on the
    // wire. `as unknown as` widens through the shape mismatch.
    opportunitiesWithIds = enrichedCurated.map(({ flags: _flags, ...rest }) => rest) as unknown as typeof opportunitiesWithIds;

    return NextResponse.json({
      opportunities: opportunitiesWithIds,
      total:         opportunitiesWithIds.length,
      planCount:     plans.length,
      usedFallback,
      // Strip rationale from client payload — only the planner needs it.
      // We keep a shortened summary for transparency without leaking the
      // full keyword strategy.
      agent: {
        plansRun:    plans.length,
        rawTotal:    aggregateTotal,
        beforeFilter: merged.length,
        hidden:      validated.hiddenCount,
        flagged:     validated.flaggedCount,
      },
      sourceFallback: allFallback,
      // 2026-06-18 — per-source counts summed across all plans.
      sources: sourceCounts,
      // 2026-06-20 — quality-gate filtered postings (Brief Task 3).
      filtered: filteredAcc,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Agent search failed";
    console.error("[jobs/agent] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
