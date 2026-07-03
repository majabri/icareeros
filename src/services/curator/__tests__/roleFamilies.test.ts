/**
 * feat/jobs-for-you-curator Task 8 — role family expansion tests.
 */
import { describe, it, expect } from "vitest";
import { expandTargetRoles, wordOverlapRatio, ROLE_FAMILIES } from "../roleFamilies";

describe("expandTargetRoles", () => {
  it("expands Amir's 5-target-role profile to 30+ synonyms", () => {
    const { expanded, families } = expandTargetRoles([
      "Director of Security", "BISO", "CISO", "Chief Security Officer",
      "Chief Information Security Officer",
    ]);
    expect(expanded.length).toBeGreaterThanOrEqual(30);
    expect(families).toContain("director_of_security");
    expect(families).toContain("ciso");
    expect(families).toContain("biso");
    // Executive family included
    const all = expanded.join(" ").toLowerCase();
    expect(all).toContain("ciso");
    expect(all).toContain("biso");
    expect(all).toContain("head of security");
  });

  it("returns empty families for a role with no taxonomy match", () => {
    const { families } = expandTargetRoles(["Pastry Chef"]);
    expect(families).toEqual([]);
  });

  it("maps CTO family and includes CTO synonyms", () => {
    const { families, expanded } = expandTargetRoles(["CTO"]);
    expect(families).toContain("cto");
    expect(expanded).toContain("chief technology officer");
  });

  it("wordOverlapRatio gives 1.0 on identical, 0 on disjoint", () => {
    expect(wordOverlapRatio("abc def", "abc def")).toBe(1);
    expect(wordOverlapRatio("abc def", "xyz")).toBe(0);
    expect(wordOverlapRatio("", "abc")).toBe(0);
  });

  it("taxonomy has at least 20 families as per brief", () => {
    expect(Object.keys(ROLE_FAMILIES).length).toBeGreaterThanOrEqual(20);
  });
});
