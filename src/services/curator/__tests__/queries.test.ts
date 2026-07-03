/**
 * fix/jobs-curator-relaxation Fix 1 — websearch query construction tests.
 * Verifies the shape of the query string we hand to Postgres websearch_to_tsquery.
 */
import { describe, it, expect } from "vitest";

// Ported from queries.ts for pure-unit testing.
function toWebsearchQuery(roles: string[]): string {
  return roles
    .map(r => r.trim().toLowerCase())
    .filter(Boolean)
    .map(r => {
      const isSingleToken = !/\s/.test(r);
      const safe = r.replace(/"/g, "");
      return isSingleToken ? safe : `"${safe}"`;
    })
    .join(" OR ");
}

describe("toWebsearchQuery (Fix 1)", () => {
  it("quotes multi-word phrases + leaves single tokens unquoted", () => {
    expect(toWebsearchQuery(["Director of Security", "CISO", "Head of Security"]))
      .toBe('"director of security" OR ciso OR "head of security"');
  });
  it("lowercases + trims all inputs", () => {
    expect(toWebsearchQuery(["  CISO  ", "  Chief Security Officer "]))
      .toBe('ciso OR "chief security officer"');
  });
  it("returns empty string for empty input", () => {
    expect(toWebsearchQuery([])).toBe("");
  });
  it("filters out empty/whitespace entries", () => {
    expect(toWebsearchQuery(["", "  ", "CISO"])).toBe("ciso");
  });
  it("strips embedded double quotes defensively", () => {
    expect(toWebsearchQuery(['"Director" of Security']))
      .toBe('"director of security"');
  });
});
