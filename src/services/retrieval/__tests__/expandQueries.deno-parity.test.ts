/**
 * fix/jobs-curator-deno-port — parity test between the Node-side
 * `expandQueries` (src/services/retrieval/expandQueries.ts) and the
 * Deno-side `expandQueriesDeno` in
 * supabase/functions/curate-user-recommendations/lib.ts.
 *
 * Same test for `buildTsqueryArg` ↔ `buildTsqueryArgDeno`.
 *
 * If the ROLE_FAMILIES taxonomy drifts on either side, or if either
 * function's normalisation logic diverges, this test fails. That was
 * the class of bug PR #370 shipped — call sites for functions that
 * were never defined — plus the deeper class where the Deno side and
 * the Next.js side compute different retrieval groups for the same
 * target roles.
 */
import { describe, it, expect } from "vitest";
import { expandQueries, normalisePhrase } from "../expandQueries";
import { buildTsqueryArg } from "../retrieveByTitle";
import {
  expandQueriesDeno,
  normalisePhraseDeno,
  buildTsqueryArgDeno,
} from "../../../../supabase/functions/curate-user-recommendations/lib";

// Every archetype the Node-side test file covers, plus Amir's actual
// 5-target set as it lives in prod (verified via SQL against
// user_profiles.target_roles for majabri714@gmail.com on 2026-07-13).
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
    it(`archetype '${name}' produces identical groups`, () => {
      const node = expandQueries(roles);
      const deno = expandQueriesDeno(roles);
      expect(deno.length).toBe(node.length);
      for (let i = 0; i < node.length; i++) {
        expect(deno[i].label).toBe(node[i].label);
        // Queries are Sets under the hood — order should match because
        // both sides use insertion order, but assert set-equality
        // defensively so a re-ordering refactor on one side doesn't
        // false-fail. The critical invariant is: same queries.
        expect(new Set(deno[i].queries)).toEqual(new Set(node[i].queries));
      }
    });
  }
});

describe("buildTsqueryArg parity — Node vs Deno", () => {
  const phraseSets = [
    [],
    ["biso"],
    ["biso", "business information security officer"],
    // Amir's biso family expansion — exact plain-mode OR form
    [
      "biso", "business information security officer",
      "business information security", "business security officer",
      "divisional ciso", "business unit ciso",
    ],
    // 20 phrases — force the 15-cap
    Array.from({ length: 20 }, (_, i) => `role-${i}`),
    // Mixed single-word + multi-word
    ["ciso", "chief security officer", "cso"],
  ];
  for (const phrases of phraseSets) {
    it(`phrases=${JSON.stringify(phrases).slice(0, 60)} produce identical tsquery`, () => {
      const node = buildTsqueryArg(phrases);
      const deno = buildTsqueryArgDeno(phrases);
      expect(deno).toEqual(node);
    });
  }
});
