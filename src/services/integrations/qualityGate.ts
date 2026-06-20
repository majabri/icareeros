/**
 * Lead Quality Gate — deterministic filter before sorting.
 *
 * Brief: feat/jobs-intelligence-suite Task 1.
 *
 * Runs every aggregated opportunity through 5 deterministic checks:
 *   1. URL validation       — must have a usable apply URL
 *   2. Freshness            — reject postings >30 days old
 *   3. Description depth    — reject thin postings (<300 chars)
 *   4. Company context      — must have a company name
 *   5. Red-flag keywords    — reject when 2+ unpaid/equity-only/MLM signals fire
 *
 * Designed to be cheap, side-effect-free, and easy to unit-test. The
 * aggregator wires this in after dedupe + before sort.
 */

import type { OpportunityResult } from "@/services/opportunityTypes";

export interface QualityGateResult {
  /** true when the job passes ALL gates and is safe to surface. */
  passed: boolean;
  /** Human-readable reason for failure. Only set when passed=false. */
  reason?: string;
  /** All red-flag markers detected, even when passed=true (single flag is allowed). */
  flags: string[];
}

const RED_FLAGS = [
  "unpaid", "no pay", "commission only", "commission-only",
  "competitive salary", "looking for exposure", "for exposure",
  "equity only", "sweat equity", "homework assignment",
  "take home test", "unpaid trial", "working interview",
  "mlm", "multi-level", "pyramid",
] as const;

const MAX_STALE_DAYS = 30;
const MIN_DESCRIPTION_CHARS = 300;
const MIN_COMPANY_NAME_CHARS = 2;

export function applyQualityGate(job: OpportunityResult): QualityGateResult {
  const flags: string[] = [];

  // 1. URL validation
  if (!job.url || !job.url.startsWith("http")) {
    return { passed: false, reason: "Missing or invalid apply URL", flags };
  }

  // 2. Freshness — `first_seen_at` is the OpportunityResult equivalent of
  //    the brief's `postedAt`. Adzuna populates this from the job's
  //    `created` ISO date; database/ATS rows use their own posted_at.
  if (job.first_seen_at) {
    const t = Date.parse(job.first_seen_at);
    if (!Number.isNaN(t)) {
      const daysOld = (Date.now() - t) / 86_400_000;
      if (daysOld > MAX_STALE_DAYS) {
        return {
          passed: false,
          reason: `Stale posting (${Math.round(daysOld)} days old)`,
          flags,
        };
      }
    }
  }

  // 3. Description depth
  if (!job.description || job.description.length < MIN_DESCRIPTION_CHARS) {
    return { passed: false, reason: "Thin job description (low signal)", flags };
  }

  // 4. Company context
  if (!job.company || job.company.trim().length < MIN_COMPANY_NAME_CHARS) {
    return { passed: false, reason: "Missing company name", flags };
  }

  // 5. Red flag keywords
  const descLower  = job.description.toLowerCase();
  const titleLower = (job.title || "").toLowerCase();
  for (const flag of RED_FLAGS) {
    if (descLower.includes(flag) || titleLower.includes(flag)) {
      flags.push(`Red flag: "${flag}"`);
    }
  }
  if (flags.length >= 2) {
    return {
      passed: false,
      reason: `Multiple red flags detected: ${flags.join(", ")}`,
      flags,
    };
  }

  return { passed: true, flags };
}
