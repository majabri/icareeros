/**
 * extractJson — tolerant JSON parser for Claude responses.
 *
 * Claude sometimes wraps its JSON output in ```json … ``` fences or
 * inside an English preamble even when the system prompt says "no
 * markdown". Naked JSON.parse() throws on those cases and the whole
 * cover-letter / outreach / any other JSON-mode endpoint fails.
 *
 * Strategy:
 *   1. Strip a leading ```json / ``` fence and trailing ``` fence.
 *   2. If the string doesn't start with '{', slice from the first '{'
 *      to the last '}' inclusive — Claude occasionally emits
 *      "Here is the JSON: { … }" or a trailing "That should work."
 *   3. Parse.
 *
 * This is safe for well-formed responses (fast path — no-op strip) and
 * recovers from the two common failure modes we've seen in prod.
 */
export function extractJson<T = unknown>(text: string): T {
  let cleaned = (text ?? "").trim();

  // 1. Strip markdown fences (```json … ``` or ``` … ```)
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json|JSON)?\s*\n?/, "");
    cleaned = cleaned.replace(/\n?```\s*$/, "");
    cleaned = cleaned.trim();
  }

  // 2. Slice between first '{' and last '}' if the string doesn't
  //    already start with a JSON object token.
  if (!cleaned.startsWith("{") && !cleaned.startsWith("[")) {
    const start = cleaned.indexOf("{");
    const end   = cleaned.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      cleaned = cleaned.slice(start, end + 1);
    }
  }

  // 3. Parse
  return JSON.parse(cleaned) as T;
}
