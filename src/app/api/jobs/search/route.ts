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
import type { CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { searchAdzuna, type AdzunaSearchParams } from "@/services/integrations/adzunaAdapter";

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
            cookieStore.set(name, value, options)
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

      // Pick the strongest signal: target_roles[0] > headline > current_position
      const what =
        targetRoles[0]?.trim() ||
        headline.trim() ||
        currentPos.trim() ||
        "";

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
          ? "No target role / headline / current position to auto-search. Set target roles in /mycareer/preferences."
          : "Please provide a search keyword.",
      });
    }

    const result = await searchAdzuna(params);

    // Upsert into the opportunities table so fit-scoring (which keys off the
    // DB UUID) can match these listings. Conflict target is (source, source_id).
    let opportunitiesWithDbIds = result.opportunities;
    if (result.opportunities.length > 0) {
      const rows = result.opportunities.map(o => ({
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

      const { data: upserted, error: upsertErr } = await supabase
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
        opportunitiesWithDbIds = result.opportunities.map(o => {
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
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Search failed";
    console.error("[/api/jobs/search] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
