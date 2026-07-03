/**
 * POST /api/jobs/for-you — reads pre-computed user_job_recommendations.
 *
 * feat/jobs-serve-from-cache Task 4.
 * Was: live curator fan-out per request (~600-1000ms).
 * Now: indexed SELECT from user_job_recommendations JOIN ats_jobs
 *      (~30-80ms typical).
 *
 * Fallback: when NO recommendations exist for this user, we invoke the
 * curate-user-recommendations edge function synchronously and return the
 * result. New users therefore still see something on first visit.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { withCrossSubdomainCookie } from "@/lib/supabase-cookie-options";
import type { CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { curateForYou } from "@/services/curator/forYouCurator";

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

interface CachedRow {
  fit_score:    number;
  tier:         "strongMatch" | "worthConsidering" | "stretch";
  match_reason: string | null;
  computed_at:  string;
  job:          {
    id:              string;
    title:           string;
    company:         string;
    location:        string | null;
    description:     string | null;
    apply_url:       string;
    direct_apply_url: string | null;
    salary_min:      number | null;
    salary_max:      number | null;
    salary_currency: string | null;
    employment_type: string | null;
    remote:          boolean;
    posted_at:       string | null;
    last_seen_at:    string | null;
    extracted_skills: string[] | null;
    source:          string;
  } | null;
}

function toOpportunityLike(row: CachedRow) {
  const j = row.job;
  if (!j) return null;
  return {
    id:              `db-${j.id}`,
    title:           j.title,
    company:         j.company,
    location:        j.location ?? "",
    type:            j.employment_type ?? "",
    description:     j.description ?? "",
    url:             j.direct_apply_url ?? j.apply_url,
    matchReason:     row.match_reason ?? "",
    salary_min:      j.salary_min,
    salary_max:      j.salary_max,
    salary_currency: j.salary_currency ?? undefined,
    is_remote:       !!j.remote,
    source:          j.source,
    first_seen_at:   j.posted_at ?? j.last_seen_at ?? undefined,
    fit_score:       row.fit_score,
  };
}

export async function POST(_req: NextRequest) {
  const supabase = await makeSupabaseServer();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Fast path: SELECT from user_job_recommendations JOIN ats_jobs
    const { data: cached, error } = await supabase
      .from("user_job_recommendations")
      .select(`
        fit_score,
        tier,
        match_reason,
        computed_at,
        job:ats_jobs!inner(
          id, title, company, location, description, apply_url, direct_apply_url,
          salary_min, salary_max, salary_currency, employment_type, remote,
          posted_at, last_seen_at, extracted_skills, source
        )
      `)
      .eq("user_id", user.id)
      .order("fit_score", { ascending: false });
    if (error) throw error;

    const rows = (cached ?? []) as unknown as CachedRow[];

    if (rows.length === 0) {
      // Cold path: no cached recs. Run the in-process curator so this
      // user always sees something on first visit. Fire-and-forget POST
      // to the edge function warms the cache for next time.
      const result = await curateForYou(user.id, supabase);
      const warmUrl = process.env.NEXT_PUBLIC_SUPABASE_URL + "/functions/v1/curate-user-recommendations";
      const svc = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (svc) {
        void fetch(warmUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": "Bearer " + svc },
          body: JSON.stringify({ userId: user.id, trigger: "manual" }),
        }).catch(() => {});
      }
      return NextResponse.json(result, {
        headers: { "X-Recommendations-Computed-At": new Date().toISOString(), "X-Recommendations-Source": "fallback-inline" },
      });
    }

    // Group by tier
    const strongMatch: unknown[] = [];
    const worthConsidering: unknown[] = [];
    const stretch: unknown[] = [];
    let latestComputed = "";
    for (const row of rows) {
      const opp = toOpportunityLike(row);
      if (!opp) continue;
      if (row.tier === "strongMatch")           strongMatch.push(opp);
      else if (row.tier === "worthConsidering") worthConsidering.push(opp);
      else                                       stretch.push(opp);
      if (row.computed_at > latestComputed) latestComputed = row.computed_at;
    }

    // Deterministic tier explanations — same phrasing as PR #352.
    const targetRole = "your target role";
    function tierExplanation(tier: "strongMatch" | "worthConsidering" | "stretch", jobs: unknown[]) {
      if (jobs.length === 0) return "";
      if (tier === "strongMatch")
        return `${jobs.length} ${jobs.length === 1 ? "role" : "roles"} closely aligned with ${targetRole}.`;
      if (tier === "worthConsidering")
        return `${jobs.length} adjacent ${jobs.length === 1 ? "opportunity" : "opportunities"} worth exploring.`;
      return `${jobs.length} stretch ${jobs.length === 1 ? "opportunity" : "opportunities"} that push toward more senior or specialised roles.`;
    }

    const body = {
      strongMatch,
      worthConsidering,
      stretch,
      tierExplanations: {
        strongMatch:      tierExplanation("strongMatch", strongMatch),
        worthConsidering: tierExplanation("worthConsidering", worthConsidering),
        stretch:          tierExplanation("stretch", stretch),
      },
      totalCandidates: rows.length,
      metadata: {
        expandedRoles:     [],
        skillsUsed:        [],
        exclusionsApplied: 0,
      },
    };
    return NextResponse.json(body, {
      headers: {
        "X-Recommendations-Computed-At": latestComputed || new Date().toISOString(),
        "X-Recommendations-Source":      "cache",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Curator failed";
    console.error("[for-you] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
