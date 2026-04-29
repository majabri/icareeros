/**
 * iCareerOS — Salary Intelligence Service
 *
 * Estimates salary ranges for opportunities that have no salary data in the DB.
 * Delegates to the server-side route /api/salary-intelligence,
 * which calls Claude Haiku and keeps ANTHROPIC_API_KEY server-side.
 *
 * Designed to run non-blocking after the /jobs search returns results,
 * only for opportunities where salary_min and salary_max are both null.
 * Returns an empty ranges map on any error so the UI degrades gracefully.
 */

export interface SalaryRange {
  min: number;
  max: number;
  currency: string;
  label: string;
  confidence: "high" | "medium" | "low";
}

export interface SalaryRangeResult {
  ranges: Record<string, SalaryRange>;  // keyed by opportunity ID
}

/**
 * Estimate salary ranges for up to 30 null-salary opportunity IDs.
 *
 * @param opportunityIds - IDs of opportunities with no salary data
 */
export async function enrichSalaries(
  opportunityIds: string[],
): Promise<SalaryRangeResult> {
  const res = await fetch("/api/salary-intelligence", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ opportunity_ids: opportunityIds }),
    credentials: "include",   // send Supabase auth cookie
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error("enrichSalaries failed: " + (err.error ?? res.statusText));
  }

  return (await res.json()) as SalaryRangeResult;
}
