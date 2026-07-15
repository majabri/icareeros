/**
 * feat/jobs-fit-check-internal Task 1 — Deterministic fit-check core.
 *
 * ZERO LLM. Every field in the returned result traces to a concrete
 * signal from `scoreOpportunityAgainstProfile` (score + signals) or
 * from the deterministic keyword-extraction primitive
 * (`extractKeywords` in src/lib/jobFitAnalysis.ts).
 *
 * The route file (src/app/api/resume/fit-check/route.ts) calls this
 * FIRST. The LLM piece afterwards is summary-only, optional, and
 * best-effort — if it fails for any reason the deterministic result
 * ships anyway with `summary: null, summarySource: "unavailable"`.
 *
 * Design rules baked into the templates below:
 *   1. Every strengths / gaps / recommendation item names concrete
 *      evidence (top-N matched skills, specific role, tier, years).
 *   2. Nothing is fabricated. If a signal is 'unknown' the templated
 *      item is omitted rather than filled with a plausible-sounding
 *      claim. Tested by the "unknown-signal profile emits nothing"
 *      case in the test file.
 *   3. Recommendations are ranked by weighted deficit — a component
 *      with weight 0.35 and score 40 outranks a component with weight
 *      0.10 and score 20 (deficit 21 vs 8).
 *   4. Identical input → byte-identical output. No Date.now, no
 *      Math.random, no ordering that depends on Object.keys enumeration.
 */

import { scoreOpportunityAgainstProfile, type UserProfile, type ProfileFitScore } from "./profileScorer";
import { extractKeywords } from "@/lib/jobFitAnalysis";
import type { OpportunityResult } from "@/services/opportunityTypes";

// ── Shared types (moved out of the route so consumers can import
//    them without pulling the route's Anthropic dependency) ─────────

export interface FitBreakdown {
  /** 0-100 — proportion of JD-required skills present on the resume. */
  skillsCoverage: number;
  /** Seniority alignment vs JD seniority signals. */
  seniorityFit: "match" | "overqualified" | "underqualified" | "unknown";
  /** Location alignment — remote_ok captures remote-friendly JDs. */
  locationFit: "match" | "remote_ok" | "mismatch" | "unknown";
  /** 0-100 — years/depth of experience signal vs JD requirement. */
  experienceFit: number;
  /** Red flags present IN THE JD itself (unpaid, commission-only, etc). */
  redFlagsFound: string[];
}

export interface KeywordCoverage {
  /** JD keywords that ALSO appear in the resume (case-insensitive). */
  covered: string[];
  /** JD keywords NOT found on the resume. */
  missing: string[];
  /** 0-100 — covered.length / (covered+missing) total * 100. */
  coverageScore: number;
}

export interface DeterministicFitResult {
  /** The authoritative score — from scoreOpportunityAgainstProfile, NOT the LLM. */
  fitScore: number;
  /** UI-shaped breakdown consumed by /evaluate/job-fit's BreakdownBar +
   *  BreakdownTag. This is the OLD FitBreakdown shape (skillsCoverage,
   *  seniorityFit, locationFit, experienceFit, redFlagsFound) so the page
   *  keeps rendering with zero changes. */
  breakdown: FitBreakdown;
  /** ProfileFitScore breakdown — the raw numeric components the composite
   *  weight uses. Kept alongside `breakdown` for callers who want the
   *  underlying weights (e.g. the recommendation ranker). */
  componentScores: ProfileFitScore["breakdown"];
  /** 2-4 templated statements — every one traces to a real signal. */
  strengths: string[];
  /** 2-5 templated statements — same discipline as strengths. */
  gaps: string[];
  /** Direct pass-through of signals.missingSkills — the UI's ATS-gap section
   *  reads this key. */
  missingSkills: string[];
  /** Deterministic keyword coverage (JD skill keywords ∩ resume skill keywords). */
  keywordCoverage: KeywordCoverage;
  /** Top 3 actions ranked by weighted deficit. */
  recommendations: string[];
  /** Signals pass-through so callers can render extra UI without re-scoring. */
  signals: ProfileFitScore["signals"];
}

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * Format a comma-joined list of the top N items, human-readable. Empty
 * / single-item / two-item cases handled without the buggy Oxford-comma
 * behavior that some string-joiners exhibit.
 *
 *   []                 → ""
 *   ["a"]              → "a"
 *   ["a", "b"]         → "a and b"
 *   ["a", "b", "c"]    → "a, b, and c"
 *   ["a", "b", "c", "d"] → "a, b, c, and d"
 */
export function joinNaturally(items: string[], max = items.length): string {
  const trimmed = items.slice(0, max);
  if (trimmed.length === 0) return "";
  if (trimmed.length === 1) return trimmed[0];
  if (trimmed.length === 2) return `${trimmed[0]} and ${trimmed[1]}`;
  return `${trimmed.slice(0, -1).join(", ")}, and ${trimmed[trimmed.length - 1]}`;
}

/**
 * Turn a Seniority-style tier string into a phrase we can drop into a
 * natural-language template ("this senior role", "this executive role").
 *   'unknown' → "" so the caller can decide whether to omit the item.
 */
function tierPhrase(tier: string): string {
  switch (tier) {
    case "intern":     return "internship";
    case "junior":     return "junior-level";
    case "associate":  return "associate-level";
    case "mid":        return "mid-level";
    case "senior":     return "senior";
    case "staff":      return "staff";
    case "principal":  return "principal";
    case "director":   return "director-level";
    case "vp":         return "VP-level";
    case "executive":  return "executive";
    default:           return "";
  }
}

// ── Strengths / Gaps / Recommendations builders ────────────────────

/**
 * Templated strengths. Emits 2-4 items in this order of precedence:
 *   1. Target-role match (exact or adjacent)
 *   2. Skills match (when ≥3 matched skills)
 *   3. Seniority alignment (when signal === "match")
 *   4. Experience match (when experienceMatch ≥ 70)
 * Items with 'unknown' or absent signals are omitted, never guessed.
 */
export function buildStrengths(
  pfs: ProfileFitScore,
  totalRequiredSkills: number,
  profile: UserProfile,
): string[] {
  const out: string[] = [];
  const { signals, breakdown } = pfs;

  if (signals.targetRoleSignal === "exact" && signals.targetRoleBestMatch) {
    out.push(`This role is a direct match for your ${signals.targetRoleBestMatch} target`);
  } else if (signals.targetRoleSignal === "adjacent" && signals.targetRoleBestMatch) {
    out.push(`This role is adjacent to your ${signals.targetRoleBestMatch} target`);
  }

  if (signals.matchedSkills.length >= 3) {
    const top = signals.matchedSkills.slice(0, 3);
    const matched = signals.matchedSkills.length;
    const totalRef = Math.max(totalRequiredSkills, matched);
    out.push(
      `Your ${joinNaturally(top, 3)} experience directly matches ${matched} of the ${totalRef} stated requirements`,
    );
  } else if (signals.matchedSkills.length > 0) {
    out.push(
      `You have relevant experience in ${joinNaturally(signals.matchedSkills.slice(0, 3), 3)}`,
    );
  }

  if (signals.senioritySignal === "match") {
    const phrase = tierPhrase(profile.targetSeniority) || "listed";
    out.push(`Your seniority level aligns with this ${phrase} role`);
  }

  if (breakdown.experienceMatch >= 70 && profile.yearsExperience > 0) {
    out.push(
      `Your ${profile.yearsExperience} year${profile.yearsExperience === 1 ? "" : "s"} of experience meets the stated requirement`,
    );
  }

  return out;
}

/**
 * Templated gaps. Same discipline as buildStrengths — every item traces
 * to a signal that meaningfully underperformed.
 *   - Skills gap: names the top 3-5 missing skills (from signals.missingSkills)
 *   - Seniority gap: over-/under-qualified label
 *   - Experience gap: score < 40 → "years short"
 *   - Target-role gap: signal === "mismatch"
 */
export function buildGaps(
  pfs: ProfileFitScore,
  profile: UserProfile,
): string[] {
  const out: string[] = [];
  const { signals, breakdown } = pfs;

  if (signals.missingSkills.length > 0) {
    const top = signals.missingSkills.slice(0, 5);
    out.push(
      `The job asks for ${joinNaturally(top, 5)}${signals.missingSkills.length > top.length ? " and other skills" : ""} that aren't on your resume`,
    );
  }

  if (signals.senioritySignal === "overqualified") {
    out.push("Your seniority level is above the target for this role");
  } else if (signals.senioritySignal === "underqualified") {
    out.push("Your seniority level is below the target for this role");
  }

  if (breakdown.experienceMatch < 40 && profile.yearsExperience > 0) {
    out.push("Your years of experience are below the stated requirement");
  } else if (breakdown.experienceMatch < 40 && profile.yearsExperience === 0) {
    // No years captured → don't fabricate. Say nothing.
  }

  if (signals.targetRoleSignal === "mismatch" && profile.targetRoles.length > 0) {
    const targets = joinNaturally(profile.targetRoles.slice(0, 2), 2);
    out.push(
      `This role's title doesn't clearly overlap with your ${targets} target${profile.targetRoles.length === 1 ? "" : "s"}`,
    );
  }

  return out;
}

/**
 * Rank the breakdown components by weighted deficit, emit top-3
 * concrete actions. Weights mirror the composite in
 * scoreOpportunityAgainstProfile so the ordering here matches the
 * ordering that produced the total.
 */
const COMPONENT_WEIGHTS: Record<keyof ProfileFitScore["breakdown"], number> = {
  targetRoleMatch: 0.35,
  skillsMatch:     0.30,
  seniorityMatch:  0.20,
  experienceMatch: 0.10,
  keywordDensity:  0.05,
};

export function buildRecommendations(
  pfs: ProfileFitScore,
  keywordCoverage: KeywordCoverage,
): string[] {
  const { signals, breakdown } = pfs;

  const deficits: Array<{ key: keyof ProfileFitScore["breakdown"]; weight: number; deficit: number }> = [];
  for (const key of Object.keys(COMPONENT_WEIGHTS) as Array<keyof ProfileFitScore["breakdown"]>) {
    const score = breakdown[key];
    const weight = COMPONENT_WEIGHTS[key];
    deficits.push({ key, weight, deficit: weight * (100 - score) });
  }
  // Stable sort: descending by deficit, then by weight desc as tiebreaker.
  deficits.sort((a, b) => {
    if (b.deficit !== a.deficit) return b.deficit - a.deficit;
    return b.weight - a.weight;
  });

  const out: string[] = [];
  for (const d of deficits) {
    if (out.length >= 3) break;
    switch (d.key) {
      case "skillsMatch": {
        const top = signals.missingSkills.slice(0, 3);
        if (top.length > 0) {
          out.push(`Highlight or add ${joinNaturally(top, 3)} to your resume`);
        }
        break;
      }
      case "keywordDensity": {
        const missing = keywordCoverage.missing.slice(0, 4);
        if (missing.length > 0) {
          out.push(`Mirror the job's terminology: ${joinNaturally(missing, 4)}`);
        }
        break;
      }
      case "experienceMatch": {
        if (breakdown.experienceMatch < 70) {
          out.push("Emphasize the depth of your most relevant roles and quantify impact");
        }
        break;
      }
      case "targetRoleMatch": {
        if (signals.targetRoleSignal === "mismatch") {
          out.push("Adjust your resume headline to align more directly with this role's title");
        } else if (signals.targetRoleSignal === "stretch") {
          out.push("Frame your recent scope to bridge from your current title to this role");
        }
        break;
      }
      case "seniorityMatch": {
        if (signals.senioritySignal === "underqualified") {
          out.push("Show leadership scope: team size, budget, or cross-functional impact");
        } else if (signals.senioritySignal === "overqualified") {
          out.push("Address the level fit head-on in the cover letter — why this scope now");
        }
        break;
      }
    }
  }
  return out;
}

// ── Public entry point ─────────────────────────────────────────────

/**
 * Build a full DeterministicFitResult with zero LLM calls. Every field
 * traces to a signal computed by profileScorer + a keyword coverage
 * primitive that is itself deterministic.
 *
 * The `profile.summary + profile.currentTitle + profile.keywords`
 * concatenation stands in for "the resume text" when computing keyword
 * coverage. This matches what /evaluate/job-fit conceptually asks:
 * "given my profile signals, how do I stack up against this JD?"
 */
export function computeDeterministicFit(
  jobTitle: string,
  jobDescription: string,
  company: string,
  profile: UserProfile,
): DeterministicFitResult {
  // Build the OpportunityResult shape the scorer expects. Fields we don't
  // have (location, salary, etc.) are set to sensible neutrals — they
  // don't affect the sub-scores we care about.
  const job: OpportunityResult = {
    title:        jobTitle,
    company,
    location:     "",
    type:         "",
    description:  jobDescription,
    url:          "",
    matchReason:  "",
  };

  const pfs = scoreOpportunityAgainstProfile(job, profile);

  const jdKeywords     = extractKeywords(jobDescription);
  const profileCorpus  = [
    profile.summary,
    profile.currentTitle,
    profile.keywords.join(" "),
    profile.skills.join(" "),
  ].join(" ");
  const resumeKeywords = extractKeywords(profileCorpus);
  const covered: string[] = [];
  const missing: string[] = [];
  const resumeSet = new Set(resumeKeywords);
  for (const kw of jdKeywords) {
    if (resumeSet.has(kw)) covered.push(kw);
    else                   missing.push(kw);
  }
  const total = covered.length + missing.length;
  const coverageScore = total === 0 ? 0 : Math.round((covered.length / total) * 100);
  const keywordCoverage: KeywordCoverage = { covered, missing, coverageScore };

  const totalRequiredSkills =
    pfs.signals.matchedSkills.length + pfs.signals.missingSkills.length;

  const strengths       = buildStrengths(pfs, totalRequiredSkills, profile);
  const gaps            = buildGaps(pfs, profile);
  const recommendations = buildRecommendations(pfs, keywordCoverage);

  // Derive the UI-facing FitBreakdown from the ProfileFitScore. Location and
  // red flags are NOT computed deterministically today — return sensible
  // neutrals rather than fabricating.
  const breakdown: FitBreakdown = {
    skillsCoverage: pfs.breakdown.skillsMatch,
    seniorityFit:   pfs.signals.senioritySignal,
    locationFit:    "unknown",
    experienceFit:  pfs.breakdown.experienceMatch,
    redFlagsFound:  [],
  };

  return {
    fitScore:        pfs.total,
    breakdown,
    componentScores: pfs.breakdown,
    strengths,
    gaps,
    missingSkills:   pfs.signals.missingSkills,
    keywordCoverage,
    recommendations,
    signals:         pfs.signals,
  };
}
