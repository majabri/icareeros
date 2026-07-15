/**
 * feat/jobs-opportunity-scoring — Task 1
 * Profile-aware fit scoring for opportunity search.
 *
 * All heuristics are deterministic (no LLM). We score a job against the
 * user's career profile on five dimensions and roll up to a 0-100
 * composite, weighted by importance:
 *   targetRoleMatch   35%  — does the job title look like their target?
 *   skillsMatch       30%  — do they have the required skills?
 *   seniorityMatch    20%  — is the level right?
 *   experienceMatch   10%  — years of experience fit?
 *   keywordDensity     5%  — profile keywords in JD as a booster
 */
import type { OpportunityResult } from "@/services/opportunityTypes";
import { skillAppearsIn, normalizeSkills, canonicalize } from "./skillsNormalizer";

export interface UserProfile {
  skills:            string[];
  targetRoles:       string[];
  targetSeniority:   Seniority;
  currentTitle:      string;
  yearsExperience:   number;
  summary:           string;
  /** Significant words pulled from summary + experience bullets. Lower-cased. */
  keywords:          string[];
}

export type Seniority =
  | "intern" | "junior" | "associate" | "mid"
  | "senior" | "staff" | "principal"
  | "director" | "vp" | "executive"
  | "unknown";

const SENIORITY_ORDER: Seniority[] = [
  "intern","junior","associate","mid","senior","staff","principal","director","vp","executive",
];

export interface ProfileFitScore {
  total: number;
  breakdown: {
    skillsMatch:     number;
    seniorityMatch:  number;
    targetRoleMatch: number;
    experienceMatch: number;
    keywordDensity:  number;
  };
  signals: {
    matchedSkills:    string[];
    missingSkills:    string[];
    senioritySignal:  "match" | "overqualified" | "underqualified" | "unknown";
    targetRoleSignal: "exact" | "adjacent" | "stretch" | "mismatch";
    /** fix/jobs-multi-target-roles — which of the profile.targetRoles this
     *  job best matched (empty when no targetRoles OR no match). */
    targetRoleBestMatch: string;
  };
}

// ── Public composite ─────────────────────────────────────────────────────

export function scoreOpportunityAgainstProfile(
  job:     OpportunityResult,
  profile: UserProfile,
): ProfileFitScore {
  const targetRoleMatch = scoreTargetRoleMatch(job, profile);
  const skillsScore     = scoreSkillsMatch(job, profile);
  const senScore        = scoreSeniorityMatch(job, profile);
  const expScore        = scoreExperienceMatch(job, profile);
  const kwScore         = scoreKeywordDensity(job, profile);

  const total = Math.max(0, Math.min(100, Math.round(
    targetRoleMatch.score * 0.35 +
    skillsScore.score     * 0.30 +
    senScore.score        * 0.20 +
    expScore              * 0.10 +
    kwScore               * 0.05
  )));

  return {
    total,
    breakdown: {
      skillsMatch:     skillsScore.score,
      seniorityMatch:  senScore.score,
      targetRoleMatch: targetRoleMatch.score,
      experienceMatch: expScore,
      keywordDensity:  kwScore,
    },
    signals: {
      matchedSkills:    skillsScore.matched,
      missingSkills:    skillsScore.missing,
      senioritySignal:  senScore.signal,
      targetRoleSignal: targetRoleMatch.signal,
      targetRoleBestMatch: targetRoleMatch.bestMatch,
    },
  };
}

// ── scoreTargetRoleMatch ─────────────────────────────────────────────────

/**
 * Best word-overlap ratio between job.title and each of profile.targetRoles.
 * Exact match = 100, majority overlap = ~90, half overlap = ~50, zero = 0.
 */
export function scoreTargetRoleMatch(
  job: OpportunityResult,
  profile: UserProfile,
): { score: number; signal: "exact" | "adjacent" | "stretch" | "mismatch"; bestMatch: string; allScores: Record<string, number> } {
  const jobTitle = normalise(job.title || "");
  const allScores: Record<string, number> = {};
  // fix/jobs-per-role-scoring — query origin hint. When queryJobsForRole
  // tagged the job with matchedRole, treat that as strong signal for THAT
  // specific target role only.
  const hintedRole = (job as OpportunityResult & { matchedRole?: string }).matchedRole ?? "";
  if (!jobTitle || profile.targetRoles.length === 0) {
    return { score: 0, signal: "mismatch", bestMatch: "", allScores };
  }
  // Populate allScores by comparing each target role independently.
  for (const target of profile.targetRoles) {
    const t = normalise(target);
    if (!t) { allScores[target] = 0; continue; }
    if (t === jobTitle) { allScores[target] = 100; continue; }
    const jw = new Set(jobTitle.split(" ").filter(w => w.length >= 3));
    const tw = new Set(t.split(" ").filter(w => w.length >= 3));
    if (tw.size === 0) { allScores[target] = 0; continue; }
    let shared = 0;
    for (const w of tw) if (jw.has(w)) shared++;
    const ratio = shared / tw.size;
    let score = Math.round(ratio * 100);
    // The hinted role (from queryJobsForRole tagging) is strong evidence
    // this specific job matched via THIS target. Elevate to a floor of 75
    // so it wins over incidental title-token overlap with other roles.
    if (hintedRole && normalise(hintedRole) === t) {
      score = Math.max(score, 75);
    }
    allScores[target] = score;
  }
  // Pick highest — deterministic tie-break by preferring the hinted role.
  let best = 0;
  let bestMatch = "";
  for (const [role, sc] of Object.entries(allScores)) {
    if (sc > best || (sc === best && role === hintedRole)) {
      best = sc; bestMatch = role;
    }
  }
  let signal: "exact" | "adjacent" | "stretch" | "mismatch";
  if (best >= 95)      signal = "exact";
  else if (best >= 60) signal = "adjacent";
  else if (best >= 30) signal = "stretch";
  else                 signal = "mismatch";
  return { score: best, signal, bestMatch, allScores };
}

// ── scoreSkillsMatch ─────────────────────────────────────────────────────

/**
 * Extracts skill tokens from the job description and returns the
 * intersection with profile.skills, normalised to a 0-100 score.
 * Empty description or empty profile skills yields 0 with empty arrays.
 */
export function scoreSkillsMatch(
  job: OpportunityResult,
  profile: UserProfile,
): { score: number; matched: string[]; missing: string[] } {
  const descLower = (job.description || "").toLowerCase();
  if (!descLower || profile.skills.length === 0) {
    return { score: 0, matched: [], missing: [] };
  }
  const matched: string[] = [];
  for (const skill of profile.skills) {
    if (!skill) continue;
    // fix/jobs-skills-normalization — alias-aware match. profile.skills
    //   arrives already normalized (via profileExtractor), so `skill`
    //   is the canonical form. skillAppearsIn checks every alias of
    //   the canonical form against the JD text (word-bounded).
    if (skillAppearsIn(skill, descLower)) matched.push(skill);
  }
  // Job-side skills: normalize what the naive extractor pulls so
  // "missing" reads as canonical forms too ("ISO 27001", not "iso 27001").
  const jobSkillsRaw   = extractJobSkills(descLower);
  const jobSkillsNorm  = normalizeSkills(jobSkillsRaw);
  const totalPool = Math.max(profile.skills.length, jobSkillsNorm.length, 1);
  const score = Math.min(100, Math.round((matched.length / totalPool) * 100));
  const matchedCanonical = new Set(matched.map(m => canonicalize(m).toLowerCase()));
  const missing = jobSkillsNorm.filter(js => !matchedCanonical.has(js.toLowerCase()));
  return { score, matched, missing };
}

function extractJobSkills(descLower: string): string[] {
  // Find the requirements / qualifications section
  const idx = Math.min(
    positive(descLower.indexOf("requirements")),
    positive(descLower.indexOf("qualifications")),
    positive(descLower.indexOf("what you'll need")),
  );
  const slice = descLower.slice(idx, idx + 3000);
  // Comma-separated phrases like "python, react, aws, ..." are common
  const chunks = slice.split(/[,;\n•·|]/).map(s => s.trim());
  const skills: string[] = [];
  for (const c of chunks) {
    if (c.length < 2 || c.length > 40) continue;
    // Skip sentences
    if (c.split(" ").length > 4) continue;
    skills.push(c);
  }
  return Array.from(new Set(skills));
}
function positive(n: number): number { return n === -1 ? Number.MAX_SAFE_INTEGER : n; }

// ── scoreSeniorityMatch ──────────────────────────────────────────────────

export function inferSeniority(text: string): Seniority {
  const t = text.toLowerCase();
  // fix/jobs-multi-target-roles Task 3 — expanded exec-tier keyword list.
  // Adds CSO/CTO/CFO/CIO/COO/CEO acronyms + spelled-out variants +
  // "President" so Chief-* titles + president-tier roles land as executive.
  if (
    /\bcto\b|\bceo\b|\bcio\b|\bciso\b|\bcfo\b|\bcoo\b|\bcso\b|\bcmo\b|\bcpo\b/i.test(t) ||
    /\bchief\b|\bpresident\b|\bexecutive\b/i.test(t)
  ) return "executive";
  if (/\bvp\b|vice president/i.test(t))       return "vp";
  // Business Information Security Officer is director-tier (Amir's list).
  if (/\bbiso\b|\bbusiness information security officer\b/i.test(t)) return "director";
  if (/director|head of/i.test(t))            return "director";
  if (/principal/i.test(t))                    return "principal";
  if (/\bstaff\b/i.test(t))                    return "staff";
  if (/\bsenior\b|\bsr\.?\b|\blead\b/i.test(t))return "senior";
  if (/\bassociate\b/i.test(t))                return "associate";
  if (/\bjunior\b|\bjr\.?\b|entry level|graduate/i.test(t)) return "junior";
  if (/intern|internship/i.test(t))            return "intern";
  if (/manager|engineer|analyst|specialist/i.test(t)) return "mid";
  return "unknown";
}

export function scoreSeniorityMatch(
  job: OpportunityResult,
  profile: UserProfile,
): { score: number; signal: "match" | "overqualified" | "underqualified" | "unknown" } {
  const jobLevel = inferSeniority(`${job.title || ""} ${job.description || ""}`);
  const target   = profile.targetSeniority;
  if (jobLevel === "unknown" || target === "unknown") {
    return { score: 50, signal: "unknown" };
  }
  const gap = SENIORITY_ORDER.indexOf(jobLevel) - SENIORITY_ORDER.indexOf(target);
  const absGap = Math.abs(gap);
  let score: number;
  if (absGap === 0)      score = 100;
  else if (absGap === 1) score = 70;
  else if (absGap === 2) score = 30;
  else                   score = 0;
  const signal = gap === 0 ? "match" : gap > 0 ? "overqualified" : "underqualified";
  return { score, signal };
}

// ── scoreExperienceMatch ─────────────────────────────────────────────────

const YEARS_RE = /(\d+)\s*\+?\s*(?:-\s*\d+\s*)?years?(?:\s+of\s+experience)?/i;

export function scoreExperienceMatch(
  job: OpportunityResult,
  profile: UserProfile,
): number {
  const m = (job.description || "").match(YEARS_RE);
  if (!m || !m[1]) return 50; // unknown → neutral
  const req = parseInt(m[1], 10);
  if (Number.isNaN(req)) return 50;
  const have = profile.yearsExperience;
  if (have >= req)          return 100;                    // meets or exceeds
  if (have >= req - 2)      return 70;                     // 1-2 years light
  if (have >= req - 4)      return 30;                     // 3-4 years light
  return 0;                                                // very underqualified
}

// ── scoreKeywordDensity ──────────────────────────────────────────────────

export function scoreKeywordDensity(
  job: OpportunityResult,
  profile: UserProfile,
): number {
  if (profile.keywords.length === 0) return 0;
  const descLower = (job.description || "").toLowerCase();
  let hits = 0;
  for (const k of profile.keywords) {
    if (k.length < 3) continue;
    if (descLower.includes(k)) hits++;
  }
  return Math.min(100, Math.round((hits / profile.keywords.length) * 100));
}

// ── Utilities ────────────────────────────────────────────────────────────

function normalise(s: string): string {
  return s.toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
