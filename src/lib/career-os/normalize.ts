/**
 * Sprint 5 hotfix (2026-05-16) — Defensive normalizers for stage output.
 *
 * Background
 * ──────────
 * Stage pages render data shaped by both:
 *   (a) the live API response immediately after `handleRun()` succeeds
 *   (b) `career_os_stages.notes` rows that may have been written months
 *       ago with a different schema, or by an LLM call that returned a
 *       partially-malformed payload before validation tightened.
 *
 * The render tree previously trusted these shapes blindly:
 *
 *   {result.skills.length}                        // crashes if skills is undefined
 *   {result.gaps.map(...)}                        // crashes if gaps is undefined
 *   [...result.resources].sort(...)               // TypeError on undefined
 *
 * After PR #243 introduced autorun-on-mount, the dashboard's "Run"
 * button started immediately triggering these renders for every user
 * navigating from /dashboard. A single response with a missing or
 * non-array field bricked the page client-side.
 *
 * These helpers give every panel a single line of defense:
 *
 *   const skills = arr<string>(result.skills);
 *   <p>You have {skills.length} skills</p>
 *
 * — and crash-free fallbacks for primitives that drive copy / styling.
 *
 * The helpers are pure, dependency-free, and tree-shake friendly.
 */

/**
 * Return the value if it's an array, otherwise an empty array. Generic
 * over the element type — caller asserts what should be inside.
 */
export function arr<T>(x: unknown): T[] {
  return Array.isArray(x) ? (x as T[]) : [];
}

/** Return the value if it's a string, otherwise a fallback. */
export function str(x: unknown, fallback = ""): string {
  return typeof x === "string" ? x : fallback;
}

/** Return the value if it's a finite number, otherwise a fallback. */
export function num(x: unknown, fallback = 0): number {
  return typeof x === "number" && Number.isFinite(x) ? x : fallback;
}

/** Return the value if it's a non-null object, otherwise an empty record. */
export function obj(x: unknown): Record<string, unknown> {
  return x && typeof x === "object" && !Array.isArray(x)
    ? (x as Record<string, unknown>)
    : {};
}
