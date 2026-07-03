/**
 * fix/jobs-smart-apply-issues Fix 6 — tsquery construction tests.
 */
import { describe, it, expect } from "vitest";

const tokensOf = (s: string) => s.split(/\s+/).filter(Boolean);
const rolesFrag = (roles: string[]) =>
  roles.map(r => {
    const tokens = tokensOf(r);
    return tokens.length === 1 ? tokens[0] : "(" + tokens.join(" & ") + ")";
  }).join(" | ");

function buildTsquery(targetRoles: string[], query: string): string {
  let effectiveRoles = targetRoles;
  let effectiveQuery = query;
  if (effectiveRoles.length === 0 && /\s+OR\s+/i.test(query)) {
    effectiveRoles = query.split(/\s+OR\s+/i).map(s => s.trim()).filter(Boolean);
    effectiveQuery = "";
  }
  if (effectiveRoles.length > 0 && effectiveQuery) {
    return "(" + rolesFrag(effectiveRoles) + ") & (" + tokensOf(effectiveQuery).join(" & ") + ")";
  }
  if (effectiveRoles.length > 0) return rolesFrag(effectiveRoles);
  return effectiveQuery;
}

describe("search-db tsquery construction (Fix 6)", () => {
  it("OR-joins multiple target roles with proper ANDs within each role", () => {
    expect(buildTsquery(["Director of Security", "CISO", "BISO"], "")).toBe("(Director & of & Security) | CISO | BISO");
  });
  it("combines targetRoles with refine query using AND", () => {
    expect(buildTsquery(["Director of Security", "CISO"], "remote")).toBe("((Director & of & Security) | CISO) & (remote)");
  });
  it("passes single role through without OR", () => {
    expect(buildTsquery(["CISO"], "")).toBe("CISO");
  });
  it("legacy back-compat — splits OR-joined query string when targetRoles empty", () => {
    expect(buildTsquery([], "Director of Security OR CISO")).toBe("(Director & of & Security) | CISO");
  });
  it("returns bare query when neither targetRoles nor OR-syntax present", () => {
    expect(buildTsquery([], "remote engineer")).toBe("remote engineer");
  });
  it("multi-word refine ANDs at outer level with roles OR-group", () => {
    expect(buildTsquery(["CISO", "BISO"], "remote senior")).toBe("(CISO | BISO) & (remote & senior)");
  });
});
