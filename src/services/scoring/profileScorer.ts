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
): { score: number; signal: "exact" | "adjacent" | "stretch" | "mismatch" } {
  const jobTitle = normalise(job.title || "");
  if (!jobTitle || profile.targetRoles.length === 0) {
    return { score: 0, signal: "mismatch" };
  }
  let best = 0;
  for (const target of profile.targetRoles) {
    const t = normalise(target);
    if (!t) continue;
    if (t === jobTitle) return { score: 100, signal: "exact" };
    const jw = new Set(jobTitle.split(" ").filter(w => w.length >= 3));
    const tw = new Set(t.split(" ").filter(w => w.length >= 3));
    if (tw.size === 0) continue;
    let shared = 0;
    for (const w of tw) if (jw.has(w)) shared++;
    // Score = overlap ratio; scale into 0-100 with an anti-fluke floor
    const ratio = shared / tw.size;
    const score = Math.round(ratio * 100);
    if (score > best) best = score;
  }
  let signal: "exact" | "adjacent" | "stretch" | "mismatch";
  if (best >= 95)      signal = "exact";
  else if (best >= 60) signal = "adjacent";
  else if (best >= 30) signal = "stretch";
  else                 signal = "mismatch";
  return { score: best, signal };
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
    const s = skill.trim().toLowerCase();
    if (!s) continue;
    if (descLower.includes(s)) matched.push(skill);
  }
  // Job-side skills: naive extraction — pick TitleCase phrases + comma
  // separated words near "skills"/"requirements" sections. Cheap and
  // returns a superset; we only use the SIZE not the accuracy.
  const jobSkills = extractJobSkills(descLower);
  const totalPool = Math.max(profile.skills.length, jobSkills.length, 1);
  const score = Math.min(100, Math.round((matched.length / totalPool) * 100));
  const missing = jobSkills.filter(js => !matched.some(m => m.toLowerCase() === js));
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
  if (/\bcto\b|\bceo\b|\bcio\b|\bciso\b|\bcfo\b|\bcoo\b|chief|executive/i.test(t)) return "executive";
  if (/\bvp\b|vice president/i.test(t))       return "vp";
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
