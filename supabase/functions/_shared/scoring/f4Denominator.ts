/**
 * F4 skillsMatch denominator — the single implementation ADR-0006 dictates.
 *
 *     denom = max(min(profile.length, jd.length), 10)
 *     score = round( matched.length / denom × 100 )
 *
 * Design rationale (see ADR-0006 §3.6):
 *   - `min(profile, jd)` stops rich profiles from being penalised by their
 *     own skill breadth (Amir's CISO profile at 33 canonicals was hitting
 *     an F1 ceiling of ~9 on every JD below 33 skills).
 *   - Floor of 10 caps small-profile inflation (F2's failure mode: a
 *     5-skill IC profile matching 3 JD skills would score 60/100 without
 *     the floor).
 *   - Empirically anchored: p10 of the non-empty JD-extraction distribution
 *     across the ~62k enriched corpus lands near 10 (ADR-0006 §2.4).
 *
 * Callers:
 *   - Node — src/services/scoring/profileScorer.ts:scoreSkillsMatch
 *   - Deno — supabase/functions/curate-user-recommendations/index.ts:scoreJob
 *
 * Both callers must produce byte-identical output on the same inputs — the
 * byte-identity test in
 * supabase/functions/_shared/scoring/__tests__/f4Denominator.test.ts
 * asserts this against the divergence-case fixtures from ADR-0006 §1.2.
 *
 * DO NOT alter the formula without a new ADR + Platform sign-off.
 */

/** Minimum denominator. Rooted in ADR-0006 §2.4 empirical distribution. */
export const F4_FLOOR = 10;

/**
 * Compute the F4 denominator.
 *
 * @param profileSkillCount  |profile.skills| — post-normalisation canonical count
 * @param jdSkillCount       |jdSkills| — output of extractJDSkills(desc), cap 25 by default
 * @returns integer ≥ F4_FLOOR
 */
export function f4Denominator(profileSkillCount: number, jdSkillCount: number): number {
  const p = Math.max(0, profileSkillCount | 0);
  const j = Math.max(0, jdSkillCount | 0);
  return Math.max(Math.min(p, j), F4_FLOOR);
}

/**
 * Compute the F4 skillsMatch score in [0, 100].
 *
 * @param matched  |matched profile skills that appear in the JD text|
 * @param profileSkillCount  |profile.skills|
 * @param jdSkillCount  |jdSkills|
 * @returns integer in [0, 100]
 */
export function f4SkillsScore(
  matched: number,
  profileSkillCount: number,
  jdSkillCount: number,
): number {
  const m = Math.max(0, matched | 0);
  const denom = f4Denominator(profileSkillCount, jdSkillCount);
  return Math.min(100, Math.round((m / denom) * 100));
}
