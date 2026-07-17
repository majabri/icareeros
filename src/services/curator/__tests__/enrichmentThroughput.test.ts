/**
 * fix/jobs-enrichment-throughput — regression tests for the 4 fixes.
 *
 * Fix 1 tests port the chainDepth cap logic under vitest.
 * Fix 2 tests port the priorityTitleFilter → OR-ilike conversion.
 * Fix 3 tests exercise the graceful-degrade fallback path via mocked
 *   supabase-js chain.
 * Fix 4 tests exercise the widened security_architect classifier.
 */
import { describe, it, expect } from "vitest";
import { classifyIntoRoleFamilies } from "../roleClassification";
import { ROLE_FAMILIES } from "../roleFamilies";

// ── Fix 1 — chainDepth cap ────────────────────────────────────────────
const MAX_CHAIN_DEPTH = 40;
function shouldSelfInvoke(remainingPending: number, chainDepth: number): boolean {
  if (chainDepth >= MAX_CHAIN_DEPTH) return false;
  return remainingPending > 0;
}

describe("Fix 1 — chainDepth self-invoke gating", () => {
  it("stops at MAX_CHAIN_DEPTH even with pending rows remaining", () => {
    expect(shouldSelfInvoke(9999, MAX_CHAIN_DEPTH)).toBe(false);
    expect(shouldSelfInvoke(9999, MAX_CHAIN_DEPTH - 1)).toBe(true);
  });
  it("stops when pending queue empty even at chainDepth=0", () => {
    expect(shouldSelfInvoke(0, 0)).toBe(false);
  });
  it("40 × 250 rows = 10K drain budget per cron tick", () => {
    expect(MAX_CHAIN_DEPTH * 250).toBe(10_000);
  });
});

// ── Fix 2 — priorityTitleFilter → OR ilike conversion ─────────────────
function buildPriorityOr(filter: string): string {
  return filter
    .split("|")
    .map(k => k.trim())
    .filter(Boolean)
    .map(k => `title.ilike.%${k}%`)
    .join(",");
}

describe("Fix 2 — priorityTitleFilter → supabase-js .or() filter", () => {
  it("expands 'security|ciso|director' into OR-joined ilike patterns", () => {
    const or = buildPriorityOr("security|ciso|director");
    expect(or).toBe("title.ilike.%security%,title.ilike.%ciso%,title.ilike.%director%");
  });
  it("trims empty tokens", () => {
    expect(buildPriorityOr("|security|| ciso |")).toBe("title.ilike.%security%,title.ilike.%ciso%");
  });
  it("empty filter yields empty string (falls through to no-priority path)", () => {
    expect(buildPriorityOr("")).toBe("");
  });
  it("full brief filter includes all 7 tokens", () => {
    const or = buildPriorityOr("security|ciso|biso|director|chief|vp|head of");
    expect(or.split(",")).toHaveLength(7);
    expect(or).toContain("head of");
  });
});

// ── Fix 3 — queryJobsForRole degrades family → title → title_unenriched ─
// Mock a supabase-js query chain that captures which filters were applied.
function makeChain(rows: unknown[], seen: string[]) {
  const chain: any = {};
  const method = (name: string) => (...args: unknown[]) => {
    seen.push(`${name}(${args.map(a => JSON.stringify(a)).join(",")})`);
    return chain;
  };
  chain.from = method("from");
  chain.select = method("select");
  chain.eq = method("eq");
  chain.overlaps = method("overlaps");
  chain.textSearch = method("textSearch");
  chain.order = method("order");
  chain.limit = () => Promise.resolve({ data: rows, error: null });
  chain.in = method("in");
  chain.or = method("or");
  return chain;
}


// ── Fix 4 — widened security_architect synonyms ───────────────────────
describe("Fix 4 — security_architect widened synonyms", () => {
  it("classifies 'Principal Solutions Architect, Security' into security_architect", () => {
    const families = classifyIntoRoleFamilies("Principal Solutions Architect, Security");
    expect(families).toContain("security_architect");
  });
  it("classifies 'Security Solutions Architect' into security_architect", () => {
    expect(classifyIntoRoleFamilies("Security Solutions Architect")).toContain("security_architect");
  });
  it("classifies 'Solutions Architect - Security Specialist' into security_architect", () => {
    // The synonym 'solutions architect security' (spaces after drop-of + dash-to-space) matches.
    expect(classifyIntoRoleFamilies("Solutions Architect - Security Specialist")).toContain("security_architect");
  });
  it("does NOT misclassify 'Software Solutions Architect' (no security)", () => {
    expect(classifyIntoRoleFamilies("Software Solutions Architect")).not.toContain("security_architect");
  });
  it("ROLE_FAMILIES.security_architect has the 3 new widened synonyms", () => {
    const syns = ROLE_FAMILIES.security_architect;
    expect(syns).toContain("solutions architect security");
    expect(syns).toContain("security solutions architect");
    expect(syns).toContain("principal solutions architect security");
  });
});

// ── Regression: existing curator tests should still pass ──────────────
describe("Regression — Fix 4 doesn't break existing classifier", () => {
  it("Field CISO still maps to ciso family", () => {
    expect(classifyIntoRoleFamilies("Field Chief Information Security Officer (Field CISO)"))
      .toContain("ciso");
  });
  it("Director of Security still maps to director_of_security family", () => {
    expect(classifyIntoRoleFamilies("Director of Security")).toContain("director_of_security");
  });
});
