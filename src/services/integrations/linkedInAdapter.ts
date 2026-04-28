/**
 * iCareerOS — LinkedIn Jobs Adapter
 *
 * Calls the `search-jobs` edge function with source="linkedin".
 * The edge function handles scraping/API access on the server side —
 * LinkedIn API calls never touch the browser.
 *
 * Direct LinkedIn API access requires a LinkedIn Partner Program account.
 * Until that is provisioned, the edge function falls back to the curated
 * opportunity database (source: "database").
 */

import { createClient } from "@/lib/supabase";
import type { OpportunityResult, OpportunitySearchFilters } from "@/services/opportunityTypes";

export interface LinkedInSearchOptions {
  filters: OpportunitySearchFilters;
  /** Maximum results to return (default: 20) */
  limit?: number;
  /** Offset for pagination (default: 0) */
  offset?: number;
}

export interface LinkedInSearchResult {
  opportunities: OpportunityResult[];
  total: number;
  source: "linkedin" | "database";
  fallback: boolean;
}

/**
 * Search LinkedIn Jobs via the search-jobs edge function.
 *
 * Falls back gracefully: if LinkedIn scraping is unavailable, the edge
 * function returns results from the curated database with source="database".
 */
export async function searchLinkedIn(
  options: LinkedInSearchOptions
): Promise<LinkedInSearchResult> {
  const supabase = createClient();
  const { filters, limit = 20, offset = 0 } = options;

  try {
    const { data, error } = await supabase.functions.invoke<{
      opportunities: OpportunityResult[];
      total: number;
      source: string;
      matchingTriggered: boolean;
    }>("search-jobs", {
      body: {
        ...filters,
        source_filter: "linkedin",
        limit,
        offset,
      },
    });

    if (error || !data) {
      console.warn("[linkedInAdapter] search-jobs error, returning empty:", error);
      return { opportunities: [], total: 0, source: "database", fallback: true };
    }

    const isFallback = data.source !== "linkedin";
    return {
      opportunities: (data.opportunities ?? []).map((o) => ({
        ...o,
        source: o.source ?? "linkedin",
      })),
      total:    data.total ?? 0,
      source:   (data.source ?? "database") as "linkedin" | "database",
      fallback: isFallback,
    };
  } catch (err) {
    console.error("[linkedInAdapter] unexpected error:", err);
    return { opportunities: [], total: 0, source: "database", fallback: true };
  }
}
