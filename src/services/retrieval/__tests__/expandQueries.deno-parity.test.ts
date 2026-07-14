/**
 * fix/jobs-tsquery-mode — upgraded parity + contract test.
 *
 * The previous version (PR #371) asserted only that Deno vs Node produced
 * the same groups. It PASSED while the tsquery mode+arg contract was
 * simultaneously broken (mode:"plain" + operator-laden arg → 0 rows).
 * That was the wrong invariant.
 *
 * This version tests the FULL contract the SDK requires:
 *   (a) mode ∈ { "plain", "phrase", "websearch" }  — supabase-js only
 *       accepts these three; anything else is silently swallowed
 *   (b) arg parses under that mode's Postgres semantics
 *       ⇒ mode:"plain" cannot contain `|` `&` `(` `)` because
 *         plainto_tsquery escapes them as literal characters
 *       ⇒ mode:"phrase" cannot contain `|` `&` `(` `)` for the
 *         same reason (phraseto_tsquery is similarly literal)
 *   (c) Deno and Node emit IDENTICAL mode + arg for every archetype
 *   (d) A canned corpus fixture yields >0 matches for a known-good
 *       profile — zero-result-on-known-good-input is a red build
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { expandQueries, normalisePhrase } from "../expandQueries";
import { buildTsqueryArg } from "../retrieveByTitle";
import {
  expandQueriesDeno,
  normalisePhraseDeno,
  buildTsqueryArgDeno,
} from "../../../../supabase/functions/curate-user-recommendations/lib";

const ARCHETYPES: Record<string, string[]> = {
  amir_five_security: [
    "Director of Security", "biso", "ciso",
    "Chief Security Officer", "Chief Information Security Officer",
  ],
  vp_marketing:       ["VP Marketing", "CMO", "Head of Growth"],
  software_engineer:  ["Software Engineer", "Senior Software Engineer"],
  cfo_finance:        ["CFO", "VP Finance", "Controller"],
  director_nursing:   ["Director of Nursing", "Clinical Director"],
  empty:              [],
  whitespace_only:    ["  ", "\t"],
  case_variants:      ["ciso", "CISO", "Ciso"],
};

// The three modes supabase-js accepts.
const SDK_SUPPORTED_MODES = new Set(["plain", "phrase", "websearch"]);

/**
 * Simulates plainto_tsquery / phraseto_tsquery's "operators are literal
 * characters" behavior. If any of these chars appear in the arg while
 * the mode says "plain" or "phrase", the Postgres side will tokenise
 * them as literals and the query will silently return 0 rows.
 */
function argIsSafeForPlainOrPhrase(arg: string): boolean {
  return !/[|&()]/.test(arg);
}

describe("normalisePhrase parity — Node vs Deno", () => {
  const cases = [
    "Director of Security", "Head of Growth", "VP,  Marketing",
    "  CFO  ", "Cyber-Security", "AI/ML Engineer", "biso",
  ];
  for (const c of cases) {
    it(`normalises "${c}" identically`, () => {
      expect(normalisePhraseDeno(c)).toBe(normalisePhrase(c));
    });
  }
});

describe("expandQueries parity — Node vs Deno", () => {
  for (const [name, roles] of Object.entries(ARCHETYPES)) {
    it(`archetype '${name}' produces identical groups (Fix 4 dedupe applies)`, () => {
      const node = expandQueries(roles);
      const deno = expandQueriesDeno(roles);
      expect(deno.length).toBe(node.length);
      for (let i = 0; i < node.length; i++) {
        expect(deno[i].label).toBe(node[i].label);
        expect(new Set(deno[i].queries)).toEqual(new Set(node[i].queries));
      }
    });
  }
});

describe("Fix 4 — expandQueries dedupes identical query sets", () => {
  it("Amir's 5 security roles collapse from 5 → 3 groups (ciso family merged)", () => {
    const groups = expandQueries(ARCHETYPES.amir_five_security);
    // Groups by label after dedupe: "Director of Security", "biso", "ciso"
    // ("Chief Security Officer" + "Chief Information Security Officer"
    // both produce the ciso-family query set → collapsed into "ciso")
    expect(groups.map(g => g.label)).toEqual(
      ["Director of Security", "biso", "ciso"],
    );
    expect(expandQueriesDeno(ARCHETYPES.amir_five_security).map(g => g.label))
      .toEqual(["Director of Security", "biso", "ciso"]);
  });
});

// ── The critical contract test — mode+arg not just groups ──────────────
describe("buildTsqueryArg contract — mode + arg + SDK compatibility", () => {
  const phraseSets: string[][] = [
    [],
    ["biso"],
    ["biso", "business information security officer"],
    // BISO family (Amir's actual expansion)
    [
      "biso", "business information security officer",
      "business information security", "business security officer",
      "divisional ciso", "business unit ciso",
    ],
    // CISO family
    [
      "ciso", "chief information security officer", "chief security officer",
      "chief information security", "chief cybersecurity officer", "cso",
      "global ciso", "deputy ciso", "ciso office", "ciso deputy",
      "associate ciso", "field ciso", "virtual ciso", "vciso",
      "security executive",
    ],
    // Marketing family — anti-query test
    [
      "director of marketing", "marketing director", "director growth",
      "director demand generation", "director performance marketing",
    ],
    // 20-phrase spam to force the 15-cap
    Array.from({ length: 20 }, (_, i) => `role-${i}`),
    // Mixed single-word + multi-word
    ["ciso", "chief security officer", "cso"],
  ];

  for (const phrases of phraseSets) {
    const key = JSON.stringify(phrases).slice(0, 60);

    it(`phrases=${key} — Deno matches Node exactly (mode AND arg)`, () => {
      expect(buildTsqueryArgDeno(phrases)).toEqual(buildTsqueryArg(phrases));
    });

    it(`phrases=${key} — emits SDK-supported mode`, () => {
      const { mode } = buildTsqueryArg(phrases);
      expect(SDK_SUPPORTED_MODES.has(mode)).toBe(true);
    });

    it(`phrases=${key} — arg safely parses under its mode's Postgres semantics`, () => {
      const { arg, mode } = buildTsqueryArg(phrases);
      // fix/jobs-tsquery-mode narrowed the return type to mode:"websearch"
      // exclusively, so the "operators-as-literals" trap (plainto_tsquery /
      // phraseto_tsquery treating `|` `&` `(` `)` as literal chars) is
      // structurally impossible. We keep the guard so a future refactor
      // that widens the return type back to "plain"|"phrase" without
      // sanitising the arg fails LOUDLY at unit-test time.
      const runtimeMode = mode as "plain" | "phrase" | "websearch";
      if (runtimeMode === "plain" || runtimeMode === "phrase") {
        expect(argIsSafeForPlainOrPhrase(arg)).toBe(true);
      }
    });
  }
});

// ── Fix 3 — the canned-corpus smoke test ────────────────────────────
describe("smoke test — canned corpus yields >0 matches for known-good profile", () => {
  // Fixture: a hand-picked slice of ats_jobs titles across security exec
  // families. Includes obvious matches AND obvious mismatches, so a fully
  // broken emitter (0 rows on everything) OR a wildly over-broad emitter
  // (marketing leaks into a security query) both fail.
  const CORPUS: Array<{ title: string; is_security: boolean }> = [
    { title: "Chief Information Security Officer (CISO)",       is_security: true },
    { title: "Field Chief Information Security Officer",         is_security: true },
    { title: "Deputy Chief Information Security Officer (CISO)", is_security: true },
    { title: "Director, Information Security",                   is_security: true },
    { title: "Head of Security Architecture, Managing Director", is_security: true },
    { title: "Manager, Business Information Security Office",    is_security: true },
    { title: "Director, Performance Marketing",                  is_security: false },
    { title: "Director of Marketing",                            is_security: false },
    { title: "Senior Product Manager",                           is_security: false },
    { title: "Staff Software Engineer",                          is_security: false },
  ];

  /**
   * Naive websearch-clause matcher — approximates websearch_to_tsquery's
   * behaviour well enough for a JS smoke test. Not a full ts implementation.
   * Handles bare tokens (matches by token boundary) and quoted phrases
   * (matches by substring after lowercasing).
   */
  function websearchMatches(arg: string, title: string): boolean {
    const t = title.toLowerCase();
    // Split on `OR` (websearch's disjunction). Each clause is either a
    // bare token or a "quoted phrase". Whitespace between clauses without
    // OR is implicit AND — we don't produce that form.
    const clauses = arg.split(/\s+OR\s+/i).map(c => c.trim()).filter(Boolean);
    return clauses.some(clause => {
      if (clause.startsWith('"') && clause.endsWith('"')) {
        return t.includes(clause.slice(1, -1));
      }
      // Bare token: check word-boundary presence.
      return new RegExp(`\\b${clause}\\b`).test(t);
    });
  }

  it("Amir's 5-target profile matches at least ONE security row per group", () => {
    const groups = expandQueries(ARCHETYPES.amir_five_security);
    for (const g of groups) {
      const { arg, mode } = buildTsqueryArg(g.queries);
      expect(mode).toBe("websearch");   // must be websearch after Fix 1
      const hits = CORPUS.filter(row => websearchMatches(arg, row.title));
      expect(hits.length).toBeGreaterThan(0);
      // AND — the anti-query invariant: no marketing leaks
      expect(hits.every(h => h.is_security)).toBe(true);
    }
  });

  it("Marketing family DOES match the marketing rows (positive control)", () => {
    // Ensures the smoke test's matcher isn't broken.
    const mkt = [
      "director of marketing", "marketing director", "director growth",
      "director demand generation", "director performance marketing",
    ];
    const { arg, mode } = buildTsqueryArg(mkt);
    expect(mode).toBe("websearch");
    const hits = CORPUS.filter(row => websearchMatches(arg, row.title));
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every(h => !h.is_security)).toBe(true);
  });

  it("Deno emitter passes the same smoke test", () => {
    const groups = expandQueriesDeno(ARCHETYPES.amir_five_security);
    for (const g of groups) {
      const { arg, mode } = buildTsqueryArgDeno(g.queries);
      expect(mode).toBe("websearch");
      const hits = CORPUS.filter(row => websearchMatches(arg, row.title));
      expect(hits.length).toBeGreaterThan(0);
      expect(hits.every(h => h.is_security)).toBe(true);
    }
  });
});
