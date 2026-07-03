/**
 * POST /api/jobs/search-db
 *
 * feat/jobs-search-db (Task 2) — DB-first search over the ats_jobs table
 * populated by the ingest-ats-direct edge function (~every 4h). Falls back
 * to the live aggregator when DB returns < 5 rows so the user always has
 * enough coverage.
 *
 * Auth: 401 for unauthenticated. Rate-limit not applied (read-only).
 *
 * Body:
 *   { query: string, location?: string, remote?: boolean,
 *     sources?: string[], limit?: number (default 50, max 100),
 *     offset?: number (default 0) }
 *
 * Response:
 *   { opportunities: OpportunityResult[],
 *     total: number,
 *     source: "database" | "live" | "mixed",
 *     sources: Record<string, number>,   // per-ATS count
 *     fromCache: boolean,                // true when source === "database"
 *     freshestAt: string | null }        // MAX(last_seen_at) from the DB hits
 */

import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { withCrossSubdomainCookie } from "@/lib/supabase-cookie-options";
import { searchOpportunities } from "@/services/integrations/opportunityAggregator";
import type { OpportunityResult, OpportunitySearchFilters } from "@/services/opportunityTypes";
import { applyQualityGate } from "@/services/integrations/qualityGate";
import { isValidApplyUrl } from "@/services/integrations/applyUrlValidator";
import { extractUserProfile } from "@/services/scoring/profileExtractor";
import { scoreOpportunityAgainstProfile, type ProfileFitScore } from "@/services/scoring/profileScorer";


// fix/jobs-multi-target-roles Requirement B — flatten ProfileFitScore
// into the compact fit_breakdown shape rendered by OpportunityCard.
function pfsToBreakdown(pfs: ProfileFitScore) {
  return {
    targetRole:          pfs.breakdown.targetRoleMatch,
    skills:              pfs.breakdown.skillsMatch,
    seniority:           pfs.breakdown.seniorityMatch,
    experience:          pfs.breakdown.experienceMatch,
    keywords:            pfs.breakdown.keywordDensity,
    targetRoleBestMatch: pfs.signals.targetRoleBestMatch,
  } as const;
}
const MIN_DB_RESULTS = 5;    // fall back to live below this
const DEFAULT_LIMIT  = 50;
const MAX_LIMIT      = 100;

async function makeSupabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, withCrossSubdomainCookie(options))
          );
        },
      },
    }
  );
}

interface SearchDbBody {
  query?:       string;
  /**
   * fix/jobs-smart-apply-issues Fix 6 — target roles are now sent as a
   * structured array (chip row on /opportunities), not as a raw OR-joined
   * tsquery string in `query`. Server combines them: (role1 | role2 | …)
   * AND (query tokens) when both present.
   */
  targetRoles?: string[];
  location?:    string;
  remote?:      boolean;
  sources?:     string[];
  limit?:       number;
  offset?:      number;
}

interface AtsJobRow {
  id:              string;
  source:          string;
  external_id:     string | null;
  company:         string;
  title:           string;
  location:        string | null;
  description:     string | null;
  apply_url:       string;
  salary_min:      number | null;
  salary_max:      number | null;
  salary_currency: string | null;
  employment_type: string | null;
  remote:          boolean | null;
  posted_at:       string | null;
  last_seen_at:    string | null;
}

function rowToOpportunity(row: AtsJobRow): OpportunityResult {
  return {
    id:              `ats-${row.source}-${row.id}`,
    title:           row.title,
    company:         row.company,
    location:        row.location ?? "",
    type:            row.employment_type ?? "",
    description:     row.description ?? "",
    url:             row.apply_url,
    matchReason:     "",
    salary_min:      row.salary_min,
    salary_max:      row.salary_max,
    salary_currency: row.salary_currency,
    is_remote:       !!row.remote,
    source:          row.source,
    first_seen_at:   row.posted_at ?? row.last_seen_at ?? undefined,
  };
}

export async function POST(req: NextRequest) {
  const supabase = await makeSupabaseServer();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: SearchDbBody;
  try {
    body = (await req.json()) as SearchDbBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const query        = (body.query ?? "").trim();
  const targetRoles  = Array.isArray(body.targetRoles)
    ? body.targetRoles.map(r => (r ?? "").trim()).filter(Boolean)
    : [];
  const location     = (body.location ?? "").trim();
  const remote   = !!body.remote;
  const sources  = Array.isArray(body.sources) ? body.sources : undefined;
  const limit    = Math.min(MAX_LIMIT, Math.max(1, body.limit  ?? DEFAULT_LIMIT));
  const offset   = Math.max(0, body.offset ?? 0);

  // 1) DB query — Postgres full-text search on title, ilike on location,
  //    boolean on remote. Order by posted_at desc so freshest floats up.
  let q = supabase
    .from("ats_jobs")
    .select("id, source, external_id, company, title, location, description, apply_url, salary_min, salary_max, salary_currency, employment_type, remote, posted_at, last_seen_at", { count: "estimated" })
    .eq("is_active", true)
    .order("posted_at", { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1);

  // fix/jobs-smart-apply-issues Fix 6 — combine structured targetRoles
  // (OR) with the free-text refine `query` (AND). Legacy back-compat: if
  // targetRoles is empty and `query` still looks like an OR-joined string
  // (e.g. "Director of Security OR CISO"), split and treat as targetRoles.
  const tokensOf = (s: string) => s.split(/\s+/).filter(Boolean);
  const rolesFrag = (roles: string[]) =>
    roles.map(r => {
      const tokens = tokensOf(r);
      return tokens.length === 1 ? tokens[0] : "(" + tokens.join(" & ") + ")";
    }).join(" | ");

  let effectiveRoles = targetRoles;
  let effectiveQuery = query;
  if (effectiveRoles.length === 0 && /\s+OR\s+/i.test(query)) {
    effectiveRoles = query.split(/\s+OR\s+/i).map(s => s.trim()).filter(Boolean);
    effectiveQuery = "";
  }

  if (effectiveRoles.length > 0 && effectiveQuery) {
    const combined = "(" + rolesFrag(effectiveRoles) + ") & (" + tokensOf(effectiveQuery).join(" & ") + ")";
    q = q.textSearch("title", combined, { type: "plain", config: "english" });
  } else if (effectiveRoles.length > 0) {
    const roles = rolesFrag(effectiveRoles);
    q = q.textSearch("title", roles, { type: "plain", config: "english" });
  } else if (effectiveQuery) {
    q = q.textSearch("title", effectiveQuery, { type: "websearch", config: "english" });
  }
  if (location && location.toLowerCase() !== "remote") q = q.ilike("location", `%${location}%`);
  if (remote || location.toLowerCase() === "remote")   q = q.eq("remote", true);
  if (sources && sources.length > 0)                   q = q.in("source", sources);

  const { data, count, error } = await q;
  if (error) {
    console.warn("[search-db] Supabase error:", error.message);
    // Degrade gracefully to a live search
    return liveFallback(query, location, remote, limit);
  }

  // fix/jobs-ux-feedback Fix 3 — pre-filter company-level career-page
  // URLs before the quality gate.
  const rawRows = ((data ?? []) as AtsJobRow[]).filter(r => isValidApplyUrl(r.apply_url));
  const dbOpps: OpportunityResult[] = [];
  for (const row of rawRows) {
    const opp = rowToOpportunity(row);
    const gate = applyQualityGate(opp);
    if (gate.passed) dbOpps.push(opp);
  }

  // Freshness signal
  let freshestAt: string | null = null;
  const perSource: Record<string, number> = {};
  for (const row of rawRows) {
    if (row.last_seen_at && (!freshestAt || row.last_seen_at > freshestAt)) {
      freshestAt = row.last_seen_at;
    }
    perSource[row.source] = (perSource[row.source] ?? 0) + 1;
  }

  // feat/jobs-opportunity-scoring Task 3 — profile-aware scoring +
  // rank + filter. Extract the user's profile ONCE per request, score
  // every job, sort descending by profileFitScore.total, filter clearly
  // irrelevant hits (total < 20). Skips gracefully when no profile.
  const profile = await extractUserProfile(supabase, user.id);
  let profileScored: Array<OpportunityResult & { profileFitScore?: ProfileFitScore }> = dbOpps;
  if (profile) {
    profileScored = dbOpps.map(opp => {
      const pfs = scoreOpportunityAgainstProfile(opp, profile);
      return { ...opp, profileFitScore: pfs, fit_score: pfs.total, fit_breakdown: pfsToBreakdown(pfs) };
    });
    profileScored = profileScored
      .filter(o => (o.profileFitScore?.total ?? 0) >= 40)
      .sort((a, b) => (b.profileFitScore?.total ?? 0) - (a.profileFitScore?.total ?? 0));
  }

  // 2) If fewer than MIN_DB_RESULTS survived the gate, supplement with a
  //    live aggregator search. Dedupe by apply_url so a DB hit + live hit
  //    for the same posting merges to one row (DB wins because it's ordered
  //    first).
  if (profileScored.length < MIN_DB_RESULTS) {
    const live = await runLiveAggregator(query, location, remote, limit);
    const seen = new Set(profileScored.map(o => (o.url || "").toLowerCase()));
    const merged: Array<OpportunityResult & { profileFitScore?: ProfileFitScore }> = [...profileScored];
    for (const opp of live) {
      const key = (opp.url || "").toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      // fix/jobs-multi-target-roles Requirement A — score EVERY live-fallback
      // opp against the profile too. Live-aggregator entries arrive without
      // fit_score, but we already have the profile in scope.
      if (profile) {
        let pfs: ProfileFitScore | null = null;
        try { pfs = scoreOpportunityAgainstProfile(opp, profile); } catch {}
        merged.push({
          ...opp,
          fit_score:       pfs?.total ?? 0,
          profileFitScore: pfs ?? undefined,
          fit_breakdown:   pfs ? pfsToBreakdown(pfs) : null,
        });
      } else {
        merged.push(opp);
      }
    }
    // Re-sort merged by fit_score DESC so scored items float to the top
    if (profile) {
      merged.sort((a, b) => (b.fit_score ?? 0) - (a.fit_score ?? 0));
    }
    return NextResponse.json({
      opportunities: merged,
      total:         merged.length,
      source:        profileScored.length > 0 ? "mixed" : "live",
      sources:       perSource,
      fromCache:     false,
      freshestAt,
      profileScored: !!profile,
    });
  }

  return NextResponse.json({
    opportunities: profileScored,
    total:         count ?? profileScored.length,
    source:        "database",
    sources:       perSource,
    fromCache:     true,
    freshestAt,
    profileScored: !!profile,
  });
}

// ── Live-fallback path ────────────────────────────────────────────────

async function runLiveAggregator(
  query:    string,
  location: string,
  remote:   boolean,
  limit:    number,
): Promise<OpportunityResult[]> {
  const filters: OpportunitySearchFilters = {
    skills: [], jobTypes: [], location: location || (remote ? "Remote" : ""),
    query, careerLevel: "mid", targetTitles: [],
    searchSource: "all", minFitScore: 0, showFlagged: false,
  };
  try {
    const res = await searchOpportunities({ filters, limit });
    return res.opportunities;
  } catch {
    return [];
  }
}

function liveFallback(
  query:    string,
  location: string,
  remote:   boolean,
  limit:    number,
): Promise<NextResponse> {
  return runLiveAggregator(query, location, remote, limit).then((opps) =>
    NextResponse.json({
      opportunities: opps,
      total:         opps.length,
      source:        "live" as const,
      sources:       {},
      fromCache:     false,
      freshestAt:    null,
    })
  );
}
