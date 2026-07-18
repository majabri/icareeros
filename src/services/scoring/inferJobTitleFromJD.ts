/**
 * inferJobTitleFromJD — conservative JD → job title extractor.
 *
 * Used by /api/resume/fit-check when the paste-mode client doesn't send an
 * explicit `jobTitle`. The old fallback (`coarseJobTitleFromJD` in
 * route.ts) took the first non-blank line of the JD if it was < 100 chars
 * and lacked an early full stop. That works for boards that lead with the
 * title on line 1 but fails catastrophically on prose intros — the Cohere
 * CISO posting starts with "Who are we? Cohere is the leading
 * security-first enterprise AI company." which returns "" and drops
 * targetRoleMatch to 0 (confirmed via UI acceptance test 2026-07-18).
 *
 * This module runs a set of confidence-graded patterns and returns the
 * FIRST high-confidence hit. When nothing hits with confidence, it returns
 * "" — that's the honest signal. A wrong-inferred title fed into
 * scoreTargetRoleMatch is strictly worse than a 0: the composite still
 * loses the 35% target weight, but now it also mislabels the user's
 * target-role signal in the summary text.
 *
 * Contract:
 *   Input:  a job description string (any length, any format).
 *   Output: a plausible job title, or "".
 *   NEVER throws. NEVER returns something that can't confidently be shown
 *   to a human as "we believe this posting is for a <return value>".
 */

// A greedy-ish title-term match. NOTE: the wrapping patterns use `i` for
// the trigger word ("seeks", "hiring") but this term regex fragment relies
// on `[A-Z]` — which under `i` degenerates to `[A-Za-z]`. So the regex will
// over-capture at the boundary (e.g. "Staff Data Engineer with 8+ years"
// captures "Staff Data Engineer with"). We fix that in `cleanTitle` by
// splitting on tokens and cutting at the first lowercase-non-connector
// word. That decision belongs in one place — see cleanTitle().
const TITLE_TERM_RE =
  /(?:[A-Z][A-Za-z]*(?:['’]?[A-Za-z]+)?)(?:[ \-\/&]+(?:of|for|and|or|the|to|in)?[ ]*(?:[A-Z][A-Za-z]*(?:['’]?[A-Za-z]+)?)){0,10}/;

const LABEL_PATTERNS: RegExp[] = [
  /(?:^|\n)\s*Job\s*Title\s*[:\-—]\s*([^\n]{2,80})/i,
  /(?:^|\n)\s*Position\s*[:\-—]\s*([^\n]{2,80})/i,
  /(?:^|\n)\s*Role\s*[:\-—]\s*([^\n]{2,80})/i,
  /(?:^|\n)\s*Title\s*[:\-—]\s*([^\n]{2,80})/i,
];

const PROSE_PATTERNS: RegExp[] = [
  new RegExp(`\\bseeks?\\s+(?:a|an|the)\\s+(${TITLE_TERM_RE.source})`, "i"),
  new RegExp(`\\bseeking\\s+(?:a|an|the)\\s+(${TITLE_TERM_RE.source})`, "i"),
  new RegExp(`\\bhiring\\s+(?:a|an|the)\\s+(${TITLE_TERM_RE.source})`, "i"),
  new RegExp(`\\blooking\\s+for\\s+(?:a|an|the)\\s+(${TITLE_TERM_RE.source})`, "i"),
  new RegExp(`\\bfor\\s+the\\s+role\\s+of\\s+(?:a|an|the)?\\s*(${TITLE_TERM_RE.source})`, "i"),
  new RegExp(`\\bfor\\s+the\\s+position\\s+of\\s+(?:a|an|the)?\\s*(${TITLE_TERM_RE.source})`, "i"),
  new RegExp(`\\bas\\s+our\\s+(?:next\\s+|new\\s+)?(${TITLE_TERM_RE.source})`, "i"),
];

const FIRST_LINE_STOP_VERBS = new Set([
  "come", "join", "build", "help", "work", "grow", "shape",
  "lead", "drive", "own", "learn", "make", "we", "our", "the", "who",
  "what", "why", "how", "at",
]);

// Bridging connectors that are allowed INSIDE a title ("Head of Growth",
// "Director for Engineering"). Case-insensitive check; used by cleanTitle.
const TITLE_CONNECTORS = new Set([
  "of", "for", "and", "or", "the", "to", "in", "at",
]);

export function inferJobTitleFromJD(jd: string): string {
  if (!jd || typeof jd !== "string") return "";
  const cleaned = jd.trim();
  if (!cleaned) return "";

  for (const re of LABEL_PATTERNS) {
    const m = cleaned.match(re);
    if (m && m[1]) {
      const t = cleanTitle(m[1]);
      if (isPlausibleTitle(t)) return t;
    }
  }

  for (const re of PROSE_PATTERNS) {
    const m = cleaned.match(re);
    if (m && m[1]) {
      const t = cleanTitle(m[1]);
      if (isPlausibleTitle(t)) return t;
    }
  }

  const firstLine =
    cleaned.split(/\r?\n/).map(s => s.trim()).find(Boolean) ?? "";
  if (firstLine && firstLine.length <= 80 && firstLine.includes(" ")) {
    const stripped = firstLine.replace(/[.!?]\s.*$/, "");
    if (
      /^[A-Z]/.test(stripped) &&
      !/^[A-Z][^.]*\./.test(stripped) &&
      !stripped.includes("?")
    ) {
      const firstWord = stripped.split(/\s+/)[0].toLowerCase();
      if (!FIRST_LINE_STOP_VERBS.has(firstWord)) {
        const t = cleanTitle(stripped);
        if (isPlausibleTitle(t)) return t;
      }
    }
  }

  return "";
}

/**
 * Post-capture normalization. Handles three things the regex can't:
 *
 *   1. Case-insensitive over-capture ("Staff Data Engineer with 8+ years"
 *      → captured all the way to "with"). Cut at the first token that is
 *      neither Title Case nor a connector.
 *   2. Parenthetical suffixes ("Business Information Security Officer (BISO)"
 *      → drop the parenthetical for a cleaner match target).
 *   3. Trailing punctuation.
 */
function cleanTitle(raw: string): string {
  let t = raw.replace(/\s+/g, " ").trim();

  // Drop parentheticals: "Foo (BISO)" → "Foo".
  t = t.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();

  // Cut at first lowercase-non-connector token. First token from the regex
  // is guaranteed uppercase-initial; we start scanning from index 1.
  const tokens = t.split(" ");
  let cutIdx = -1;
  for (let i = 1; i < tokens.length; i++) {
    const w = tokens[i];
    if (!w) continue;
    if (/^[A-Z]/.test(w)) continue;                   // uppercase → keep
    if (TITLE_CONNECTORS.has(w.toLowerCase())) continue; // connector → keep
    cutIdx = i;
    break;
  }
  if (cutIdx > 0) {
    tokens.length = cutIdx;
    // Also drop trailing bridging connectors — "Head of" without a noun
    // after it is nonsense.
    while (
      tokens.length > 1 &&
      TITLE_CONNECTORS.has(tokens[tokens.length - 1].toLowerCase())
    ) {
      tokens.pop();
    }
    t = tokens.join(" ");
  }

  // Drop trailing punctuation.
  t = t.replace(/[,;:.\-]+$/, "").trim();
  return t;
}

function isPlausibleTitle(t: string): boolean {
  if (!t) return false;
  if (t.length < 3 || t.length > 80) return false;
  if (/[.!?]\s/.test(t)) return false;
  if (!/^[A-Z]/.test(t)) return false;
  const words = t.split(/\s+/);
  if (words.length === 1) {
    // Single-word acronym allowed if all caps and 2-6 chars (CTO, CISO,
    // CFO, VP). Reject single mixed-case words (like "Cohere").
    return /^[A-Z]{2,6}$/.test(t);
  }
  return true;
}
