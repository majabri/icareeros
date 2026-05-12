/**
 * Job Quality Analyzer (v2)
 *
 * Ported from azjobs `supabase/functions/quality-analyzer-v2/index.ts`
 * (archive/code-retired-2026-05-09/job-quality/enhanced-quality-analyzer-v2.ts).
 *
 * The azjobs version was a Supabase Edge Function with DB lookups for
 * company verification + reposting frequency. For inline use inside the
 * curated jobs pipeline we want a fast, synchronous, pure-function port
 * — no DB calls. Company-verification and reposting-frequency checks are
 * stubbed out (return safe defaults). They can be re-added later as a
 * separate batch job that writes back to `opportunities.quality_score`.
 *
 * Per Wave 3 wiring rule: anything scoring < 60 is dropped from the
 * curated feed. The threshold is configurable via FILTER_THRESHOLD.
 */

import type { OpportunityResult } from "@/services/opportunityTypes";

export const FILTER_THRESHOLD = 60;

export interface AntiFraudSignals {
  description_too_short: boolean;     // < 50 chars
  no_location_or_remote: boolean;
  urgency_keywords: boolean;
  commission_only: boolean;
  payment_required: boolean;
  excessive_requirements: boolean;
  generic_language: boolean;
  salary_too_high: boolean;
  /** Days between identical posts; 30 means "no recent repost detected". */
  repost_frequency: number;
  company_unverified: boolean;
}

export interface QualityResult {
  /** 0–100. Higher = healthier listing. */
  quality_score: number;
  /** Computed fraud-penalty contribution (negative or zero). */
  fraud_penalty: number;
  /** High-risk combo? Worth surfacing to the user even when score > threshold. */
  high_risk: boolean;
  /** Human-readable flag labels for `flag_reasons` on OpportunityResult. */
  flag_reasons: string[];
  /** Raw signals for inspection / debugging. */
  signals: AntiFraudSignals;
}

const URGENCY_RE      = /\b(urgent|urgently|immediate|immediately|asap|now hiring|start today)\b/i;
const COMMISSION_RE   = /\b(commission only|no base|unpaid|volunteer|mlm|pyramid)\b/i;
const PAYMENT_RE      = /\b(upfront fee|startup cost|training fee|equipment fee|pay.*start)\b/i;

const TECH_SKILLS = [
  "react", "vue", "angular", "node", "python", "java", "go", "rust",
  "aws", "azure", "gcp", "docker", "kubernetes", "terraform",
  "sql", "mongodb", "redis", "elasticsearch",
];

const GENERIC_PHRASES = [
  "fast-paced environment", "dynamic team", "growth opportunity",
  "competitive salary", "great benefits", "work-life balance",
  "make a difference", "hit the ground running",
];

function detectExcessiveRequirements(description: string): boolean {
  const d = description.toLowerCase();
  return TECH_SKILLS.filter(s => d.includes(s)).length >= 8;
}

function detectGenericLanguage(description: string): boolean {
  const d = description.toLowerCase();
  return GENERIC_PHRASES.filter(p => d.includes(p)).length >= 4;
}

function detectUnrealisticSalary(opp: Pick<OpportunityResult, "title" | "salary_min" | "salary_max">): boolean {
  if (!opp.salary_min || !opp.salary_max) return false;
  const avg = (opp.salary_min + opp.salary_max) / 2;
  const title = (opp.title || "").toLowerCase();
  if (title.includes("intern")  && avg > 80_000)  return true;
  if (title.includes("entry")   && avg > 120_000) return true;
  if (title.includes("senior")  && avg > 400_000) return true;
  return false;
}

function emptySignals(): AntiFraudSignals {
  return {
    description_too_short: false,
    no_location_or_remote: false,
    urgency_keywords: false,
    commission_only: false,
    payment_required: false,
    excessive_requirements: false,
    generic_language: false,
    salary_too_high: false,
    repost_frequency: 30,
    company_unverified: false,
  };
}

/**
 * Run the anti-fraud signal detectors against an opportunity.
 *
 * Pure synchronous — does NOT do DB lookups. Two signals are stubbed:
 *   - company_unverified: always false (assume verified; rely on
 *     descriptive flags + scam-keyword detector for fake company names).
 *   - repost_frequency:   always 30 (no DB visibility into repost history).
 *
 * If we later add a backend job that maintains a company_validations
 * table, these stubs can be replaced with a single Supabase query before
 * calling this function.
 */
export function detectFraudSignals(opp: Pick<
  OpportunityResult,
  "title" | "description" | "location" | "is_remote" | "salary_min" | "salary_max"
>): AntiFraudSignals {
  const desc  = (opp.description || "").toLowerCase();
  const title = (opp.title || "").toLowerCase();

  return {
    description_too_short:  desc.length < 50,
    no_location_or_remote: !opp.location && !opp.is_remote && !desc.includes("remote"),
    urgency_keywords:       URGENCY_RE.test(desc) || URGENCY_RE.test(title),
    commission_only:        COMMISSION_RE.test(desc),
    payment_required:       PAYMENT_RE.test(desc),
    excessive_requirements: detectExcessiveRequirements(desc),
    generic_language:       detectGenericLanguage(desc),
    salary_too_high:        detectUnrealisticSalary(opp),
    repost_frequency:       30,
    company_unverified:     false,
  };
}

/** Convert fraud signals into a 0..-100 penalty + a flag-reasons list. */
export function calculateFraudPenalty(s: AntiFraudSignals): { penalty: number; flags: string[] } {
  let penalty = 0;
  const flags: string[] = [];

  if (s.description_too_short)  { penalty -= 30; flags.push("Description too short"); }
  if (s.no_location_or_remote)  { penalty -= 10; flags.push("No location info"); }
  if (s.urgency_keywords)       { penalty -= 15; flags.push("Urgency language"); }
  if (s.commission_only)        { penalty -= 25; flags.push("Commission only"); }
  if (s.payment_required)       { penalty -= 50; flags.push("Payment required"); }
  if (s.excessive_requirements) { penalty -= 20; flags.push("Excessive requirements"); }
  if (s.generic_language)       { penalty -= 15; flags.push("Generic template language"); }
  if (s.salary_too_high)        { penalty -= 25; flags.push("Unrealistic salary"); }
  if (s.repost_frequency < 7)   { penalty -= 15; flags.push("Frequent reposts"); }
  if (s.company_unverified)     { penalty -= 20; flags.push("Company unverified"); }

  return { penalty: Math.max(-100, penalty), flags };
}

/** Three-tier risk classifier — surface a warning even when score > threshold. */
export function hasHighRiskSignals(s: AntiFraudSignals): boolean {
  return s.payment_required
      || s.commission_only
      || (s.salary_too_high && s.generic_language)
      || (s.urgency_keywords && s.company_unverified);
}

/**
 * Main entry point — score one opportunity.
 *
 * Returns a 0..100 quality score. A perfectly clean listing scores 100;
 * each detected fraud signal subtracts (see `calculateFraudPenalty`).
 * Per Wave 3 wiring, the curated path filters anything < FILTER_THRESHOLD (60).
 */
export function scoreJobQuality(opp: Pick<
  OpportunityResult,
  "title" | "description" | "location" | "is_remote" | "salary_min" | "salary_max"
>): QualityResult {
  const signals  = detectFraudSignals(opp);
  const { penalty, flags } = calculateFraudPenalty(signals);
  const quality_score = Math.max(0, Math.min(100, 100 + penalty));
  return {
    quality_score,
    fraud_penalty: penalty,
    high_risk: hasHighRiskSignals(signals),
    flag_reasons: flags,
    signals,
  };
}
