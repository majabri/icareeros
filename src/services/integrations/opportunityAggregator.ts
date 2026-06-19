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
}

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

  // Sort by fit_score desc, then quality_score desc
  merged.sort((a, b) => {
    const fitDiff = (b.fit_score ?? 0) - (a.fit_score ?? 0);
    if (fitDiff !== 0) return fitDiff;
    return (b.quality_score ?? 0) - (a.quality_score ?? 0);
  });

  return {
    opportunities: merged.slice(0, limit),
    total:         merged.length,
    sources: {
      ...(linkedInRes ? { linkedin: { count: linkedInRes.opportunities.length, fallback: linkedInRes.fallback } } : {}),
      ...(indeedRes   ? { indeed:   { count: indeedRes.opportunities.length,   fallback: indeedRes.fallback   } } : {}),
      ...(dbRes       ? { database: { count: dbRes.opportunities.length                                       } } : {}),
      ...(adzunaRes   ? { adzuna:   { count: adzunaRes.opportunities.length,   fallback: adzunaRes.fallback   } } : {}),
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
