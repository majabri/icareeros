/**
 * Job-quality validator — heuristic-only, runs on every result before display.
 *
 * Returns:
 *   { hidden: boolean; flags: string[]; score: number (0-100) }
 *
 * 'hidden' = drop from results entirely (MLM, spam, missing core fields).
 * 'flags'  = problems worth surfacing on the card (clickbait, thin desc,
 *            inflated salary, etc.) — score reduced accordingly.
 *
 * No AI calls — runs in microseconds, cheap to apply to every Adzuna result.
 */

import type { OpportunityResult } from "@/services/opportunityTypes";

const SPAM_TITLE_PATTERNS = [
  /^(make|earn) \$/i,
  /work from home easy/i,
  /no experience needed/i,
  /unlimited (income|earnings)/i,
  /be your own boss/i,
];

const CLICKBAIT_PATTERNS = [
  /!{2,}/,                          // "Hiring NOW!!"
  /[💰🤑🚀🔥]{2,}/,                  // emoji clusters
  /\bGET HIRED\b/,                  // SHOUTING
  /(URGENT|IMMEDIATE) HIRING/i,
];

const MLM_PATTERNS = [
  /\b(MLM|pyramid|multi[\s-]?level marketing)\b/i,
  /recruit (your|new) (friends|members|reps).*(earn|commission)/i,
  /\bdownline\b/i,
];

const GENERIC_COMPANY_RE = /^(company|confidential|hiring company|recruiter|n\/a|tbd|undisclosed)$/i;

const MIN_DESCRIPTION_LENGTH = 80;
const SUSPICIOUS_LOW_SALARY  = 15000;   // < $15K full-time = suspicious
const INFLATED_SALARY        = 1_200_000; // > $1.2M = almost always inflated

export interface ValidationResult {
  hidden: boolean;
  flags:  string[];
  score:  number;
}

export function validateJob(job: OpportunityResult): ValidationResult {
  const flags: string[] = [];
  let hidden = false;
  let score  = 100;

  const title       = job.title ?? "";
  const description = job.description ?? "";
  const company     = job.company ?? "";
  const jobType     = (job.type ?? "").toLowerCase();

  // ── Hard-fail (hidden) ────────────────────────────────────────────────
  if (!title || title.length < 3) {
    hidden = true; flags.push("missing_title");
  }
  for (const re of SPAM_TITLE_PATTERNS) {
    if (re.test(title)) { hidden = true; flags.push("spam_title"); break; }
  }
  for (const re of MLM_PATTERNS) {
    if (re.test(title) || re.test(description)) {
      hidden = true; flags.push("mlm"); break;
    }
  }
  if (!company || GENERIC_COMPANY_RE.test(company)) {
    hidden = true; flags.push("missing_company");
  }

  // ── Soft flags (visible but downscored) ───────────────────────────────
  for (const re of CLICKBAIT_PATTERNS) {
    if (re.test(title)) { flags.push("clickbait_title"); score -= 25; break; }
  }

  if (description.length < MIN_DESCRIPTION_LENGTH) {
    flags.push("thin_description"); score -= 20;
  }

  // Salary sanity
  if (
    job.salary_min &&
    job.salary_min > 0 &&
    job.salary_min < SUSPICIOUS_LOW_SALARY &&
    !/part[\s-]?time|intern|seasonal/i.test(jobType + " " + title)
  ) {
    flags.push("suspicious_low_salary"); score -= 15;
  }
  if (job.salary_max && job.salary_max > INFLATED_SALARY) {
    flags.push("inflated_salary"); score -= 30;
  }

  // Repeat-the-pay-twice scam pattern: "earn $1500/wk! make $1500/week!"
  const payMatches = description.match(/\$\s*\d{2,5}\s*\/?(?:wk|week|day|hour|hr)/gi);
  if (payMatches && payMatches.length >= 3) {
    flags.push("salary_spam"); score -= 15;
  }

  // Title bait — too many dollar signs in the title
  if ((title.match(/\$/g) ?? []).length >= 2) {
    flags.push("dollar_bait"); score -= 15;
  }

  return { hidden, flags, score: Math.max(0, score) };
}

/**
 * Apply validation to a list of jobs. Returns:
 *   - kept: jobs with hidden=false
 *   - hiddenCount: number filtered out
 *   - flaggedCount: number kept but with at least one soft flag
 */
export function validateJobs(jobs: OpportunityResult[]): {
  kept: Array<OpportunityResult & { is_flagged?: boolean; flag_reasons?: string[]; quality_score?: number }>;
  hiddenCount: number;
  flaggedCount: number;
} {
  let hiddenCount = 0;
  let flaggedCount = 0;
  const kept: Array<OpportunityResult & { is_flagged?: boolean; flag_reasons?: string[]; quality_score?: number }> = [];

  for (const job of jobs) {
    const v = validateJob(job);
    if (v.hidden) {
      hiddenCount++;
      continue;
    }
    if (v.flags.length > 0) flaggedCount++;
    kept.push({
      ...job,
      is_flagged:    v.flags.length > 0,
      flag_reasons:  v.flags,
      quality_score: v.score,
    });
  }

  return { kept, hiddenCount, flaggedCount };
}
