/**
 * Sprint 5 hotfix (2026-05-15) — Strip markdown code fences before JSON.parse.
 *
 * Despite our system prompt saying "Return ONLY valid JSON — no prose, no
 * markdown fences", Claude (especially Haiku) sometimes wraps the response
 * in ```json ... ``` fences. This crashed all 5 career-os routes for any
 * user whose stage notes were empty.
 *
 * Strips a leading ``` or ```json line and a trailing ``` line. Idempotent
 * — calling this on already-clean JSON is a no-op.
 */
export function stripJsonFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}
