/**
 * fix/jobs-curation-family-precision — precise, non-fuzzy query expansion
 * for the unified retrieval engine.
 *
 * The old `expandTargetRoles` used `wordOverlapRatio ≥ 0.5` which counted
 * stopwords: "director of security" vs "director of product" → 0.5 →
 * false match, pulling 10+ unrelated families into Amir's search.
 *
 * This module replaces it with strict exact-phrase membership. A role
 * maps to a family only when the normalised role string is verbatim in
 * that family's synonym list (or the family list contains the role as
 * a whole phrase). NO word overlap ratios. NO substring matching against
 * short abbreviations like "cto"/"cco".
 */

import { ROLE_FAMILIES } from "@/services/curator/roleFamilies";

// Words that carry no semantic weight for role identity. Stripping them
// before comparison is the whole point.
const STOPWORDS = new Set([
  "of", "the", "and", "for", "&", "a", "an", "in", "on", "at", "to",
]);

/**
 * Normalise: lowercase, strip punctuation → spaces, drop stopwords,
 * collapse whitespace. Also collapse dash-connected words: "cyber-security"
 * → "cyber security". Preserves acronyms intact.
 */
export function normalisePhrase(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/[,;:—–\-\/&]+/g, " ")
    .split(/\s+/)
    .filter(w => w && !STOPWORDS.has(w))
    .join(" ")
    .trim();
}

/**
 * Look up a target role in the family taxonomy and return the family's
 * synonyms verbatim. NO fuzzy matching.
 *
 * Match rule: after normalisation, the role phrase must equal one of a
 * family's synonym phrases (also normalised). If no family matches, we
 * return just the raw role — the retrieval layer will still search on
 * the user's original words.
 *
 * Contract:
 *   - "Director of Security"  → director_of_security synonyms only
 *   - "Software Engineer"     → senior_engineer + staff_engineer families that
 *                                include the phrase (or empty if none list it verbatim)
 *   - "Underwater Basket Weaver" → [] (unknown role, caller falls back to raw)
 */
export function synonymsForExact(role: string): string[] {
  const target = normalisePhrase(role);
  if (!target) return [];

  const matched = new Set<string>();
  for (const [, synonyms] of Object.entries(ROLE_FAMILIES)) {
    const familyNormalised = synonyms.map(normalisePhrase);
    if (familyNormalised.includes(target)) {
      // This family owns the phrase → return every synonym in it.
      for (const s of synonyms) matched.add(s);
    }
  }
  return Array.from(matched);
}

/**
 * Structured expansion for retrieveByTitle's queryGroups mode.
 *
 * Requirement R2 — multi-title first-class. Each target role produces
 * ONE group. The retrieval engine runs one tsquery per group in parallel,
 * dedupes across groups keeping the retrievedFor labels union.
 *
 * A group contains:
 *   - label:   the user's raw target role (used as retrievedFor tag)
 *   - queries: [role itself, ...family synonyms] capped at 15 to keep
 *              websearch_to_tsquery tractable (PR #354 lesson).
 */
export function expandQueries(targetRoles: string[]): Array<{ label: string; queries: string[] }> {
  const groups: Array<{ label: string; queries: string[] }> = [];
  const seenLabels = new Set<string>();

  // fix/jobs-tsquery-mode Fix 4 — dedupe groups that produce
  //   identical query sets. When a user has three target roles that
  //   all map to the same family (Amir: ciso / Chief Security Officer
  //   / Chief Information Security Officer all -> ciso family), the
  //   pre-fix version fired three identical DB queries and unioned
  //   three identical row sets. Keep the FIRST label — that's what
  //   the user typed first and is the natural retrievedFor tag.
  const seenQuerySets = new Map<string, string>();  // fingerprint -> label
  for (const raw of targetRoles) {
    const label = (raw ?? "").trim();
    if (!label) continue;
    if (seenLabels.has(label.toLowerCase())) continue;
    seenLabels.add(label.toLowerCase());

    const synonyms = synonymsForExact(label);
    const queries = new Set<string>();
    queries.add(label.toLowerCase());
    for (const s of synonyms) queries.add(s.toLowerCase());
    const arr = Array.from(queries).slice(0, 15);
    // Fingerprint is the sorted set of queries. Two labels that
    // produce the same query set collapse into one group.
    const fp = [...arr].sort().join("|");
    if (seenQuerySets.has(fp)) continue;
    seenQuerySets.set(fp, label);
    groups.push({ label, queries: arr });
  }
  return groups;
}
