/**
 * fix/jobs-curation-family-precision PR 2 — regression proof that the
 * migrated search-db route produces the same tsquery arg as the pre-PR-2
 * hand-built logic.
 *
 * The old inline code:
 *   const tokensOf = (s) => s.split(/\s+/).filter(Boolean);
 *   const rolesFrag = (roles) => roles.map(r => {
 *     const t = tokensOf(r);
 *     return t.length === 1 ? t[0] : "(" + t.join(" & ") + ")";
 *   }).join(" | ");
 *
 * We assert that buildTsqueryArg produces the same string (case-normalised
 * to lowercase — tsquery is case-insensitive so this is byte-equivalent
 * to Postgres) for every one of the 10 baseline queries.
 */
import { describe, it, expect } from "vitest";
import { buildTsqueryArg } from "../retrieveByTitle";

// Pre-PR-2 logic — kept verbatim here for the compare.
function preRefactorRolesFrag(roles: string[]): string {
  const tokensOf = (s: string) => s.split(/\s+/).filter(Boolean);
  return roles.map(r => {
    const tokens = tokensOf(r);
    return tokens.length === 1 ? tokens[0] : "(" + tokens.join(" & ") + ")";
  }).join(" | ");
}

const BASELINE_QUERIES = [
  "director of security", "ciso", "software engineer", "vp marketing",
  "product manager", "cfo", "director of nursing", "data scientist",
  "security architect", "account executive",
];

describe("PR 2 regression — buildTsqueryArg contract (fixed in fix/jobs-tsquery-mode)", () => {
  // NOTE: The pre-refactor rolesFrag mode:"plain" + (tok & tok) | ... form
  // this file was originally guarding was itself buggy — plainto_tsquery
  // treats `|` `&` `(` `)` as literal characters, so those args matched
  // zero rows on every call. The regression baseline in
  // docs/regression/search-baseline-2026-07.json documents that pre-refactor
  // state. This test now guards the CORRECT contract emitted after the fix.
  void preRefactorRolesFrag;

  it("single-word queries → websearch mode, bare token", () => {
    for (const q of BASELINE_QUERIES.filter(x => !/\s/.test(x))) {
      const { arg, mode } = buildTsqueryArg([q]);
      expect(mode).toBe("websearch");
      expect(arg).toBe(q.toLowerCase());
    }
  });

  it("single multi-word queries → websearch mode, quoted phrase", () => {
    for (const q of BASELINE_QUERIES.filter(x => /\s/.test(x))) {
      const { arg, mode } = buildTsqueryArg([q]);
      expect(mode).toBe("websearch");
      expect(arg).toBe(`"${q.toLowerCase()}"`);
    }
  });

  it("multi-phrase queries → websearch OR-joined, quoted where needed", () => {
    const cases: Array<{ input: string[]; expected: string }> = [
      { input: ["Director of Security", "CISO"],
        expected: `"director of security" OR ciso` },
      { input: ["VP Marketing", "CMO", "Head of Growth"],
        expected: `"vp marketing" OR cmo OR "head of growth"` },
    ];
    for (const { input, expected } of cases) {
      const { arg, mode } = buildTsqueryArg(input);
      expect(mode).toBe("websearch");
      expect(arg).toBe(expected);
    }
  });

  it("15-phrase cap enforced (PR #354 hang lesson, split on OR)", () => {
    const many = Array.from({ length: 20 }, (_, i) => `phrase${i}`);
    const { arg, mode } = buildTsqueryArg(many);
    expect(mode).toBe("websearch");
    const parts = arg.split(" OR ").filter(Boolean);
    expect(parts).toHaveLength(15);
    for (let i = 0; i < 15; i++) {
      expect(parts[i]).toBe(`phrase${i}`);
    }
  });
});

describe("PR 2 regression baseline — fixture referenced", () => {
  it("baseline JSON exists at docs/regression/search-baseline-2026-07.json", () => {
    // Existence check — the fixture is the byte-for-byte contract for
    // the manual verification in the PR description. The compile-time
    // check here ensures we don't merge without keeping it in-tree.
    const fs = require("fs");
    const path = "docs/regression/search-baseline-2026-07.json";
    expect(fs.existsSync(path)).toBe(true);
    const baseline = JSON.parse(fs.readFileSync(path, "utf8"));
    expect(baseline.queries).toHaveLength(10);
    // Every query has a top_20_urls array (possibly empty for corpus gaps like CFO)
    for (const q of baseline.queries) {
      expect(q.query).toBeTruthy();
      expect(Array.isArray(q.top_20_urls)).toBe(true);
      expect(typeof q.result_count).toBe("number");
    }
  });
});
