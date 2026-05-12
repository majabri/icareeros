"use client";

/**
 * SalaryBadge — visual chip for salary-vs-market verdict.
 *
 * Pure classification logic lives in ./salaryClassifier.ts so it can be
 * unit-tested under vitest without a JSX transformer.
 */

import {
  classifySalary,
  parseSalaryNumber,
  estimateMarketRate,
  type SalaryVerdict,
} from "./salaryClassifier";

// Re-exports for ergonomic imports from anywhere outside tests.
export { classifySalary, parseSalaryNumber, estimateMarketRate };
export type { SalaryVerdict };

interface SalaryBadgeProps {
  salary: string | number | null | undefined;
  title?: string | null;
  className?: string;
}

export function SalaryBadge({ salary, title, className = "" }: SalaryBadgeProps) {
  const verdict = classifySalary(salary, title);
  if (verdict === "unknown") return null;

  const base = "rounded-full border px-2 py-0.5 text-[10px] font-semibold";
  const variants: Record<Exclude<SalaryVerdict, "unknown">, { cls: string; label: string }> = {
    above:  { cls: "bg-green-500/10 text-green-600 border-green-300 dark:text-green-400", label: "↑ Above Market" },
    market: { cls: "bg-sky-500/10 text-sky-700 border-sky-300 dark:text-sky-400",         label: "≈ Market Rate" },
    below:  { cls: "bg-amber-500/10 text-amber-700 border-amber-300 dark:text-amber-400", label: "↓ Below Market" },
  };
  const v = variants[verdict];
  return <span className={`${base} ${v.cls} ${className}`}>{v.label}</span>;
}
