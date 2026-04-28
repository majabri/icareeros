/**
 * iCareerOS — Fit Score Service
 *
 * Scores a batch of opportunities against the current user's career profile.
 * Delegates to the server-side API route /api/jobs/fit-scores,
 * which calls Claude Haiku and keeps ANTHROPIC_API_KEY server-side.
 *
 * Designed to run non-blocking after the /jobs search returns results.
 * Returns an empty scores map on any error so the UI degrades gracefully.
 */

export interface FitScore {
  fit_score: number;       // 0-100
  match_summary: string;
  strengths: string[];
  skill_gaps: string[];
}

export interface FitScoreResult {
  scores: Record<string, FitScore>;   // keyed by opportunity ID
}

/**
 * Score a batch of up to 20 opportunity IDs against the current user's profile.
 *
 * @param opportunityIds - IDs of opportunities to score (capped at 20 server-side)
 * @param cycleId - optional active Career OS cycle ID; if provided the route uses
 *                  the richer Evaluate stage notes instead of the base profile
 */
export async function scoreFitBatch(
  opportunityIds: string[],
  cycleId?: string,
): Promise<FitScoreResult> {
  const res = await fetch("/api/jobs/fit-scores", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ opportunity_ids: opportunityIds, cycle_id: cycleId }),
    credentials: "include",   // send Supabase auth cookie
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error("scoreFitBatch failed: " + (err.error ?? res.statusText));
  }

  return (await res.json()) as FitScoreResult;
}
