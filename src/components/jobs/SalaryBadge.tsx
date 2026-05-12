"use client";

/**
 * SalaryBadge — quick visual cue for salary-vs-market.
 *
 * Ported from azjobs `src/components/job-search/JobCard.tsx`
 * (archive/old-azobs-2026-05-09/code/security-fixes-repo/...).
 *
 * The azjobs version depended on shadcn/ui's <Badge>. iCareerOS uses
 * plain Tailwind utilities for these chips; port stays visually
 * equivalent but framework-free.
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
  // Treat 3-digit "120k"-style numbers literally; >3 digits already in $/year.
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
 *
 * Accepts a salary as either:
 *   - a parsed mid-point number, OR
 *   - a freeform string (it parses internally).
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

interface SalaryBadgeProps {
  /** Either a freeform salary string or a parsed number. */
  salary: string | number | null | undefined;
  /** Job title — used to pick the right benchmark. */
  title?: string | null;
  /** Optional class override for the outer span. */
  className?: string;
}

export function SalaryBadge({ salary, title, className = "" }: SalaryBadgeProps) {
  const verdict = classifySalary(salary, title);
  if (verdict === "unknown") return null;

  const base = "rounded-full border px-2 py-0.5 text-[10px] font-semibold";
  const variants: Record<Exclude<SalaryVerdict, "unknown">, { cls: string; label: string }> = {
    above:  { cls: "bg-green-500/10 text-green-600 border-green-300 dark:text-green-400",     label: "↑ Above Market" },
    market: { cls: "bg-sky-500/10 text-sky-700 border-sky-300 dark:text-sky-400",             label: "≈ Market Rate" },
    below:  { cls: "bg-amber-500/10 text-amber-700 border-amber-300 dark:text-amber-400",     label: "↓ Below Market" },
  };
  const v = variants[verdict];
  return (
    <span className={`${base} ${v.cls} ${className}`}>{v.label}</span>
  );
}
