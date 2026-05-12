/**
 * SalaryBadge — pure classification logic.
 *
 * Lives in its own .ts module (no JSX) so it can be unit-tested
 * directly. The .tsx component re-exports these for ergonomic
 * one-line imports from non-test code.
 *
 * Ported from azjobs `src/components/job-search/JobCard.tsx`
 * (security-fixes-repo, read-only reference per Rule 10).
 */

const MARKET_BENCHMARKS: Record<string, number> = {
  entry:     65_000,
  junior:    75_000,
  mid:      105_000,
  senior:   140_000,
  lead:     165_000,
  staff:    185_000,
  principal: 210_000,
  director:  195_000,
  vp:        230_000,
};

/** Pull a number out of a freeform salary string like "$120k - $150k" or "120000". */
export function parseSalaryNumber(salary: string | null | undefined): number | null {
  if (!salary) return null;
  const matches = salary.replace(/,/g, "").match(/(\d+)/g);
  if (!matches) return null;
  const nums = matches.map(Number);
  if (nums.length >= 2) return (nums[0] + nums[1]) / 2;
  return nums[0];
}

/** Choose a benchmark mid-point based on title seniority keywords. */
export function estimateMarketRate(title: string | null | undefined): number {
  const lower = (title || "").toLowerCase();
  for (const [key, val] of Object.entries(MARKET_BENCHMARKS)) {
    if (lower.includes(key)) return val;
  }
  if (lower.includes("engineer") || lower.includes("developer")) return 120_000;
  if (lower.includes("manager"))                                  return 130_000;
  if (lower.includes("analyst"))                                  return  90_000;
  if (lower.includes("designer"))                                 return 100_000;
  return 100_000;
}

export type SalaryVerdict = "above" | "market" | "below" | "unknown";

/**
 * Classify a posting's salary against the benchmark mid-point.
 *
 * - above:  posting is at least 10% above benchmark
 * - below:  posting is at least 10% below benchmark
 * - market: within ±10%
 * - unknown: salary or title insufficient to classify
 */
export function classifySalary(
  salary: string | number | null | undefined,
  title: string | null | undefined,
): SalaryVerdict {
  const parsed = typeof salary === "number" ? salary : parseSalaryNumber(salary);
  if (!parsed || !title) return "unknown";
  const market = estimateMarketRate(title);
  if (!market) return "unknown";
  const diff = ((parsed - market) / market) * 100;
  if (diff >=  10) return "above";
  if (diff <= -10) return "below";
  return "market";
}
