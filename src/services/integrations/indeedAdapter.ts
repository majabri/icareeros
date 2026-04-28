/**
 * iCareerOS — Indeed Jobs Adapter
 *
 * Calls the `search-jobs` edge function with source="indeed".
 * Indeed's Publisher API requires an approved publisher account.
 * Until provisioned, the edge function falls back to the curated
 * opportunity database.
 */

import { createClient } from "@/lib/supabase";
import type { OpportunityResult, OpportunitySearchFilters } from "@/services/opportunityTypes";

export interface IndeedSearchOptions {
  filters: OpportunitySearchFilters;
  limit?: number;
  offset?: number;
}

export interface IndeedSearchResult {
  opportunities: OpportunityResult[];
  total: number;
  source: "indeed" | "database";
  fallback: boolean;
}

/**
 * Search Indeed Jobs via the search-jobs edge function.
 */
export async function searchIndeed(
  options: IndeedSearchOptions
): Promise<IndeedSearchResult> {
  const supabase = createClient();
  const { filters, limit = 20, offset = 0 } = options;

  try {
    const { data, error } = await supabase.functions.invoke<{
      opportunities: OpportunityResult[];
      total: number;
      source: string;
    }>("search-jobs", {
      body: {
        ...filters,
        source_filter: "indeed",
        limit,
        offset,
      },
    });

    if (error || !data) {
      console.warn("[indeedAdapter] search-jobs error, returning empty:", error);
      return { opportunities: [], total: 0, source: "database", fallback: true };
    }

    const isFallback = data.source !== "indeed";
    return {
      opportunities: (data.opportunities ?? []).map((o) => ({
        ...o,
        source: o.source ?? "indeed",
      })),
      total:    data.total ?? 0,
      source:   (data.source ?? "database") as "indeed" | "database",
      fallback: isFallback,
    };
  } catch (err) {
    console.error("[indeedAdapter] unexpected error:", err);
    return { opportunities: [], total: 0, source: "database", fallback: true };
  }
}
