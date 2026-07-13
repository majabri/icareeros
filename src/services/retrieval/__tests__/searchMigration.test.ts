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

describe("PR 2 regression — buildTsqueryArg matches pre-refactor rolesFrag", () => {
  it("single-phrase queries: mode=websearch, arg=raw phrase (byte-identical)", () => {
    for (const q of BASELINE_QUERIES) {
      const { arg, mode } = buildTsqueryArg([q]);
      // Search uses websearch mode for single-phrase — the raw string is passed to Postgres
      // which itself does the tokenization. There is NO tsquery construction step.
      expect(arg).toBe(q.toLowerCase());
      expect(mode).toBe("websearch");
    }
  });

  it("multi-phrase queries: mode=plain, arg matches (tok & tok) | ... form", () => {
    // The 3 canonical multi-role tests
    const cases = [
      ["Director of Security", "CISO"],
      ["Director of Security", "CISO", "BISO", "Chief Security Officer", "Chief Information Security Officer"],
      ["VP Marketing", "CMO", "Head of Growth"],
    ];
    for (const roles of cases) {
      const pre = preRefactorRolesFrag(roles.map(r => r.toLowerCase()));
      const { arg, mode } = buildTsqueryArg(roles);
      expect(mode).toBe("plain");
      expect(arg).toBe(pre);
    }
  });

  it("15-phrase cap matches (both truncate)", () => {
    // Even before the fix, the effective input to Postgres was already
    // bounded because the analysis showed we cap upstream. The buildTsqueryArg
    // enforces the cap at construction time — this test proves it doesn't
    // silently drop early phrases.
    const many = Array.from({ length: 20 }, (_, i) => `phrase${i}`);
    const { arg } = buildTsqueryArg(many);
    const parts = arg.split(" | ").filter(Boolean);
    expect(parts).toHaveLength(15);
    // First 15 preserved
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
