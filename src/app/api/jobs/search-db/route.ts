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
import { retrieveByTitle, buildTsqueryArg } from "@/services/retrieval/retrieveByTitle";


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
  // ── fix/jobs-curation-family-precision PR 2 — delegate to retrieveByTitle ──
  // The tsquery construction is identical (buildTsqueryArg uses the same
  // plain/websearch modes and (tok & tok) | ... OR form). This preserves
  // byte-identical results per the regression baseline at
  // docs/regression/search-baseline-2026-07.json.
  //
  // fix/jobs-smart-apply-issues Fix 6 — combine structured targetRoles
  // (OR) with the free-text refine `query` (AND). Legacy back-compat: if
  // targetRoles is empty and `query` still looks like an OR-joined string
  // (e.g. "Director of Security OR CISO"), split and treat as targetRoles.
  let effectiveRoles = targetRoles;
  let effectiveQuery = query;
  if (effectiveRoles.length === 0 && /\s+OR\s+/i.test(query)) {
    effectiveRoles = query.split(/\s+OR\s+/i).map(s => s.trim()).filter(Boolean);
    effectiveQuery = "";
  }

  // Build the SAME tsquery arg that the hand-built path produced.
  //   roles + query → "(roleFrag) & (queryTokens)"    — plain mode
  //   roles only    → "(role1_tokens) | (role2_tokens)" — plain mode (via buildTsqueryArg multi)
  //   query only    → websearch mode with the raw phrase
  let candidates: Awaited<ReturnType<typeof retrieveByTitle>> = [];
  if (effectiveRoles.length > 0 && effectiveQuery) {
    // fix/jobs-tsquery-mode — the pre-fix "combined" path built a
    //   `(rolesArg) & (queryTokens)` string under `type:"plain"`,
    //   which plainto_tsquery treats as literal characters. Fixed:
    //   we get the roles-OR match via websearch on the roles arg,
    //   then AND-filter the returned candidates in JS by requiring
    //   every query token (case-insensitive) to appear in the title.
    //   websearch cannot express `(A OR B) AND C` — its parens are
    //   literal characters, and its implicit AND has looser
    //   precedence than OR — so the AND is enforced client-side.
    const { arg: rolesArg, mode: rolesMode } = buildTsqueryArg(effectiveRoles);
    let rq = supabase
      .from("ats_jobs")
      .select("id, source, external_id, company, title, location, description, apply_url, direct_apply_url, salary_min, salary_max, salary_currency, employment_type, remote, posted_at, last_seen_at, extracted_skills, extracted_seniority, seniority_tier")
      .eq("is_active", true);
    if (rolesArg) rq = rq.textSearch("title", rolesArg, { type: rolesMode, config: "english" });
    if (location && location.toLowerCase() !== "remote") rq = rq.ilike("location", `%${location}%`);
    if (remote || location.toLowerCase() === "remote")   rq = rq.eq("remote", true);
    if (sources && sources.length > 0)                   rq = rq.in("source", sources);
    // Over-fetch so the in-memory AND-filter still returns >= limit
    // rows even when the query tokens knock out ~half the roles hits.
    const overFetch = Math.min(500, (offset + limit) * 3);
    const { data: rawData } = await rq
      .order("posted_at", { ascending: false, nullsFirst: false })
      .range(0, overFetch - 1);
    const queryTokens = effectiveQuery.toLowerCase().split(/\s+/).filter(Boolean);
    const filtered = (rawData ?? []).filter((row: { title: string | null }) => {
      const t = (row.title ?? "").toLowerCase();
      return queryTokens.every(qt => t.includes(qt));
    });
    candidates = filtered.slice(offset, offset + limit) as unknown as Awaited<ReturnType<typeof retrieveByTitle>>;
  } else if (effectiveRoles.length > 0) {
    // roles only — flat mode.
    candidates = await retrieveByTitle(
      supabase,
      { titleQueries: effectiveRoles },
      { isActive: true, remote, location, sources },
      limit,
    );
  } else if (effectiveQuery) {
    candidates = await retrieveByTitle(
      supabase,
      { titleQueries: [effectiveQuery] },
      { isActive: true, remote, location, sources },
      limit,
    );
  } else {
    // No query and no roles → simple recent-listings feed.
    candidates = await retrieveByTitle(
      supabase,
      { titleQueries: [] },
      { isActive: true, remote, location, sources },
      limit,
    );
  }

  // fix/jobs-ux-feedback Fix 3 — pre-filter company-level career-page
  // URLs before the quality gate.
  // Convert the Candidate shape back to AtsJobRow-shaped for the existing
  // downstream rowToOpportunity + applyQualityGate pipeline.
  const rawRows = candidates
    .map(c => ({
      // extract the DB-side id from the "db-<uuid>" prefix
      id:              (c.id ?? "").toString().replace(/^db-/, ""),
      source:          c.source ?? "",
      external_id:    null,
      company:         c.company,
      title:           c.title,
      location:        c.location ?? null,
      description:     c.description ?? null,
      apply_url:       c.url,
      direct_apply_url: null,
      salary_min:      c.salary_min ?? null,
      salary_max:      c.salary_max ?? null,
      salary_currency: c.salary_currency ?? null,
      employment_type: c.type ?? null,
      remote:          !!c.is_remote,
      posted_at:       c.first_seen_at ?? null,
      last_seen_at:    c.first_seen_at ?? null,
    })) as unknown as AtsJobRow[];
  const count = candidates.length;
  const rawRowsFiltered = rawRows.filter(r => isValidApplyUrl(r.apply_url));
  const dbOpps: OpportunityResult[] = [];
  for (const row of rawRowsFiltered) {
    const opp = rowToOpportunity(row);
    const gate = applyQualityGate(opp);
    if (gate.passed) dbOpps.push(opp);
  }

  // Freshness signal
  let freshestAt: string | null = null;
  const perSource: Record<string, number> = {};
  for (const row of rawRowsFiltered) {
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
