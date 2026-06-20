/**
 * Seniority inference — deterministic regex-based classifier.
 *
 * Brief: feat/jobs-intelligence-suite Task 7.
 *
 * Two functions:
 *   inferSeniority(text)         — classify a single job posting
 *   inferTargetSeniority(roles)  — classify a user's target_roles array
 *
 * The aggregator uses these to compute seniorityScore per job for sort
 * boost/penalty after the quality gate.
 *
 * Scoring matrix (1.0 = exact match, 0.7 = adjacent level, 0.3 = mismatch):
 *
 *               junior  mid   senior  staff   exec
 *   junior      1.0     0.7   0.3     0.3     0.3
 *   mid         0.7     1.0   0.7     0.3     0.3
 *   senior      0.3     0.7   1.0     0.7     0.3
 *   staff       0.3     0.3   0.7     1.0     0.7
 *   exec        0.3     0.3   0.3     0.7     1.0
 */

export type Seniority =
  | "junior" | "mid" | "senior" | "staff" | "executive" | "unknown";

const PATTERNS: Array<[Seniority, RegExp]> = [
  ["executive", /\b(c[a-z]o\b|chief\s+[a-z]+|cto|ceo|cfo|coo|cmo|cpo|cro|cdo|vp\b|vice\s+president|svp|evp|head\s+of|founder|owner|director\b)/i],
  ["staff",     /\b(staff|principal|distinguished|architect)\b/i],
  ["senior",    /\b(senior|sr\.?\s+|lead\b|manager|supervisor|team\s+lead)/i],
  ["junior",    /\b(intern(ship)?|junior|jr\.?\s+|entry[\s-]?level|graduate|associate|assistant|trainee|apprentice)/i],
  ["mid",       /\b(mid[\s-]?level|specialist|engineer\b|analyst\b|consultant\b|coordinator\b)/i],
];

export function inferSeniority(text: string): Seniority {
  if (!text || typeof text !== "string") return "unknown";
  // Iterate in order — exec > staff > senior > junior > mid — so the
  // strongest signal wins. Title text is short enough that O(n) regex
  // passes are fine; if this ever lands on a hot path we can pre-compile.
  for (const [level, rx] of PATTERNS) {
    if (rx.test(text)) return level;
  }
  return "unknown";
}

export function inferTargetSeniority(targetRoles: readonly string[]): Seniority {
  if (!Array.isArray(targetRoles) || targetRoles.length === 0) return "unknown";
  // Take the highest seniority across all target roles — a user targeting
  // "Staff Engineer OR Senior Engineer" wants Staff matching strongly.
  const order: Seniority[] = ["executive", "staff", "senior", "mid", "junior"];
  const found = new Set<Seniority>();
  for (const role of targetRoles) {
    found.add(inferSeniority(role));
  }
  for (const level of order) {
    if (found.has(level)) return level;
  }
  return "unknown";
}

/**
 * Adjacent-level scoring matrix. 1.0 = exact, 0.7 = ±1 level, 0.3 = ≥2 levels.
 * Used by the aggregator as a multiplier on the sort key.
 */
const LADDER: Record<Exclude<Seniority, "unknown">, number> = {
  junior:    0,
  mid:       1,
  senior:    2,
  staff:     3,
  executive: 4,
};

export function seniorityScore(job: Seniority, target: Seniority): number {
  if (job === "unknown" || target === "unknown") return 0.7; // neutral
  const diff = Math.abs(LADDER[job] - LADDER[target]);
  if (diff === 0) return 1.0;
  if (diff === 1) return 0.7;
  return 0.3;
}
