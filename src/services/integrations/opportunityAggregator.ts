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
import { createClient }   from "@/lib/supabase";
import type { OpportunityResult, OpportunitySearchFilters } from "@/services/opportunityTypes";

export type SearchSource = "all" | "linkedin" | "indeed" | "database";

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

  const perSource = Math.ceil(limit / (includeAll ? 3 : sources.length));

  // Fan out searches in parallel
  const [linkedInRes, indeedRes, dbRes] = await Promise.all([
    includeLinkedIn
      ? searchLinkedIn({ filters, limit: perSource, offset })
      : Promise.resolve(null),
    includeIndeed
      ? searchIndeed({ filters, limit: perSource, offset })
      : Promise.resolve(null),
    includeDatabase
      ? searchDatabase(filters, perSource, offset)
      : Promise.resolve(null),
  ]);

  // Merge and deduplicate by URL (first seen wins)
  const seen = new Set<string>();
  const merged: OpportunityResult[] = [];

  for (const result of [linkedInRes, indeedRes, dbRes]) {
    if (!result) continue;
    for (const opp of result.opportunities) {
      const key = opp.url || `${opp.company}::${opp.title}`;
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
    },
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
