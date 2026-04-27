/**
 * iCareerOS — Opportunity Service (implementation)
 * Adapted from azjobs/src/services/job/service.ts.
 *
 * Calls iCareerOS Supabase edge functions via supabase.functions.invoke().
 * Never use raw fetch against NEXT_PUBLIC_SUPABASE_URL/functions/v1/...
 *
 * Full implementation planned for Week 3.
 * Stubs return typed empty results so consumers can be wired up now.
 */

import { createClient } from "@/lib/supabase";
import type {
  OpportunityResult,
  OpportunitySearchFilters,
  DiscoverOpportunitiesResponse,
} from "./opportunityTypes";

const supabase = createClient();

/** Search opportunities via the discover-jobs edge function */
export async function searchOpportunities(
  filters: OpportunitySearchFilters,
): Promise<DiscoverOpportunitiesResponse> {
  const { data, error } = await supabase.functions.invoke("discover-jobs", {
    body: { filters },
  });
  if (error) throw new Error(error.message);
  return {
    opportunities: data?.jobs ?? [],
    total: data?.total ?? 0,
    searchTerm: data?.searchTerm ?? "",
    matchingTriggered: data?.matchingTriggered ?? false,
    source: data?.source ?? "unknown",
  };
}

/** Search opportunities already stored in the database */
export async function searchDatabaseOpportunities(
  filters: OpportunitySearchFilters,
): Promise<OpportunityResult[]> {
  const { data, error } = await supabase.functions.invoke("search-jobs", {
    body: { filters },
  });
  if (error) throw new Error(error.message);
  return data?.jobs ?? [];
}

/** Search via AI-powered matching */
export async function searchAIOpportunities(
  filters: OpportunitySearchFilters,
): Promise<OpportunityResult[]> {
  const { data, error } = await supabase.functions.invoke("match-jobs", {
    body: { filters },
  });
  if (error) throw new Error(error.message);
  return data?.jobs ?? [];
}

/** Normalise an opportunity URL for dedup */
export function normalizeOpportunityUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname}${u.pathname}`.toLowerCase().replace(/\/$/, "");
  } catch {
    return url.toLowerCase();
  }
}

/** Poll match scores for a set of opportunity IDs */
export async function pollMatchScores(
  opportunityIds: string[],
): Promise<Record<string, number>> {
  const { data, error } = await supabase.functions.invoke("match-jobs", {
    body: { opportunityIds, mode: "poll" },
  });
  if (error) throw new Error(error.message);
  return data?.scores ?? {};
}

/** Record a user interaction (saved / applied / dismissed) */
export async function markOpportunityInteraction(
  opportunityId: string,
  action: "save" | "apply" | "dismiss",
): Promise<void> {
  await supabase.functions.invoke("event-processor", {
    body: { opportunityId, action, ts: new Date().toISOString() },
  });
}
