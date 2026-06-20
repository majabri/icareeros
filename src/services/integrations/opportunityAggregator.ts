/**
 * iCareerOS — Opportunity Aggregator
 *
 * Unified search across all job sources (LinkedIn, Indeed, internal database).
 * Deduplicates by URL, merges results, and respects per-source limits.
 *
 * This is the single entry point for opportunity search consumers.
 * Replace integrationStubs.ts calls with this.
 */

import { searchLinkedIn } from "./linkedInAdapter";
import { searchIndeed }   from "./indeedAdapter";
import { searchAdzuna, type AdzunaSearchParams } from "./adzunaAdapter";
import { applyQualityGate } from "./qualityGate";
import {
  inferSeniority,
  inferTargetSeniority,
  seniorityScore,
  type Seniority,
} from "./seniorityInference";
import { createClient }   from "@/lib/supabase";
import type { OpportunityResult, OpportunitySearchFilters } from "@/services/opportunityTypes";

export type SearchSource = "all" | "linkedin" | "indeed" | "database" | "adzuna";

export interface AggregatedSearchOptions {
  filters: OpportunitySearchFilters;
  sources?: SearchSource[];
  limit?: number;
  offset?: number;
}

export interface AggregatedSearchResult {
  opportunities: OpportunityResult[];
  total: number;
  sources: {
    linkedin?: { count: number; fallback: boolean };
    indeed?:   { count: number; fallback: boolean };
    database?: { count: number };
    adzuna?:   { count: number; fallback: boolean };
  };
  /**
   * Quality gate output (Brief Task 1). Counts and per-job reasons for
   * postings dropped before the sort. The page surfaces these via the
   * "Filtered out N low-quality postings" link.
   */
  filtered: {
    count: number;
    reasons: Array<{ title: string; company: string; reason: string }>;
  };
}

// ── Source trust weights (Brief Task 16) ──────────────────────────────────
//
// Applied as a multiplier on the per-job quality_score before sort. ATS
// direct + curated DB rank highest; aggregators rank lower; unknown source
// lands at 0.5 so anything without a `source` tag bubbles to the bottom.
const SOURCE_WEIGHTS: Record<string, number> = {
  greenhouse: 1.0,
  lever:      1.0,
  ashby:      1.0,
  linkedin:   0.9,
  hackernews: 0.9,
  adzuna:     0.8,
  indeed:     0.8,
  database:   0.75,
  ats:        0.95,    // canonical apply URL — close to direct ATS
  rss:        0.7,
  unknown:    0.5,
};

function sourceWeight(source: string | undefined): number {
  if (!source) return SOURCE_WEIGHTS.unknown;
  return SOURCE_WEIGHTS[source.toLowerCase()] ?? SOURCE_WEIGHTS.unknown;
}

// Allow callers to read target seniority once, then enrich every job.
// Each OpportunityResult gains an optional seniorityScore at runtime; we
// thread it through the existing field rather than introducing a new one
// to keep the type contract additive (the existing `seniority?: string`
// field on OpportunityResult is already used by adjacent code).

/**
 * Search opportunities across all enabled sources, deduplicate, and return.
 */
export async function searchOpportunities(
  options: AggregatedSearchOptions
): Promise<AggregatedSearchResult> {
  const {
    filters,
    sources = ["all"],
    limit = 40,
    offset = 0,
  } = options;

  const includeAll      = sources.includes("all");
  const includeLinkedIn = includeAll || sources.includes("linkedin");
  const includeIndeed   = includeAll || sources.includes("indeed");
  const includeDatabase = includeAll || sources.includes("database");
  const includeAdzuna   = includeAll || sources.includes("adzuna");

  // Per-source budget. We now fan out to FOUR sources by default, so
  // include Adzuna in the divisor when "all" was requested.
  const perSource = Math.ceil(limit / (includeAll ? 4 : sources.length));

  // Fan out in parallel. Use Promise.allSettled so a single-source failure
  // (e.g. Adzuna 429, Indeed edge-fn outage) doesn't sink the whole batch.
  const [linkedInSettled, indeedSettled, dbSettled, adzunaSettled] = await Promise.allSettled([
    includeLinkedIn
      ? searchLinkedIn({ filters, limit: perSource, offset })
      : Promise.resolve(null),
    includeIndeed
      ? searchIndeed({ filters, limit: perSource, offset })
      : Promise.resolve(null),
    includeDatabase
      ? searchDatabase(filters, perSource, offset)
      : Promise.resolve(null),
    includeAdzuna
      ? searchAdzuna(filtersToAdzunaParams(filters, perSource, offset))
      : Promise.resolve(null),
  ]);

  // Unwrap settled results. Failures are logged but degrade silently
  // to an empty/fallback shape so the aggregator's contract is preserved.
  const linkedInRes = unwrap(linkedInSettled, "linkedin");
  const indeedRes   = unwrap(indeedSettled,   "indeed");
  const dbRes       = unwrap(dbSettled,       "database");
  const adzunaRes   = unwrap(adzunaSettled,   "adzuna");

  // Merge and deduplicate by URL (first seen wins). Order matters — we
  // prefer LinkedIn → Indeed → DB → Adzuna so the source that surfaces a
  // job first owns the dedupe key. Per-source counts below are reported
  // BEFORE dedupe so the page can show raw provider counts.
  const seen = new Set<string>();
  const merged: OpportunityResult[] = [];

  for (const result of [linkedInRes, indeedRes, dbRes, adzunaRes]) {
    if (!result) continue;
    for (const opp of result.opportunities) {
      const key = (opp.url || `${opp.company}::${opp.title}`).toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(opp);
      }
    }
  }

  // ── Quality gate (Brief Task 1) ─────────────────────────────────────
  // Run every deduped opportunity through the deterministic gate. Keep
  // the passers; record per-job reason for the page's "Filtered out N
  // low-quality postings" surface.
  const passed: OpportunityResult[] = [];
  const filteredReasons: Array<{ title: string; company: string; reason: string }> = [];
  for (const opp of merged) {
    const gate = applyQualityGate(opp);
    if (gate.passed) {
      passed.push(opp);
    } else {
      filteredReasons.push({
        title:   opp.title,
        company: opp.company,
        reason:  gate.reason ?? "Quality gate failed",
      });
    }
  }

  // ── Seniority scoring (Brief Task 7) ────────────────────────────────
  // Compute a target seniority once, then enrich each surviving job with
  // a per-job seniority score. The score gets folded into the sort
  // multiplier below.
  const targetLevel = await loadTargetSeniority();
  const scored = passed.map((opp) => {
    const jobLevel = inferSeniority(`${opp.title} ${opp.seniority ?? ""}`);
    const score    = seniorityScore(jobLevel, targetLevel);
    return { opp, jobLevel, seniorityFit: score };
  });

  // ── Source weighting + composite sort (Brief Task 16) ───────────────
  // adjusted_score = (fit_score OR 0) * 100 + (quality_score OR 50) * source_weight + seniority_boost
  // Falls back to safe defaults so jobs without scores still rank
  // sensibly (database curated rows typically have quality_score, Adzuna
  // does not).
  scored.sort((a, b) => {
    const compose = (entry: typeof scored[number]) => {
      const fit  = entry.opp.fit_score      ?? 0;
      const qual = entry.opp.quality_score  ?? 50;
      const sw   = sourceWeight(entry.opp.source);
      const senBoost = (entry.seniorityFit - 0.7) * 25;  // ±7.5 nominal
      return fit * 100 + qual * sw + senBoost;
    };
    return compose(b) - compose(a);
  });

  // ── Stamp seniority back onto the returned objects ───────────────────
  // OpportunityResult.seniority is already a string field on the public
  // type; downstream consumers (cards / drawer) can render it. We also
  // expose the numeric fit via the existing `seniorityScore` symbol-name
  // collision is avoided because the type field is freeform.
  const enriched: OpportunityResult[] = scored.map(({ opp, jobLevel, seniorityFit }) => ({
    ...opp,
    seniority: jobLevel,
    // Stash the numeric fit on quality_score's neighbour. We piggyback on
    // the existing wire shape rather than introducing a new typed field
    // to keep this PR additive — the cards only need a sortable signal.
    quality_score: opp.quality_score !== undefined ? opp.quality_score : Math.round(seniorityFit * 100),
  }));

  return {
    opportunities: enriched.slice(0, limit),
    total:         enriched.length,
    sources: {
      ...(linkedInRes ? { linkedin: { count: linkedInRes.opportunities.length, fallback: linkedInRes.fallback } } : {}),
      ...(indeedRes   ? { indeed:   { count: indeedRes.opportunities.length,   fallback: indeedRes.fallback   } } : {}),
      ...(dbRes       ? { database: { count: dbRes.opportunities.length                                       } } : {}),
      ...(adzunaRes   ? { adzuna:   { count: adzunaRes.opportunities.length,   fallback: adzunaRes.fallback   } } : {}),
    },
    filtered: {
      count:   filteredReasons.length,
      reasons: filteredReasons.slice(0, 50),  // cap the wire payload
    },
  };
}

// ── Settled-result unwrapper ──────────────────────────────────────────────
//
// allSettled fixes the "one bad source breaks them all" problem we had with
// Promise.all. Each adapter already returns a fallback shape on its own
// errors, but Promise.allSettled handles the case where the adapter itself
// throws unexpectedly (e.g. network reset before the try/catch fires).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function unwrap(settled: PromiseSettledResult<any>, sourceName: string): any {
  if (settled.status === "fulfilled") return settled.value;
  console.warn(`[aggregator] ${sourceName} settle-rejected:`, settled.reason);
  // Mimic the adapter empty/fallback shape so the merge loop above is happy.
  if (sourceName === "database") return { opportunities: [], total: 0 };
  return { opportunities: [], total: 0, fallback: true };
}

// ── Filters → AdzunaSearchParams adapter ──────────────────────────────────
//
// OpportunitySearchFilters is the shared shape used by the LinkedIn/Indeed
// adapters via the search-jobs edge function. Adzuna's REST API takes a
// flatter shape (what/where/jobType/salary*) — translate here.
function filtersToAdzunaParams(
  filters: OpportunitySearchFilters,
  limit: number,
  offset: number,
): AdzunaSearchParams {
  const what = filters.query
    || filters.targetTitles?.[0]
    || filters.skills?.[0]
    || "";

  const isRemote = (filters.location ?? "").toLowerCase().includes("remote");

  const firstType = (filters.jobTypes ?? [])[0] ?? "";
  const jobType =
    firstType === "full-time" || firstType === "full_time" ? "full_time"
    : firstType === "part-time" || firstType === "part_time" ? "part_time"
    : firstType === "contract" ? "contract"
    : firstType === "permanent" ? "permanent"
    : undefined;

  const salaryMin = filters.salaryMin ? Number(filters.salaryMin) : undefined;
  const salaryMax = filters.salaryMax ? Number(filters.salaryMax) : undefined;

  return {
    what,
    where: isRemote ? undefined : filters.location || undefined,
    remote: isRemote,
    jobType,
    salaryMin: Number.isFinite(salaryMin) ? salaryMin : undefined,
    salaryMax: Number.isFinite(salaryMax) ? salaryMax : undefined,
    resultsPerPage: Math.min(50, Math.max(10, limit)),
    page: Math.floor(offset / Math.max(1, limit)) + 1,
    sortBy: "relevance",
  };
}

// ── Target seniority loader (Brief Task 7) ───────────────────────────────
//
// Read career_profiles.target_roles for the current user. Falls back to
// "unknown" silently — the aggregator already runs unauthenticated paths
// (e.g. health probes) so we must never throw here.
async function loadTargetSeniority(): Promise<Seniority> {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return "unknown";

    const { data } = await supabase
      .from("career_profiles")
      .select("target_roles")
      .eq("user_id", user.id)
      .maybeSingle();

    const raw = (data?.target_roles as string[] | null) ?? [];
    return inferTargetSeniority(raw);
  } catch {
    return "unknown";
  }
}

// ── Internal database search ───────────────────────────────────────────────

async function searchDatabase(
  filters: OpportunitySearchFilters,
  limit: number,
  offset: number
): Promise<{ opportunities: OpportunityResult[]; total: number }> {
  const supabase = createClient();

  try {
    const { data, error } = await supabase.functions.invoke<{
      opportunities: OpportunityResult[];
      total: number;
    }>("search-jobs", {
      body: { ...filters, source_filter: "database", limit, offset },
    });

    if (error || !data) {
      console.warn("[aggregator] database search error:", error);
      return { opportunities: [], total: 0 };
    }

    return {
      opportunities: data.opportunities ?? [],
      total:         data.total ?? 0,
    };
  } catch (err) {
    console.error("[aggregator] database search unexpected error:", err);
    return { opportunities: [], total: 0 };
  }
}
