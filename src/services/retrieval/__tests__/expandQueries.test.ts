/**
 * fix/jobs-curation-family-precision PR 1 — synonymsForExact + expandQueries.
 *
 * Tests validated against all 5 profile archetypes from the brief:
 *   (a) Amir security exec
 *   (b) VP Marketing (VP Marketing / CMO / Head of Growth)
 *   (c) Single-title mid ("Software Engineer")
 *   (d) CFO finance
 *   (e) Healthcare (Director of Nursing / Clinical Director)
 */
import { describe, it, expect } from "vitest";
import { synonymsForExact, expandQueries, normalisePhrase } from "../expandQueries";

describe("normalisePhrase", () => {
  it("lowercases, strips stopwords, collapses whitespace", () => {
    expect(normalisePhrase("Director of Security")).toBe("director security");
    expect(normalisePhrase("Head of Growth")).toBe("head growth");
    expect(normalisePhrase("VP,  Marketing")).toBe("vp marketing");
  });
  it("preserves acronyms and drops leading/trailing whitespace", () => {
    expect(normalisePhrase("  CFO  ")).toBe("cfo");
    expect(normalisePhrase("Cyber-Security")).toBe("cyber security");
  });
});

describe("synonymsForExact — archetype (a) Amir security exec", () => {
  it("'Director of Security' returns director_of_security synonyms ONLY", () => {
    const s = synonymsForExact("Director of Security");
    const lowered = s.map(x => x.toLowerCase());
    // Positive: contains director_of_security own synonyms
    expect(lowered).toContain("director of security");
    expect(lowered).toContain("head of security");
    expect(lowered).toContain("director of information security");
    // Negative: does NOT contain product/engineering/marketing/sales
    for (const bad of [
      "director of product", "director of engineering",
      "director of marketing", "director of sales",
      "director of data", "director of design",
      "director of people", "director of operations",
    ]) {
      expect(lowered).not.toContain(bad);
    }
  });
  it("'ciso' returns ciso family and does NOT pull cto/cco/cdo/cfo via substring", () => {
    const s = synonymsForExact("ciso").map(x => x.toLowerCase());
    expect(s).toContain("ciso");
    expect(s).toContain("chief information security officer");
    expect(s).toContain("field ciso");   // Vanta risk from analysis — must survive
    expect(s).toContain("vciso");
    // The cto family owner "cto" must NOT appear
    expect(s).not.toContain("cto");
    expect(s).not.toContain("chief technology officer");
    expect(s).not.toContain("chief financial officer");
  });
  it("Amir's full 5-title profile expands cleanly (no 23-family explosion)", () => {
    const groups = expandQueries([
      "Director of Security", "biso", "ciso",
      "Chief Security Officer", "Chief Information Security Officer",
    ]);
    // fix/jobs-tsquery-mode Fix 4 — ciso / "Chief Security Officer" /
    //   "Chief Information Security Officer" all resolve to the ciso
    //   family and produce the same query set → collapse to one group.
    //   Pre-Fix-4 this was 5; the correct behaviour is 3.
    expect(groups).toHaveLength(3);
    expect(groups.map(g => g.label)).toEqual([
      "Director of Security", "biso", "ciso",
    ]);
    // Union of all groups' queries must contain zero director-of-product-etc phrases
    const union = new Set(groups.flatMap(g => g.queries.map(q => q.toLowerCase())));
    for (const bad of [
      "director of product", "director of engineering",
      "director of marketing", "director of sales",
      "director of people", "director of operations",
      "cto", "chief technology officer",
    ]) {
      expect(union.has(bad), `polluted: ${bad}`).toBe(false);
    }
  });
});

describe("synonymsForExact — archetype (b) VP Marketing", () => {
  it("'VP Marketing' returns cmo family synonyms, no vp_sales / vp_product pollution", () => {
    const s = synonymsForExact("VP Marketing").map(x => x.toLowerCase());
    // Positive: VP marketing is a canonical cmo synonym
    expect(s).toContain("vp marketing");
    expect(s).toContain("cmo");
    expect(s).toContain("chief marketing officer");
    // Negative: no vp_sales or vp_product bleed
    expect(s).not.toContain("vp sales");
    expect(s).not.toContain("vp product");
    expect(s).not.toContain("vp engineering");
  });
  it("'CMO' → cmo family", () => {
    const s = synonymsForExact("CMO").map(x => x.toLowerCase());
    expect(s).toContain("cmo");
    expect(s).toContain("chief marketing officer");
  });
});

describe("synonymsForExact — archetype (c) Software Engineer (mid-level)", () => {
  it("bare 'Software Engineer' unknown to family taxonomy returns empty", () => {
    // The current taxonomy doesn't own 'software engineer' as a synonym in
    // any family — expandQueries falls through to the raw title. This is
    // the expected behavior: no false family attachment.
    expect(synonymsForExact("Software Engineer")).toEqual([]);
  });
  it("'Senior Software Engineer' maps to senior_engineer family", () => {
    const s = synonymsForExact("Senior Software Engineer").map(x => x.toLowerCase());
    expect(s).toContain("senior software engineer");
    expect(s).toContain("senior swe");
  });
});

describe("synonymsForExact — archetype (d) CFO / finance", () => {
  it("'CFO' returns cfo family and 'cfo' substring inside longer words never triggers", () => {
    const s = synonymsForExact("CFO").map(x => x.toLowerCase());
    expect(s).toContain("cfo");
    expect(s).toContain("chief financial officer");
    expect(s).toContain("vp finance");
    // Sanity: cfo is not accidentally matched by titles containing "cfo" as a substring
    expect(synonymsForExact("official officer")).toEqual([]);
    expect(synonymsForExact("Director of Facilities")).toEqual([]);  // no false CFO hit
  });
  it("'VP Finance' finds cfo family via exact synonym membership", () => {
    const s = synonymsForExact("VP Finance").map(x => x.toLowerCase());
    expect(s).toContain("vp finance");
    expect(s).toContain("cfo");
  });
  it("'Controller' returns controller family only", () => {
    const s = synonymsForExact("Controller").map(x => x.toLowerCase());
    expect(s).toContain("controller");
    expect(s).toContain("financial controller");
    expect(s).not.toContain("cfo");   // controller family is separate
  });
});

describe("synonymsForExact — archetype (e) Healthcare", () => {
  it("'Director of Nursing' unknown to taxonomy returns empty — no false families", () => {
    // No nursing family exists yet — brief accepts empty as the correct
    // behavior (raw title still fed to retrieval).
    expect(synonymsForExact("Director of Nursing")).toEqual([]);
  });
  it("'Clinical Director' unknown returns empty", () => {
    expect(synonymsForExact("Clinical Director")).toEqual([]);
  });
});

describe("synonymsForExact — negatives (defensive)", () => {
  it("unknown title returns empty", () => {
    expect(synonymsForExact("Underwater Basket Weaver")).toEqual([]);
  });
  it("empty input returns empty", () => {
    expect(synonymsForExact("")).toEqual([]);
    expect(synonymsForExact("   ")).toEqual([]);
  });
});

describe("expandQueries — R2 multi-title provenance", () => {
  it("Amir 5 targets → 3 groups (Fix 4 dedupe), each ≤ 15 queries", () => {
    const groups = expandQueries([
      "Director of Security", "biso", "ciso",
      "Chief Security Officer", "Chief Information Security Officer",
    ]);
    // fix/jobs-tsquery-mode Fix 4 — the last two targets both map to
    //   the ciso family and produce the same query set as "ciso" itself,
    //   so they collapse. First label wins.
    expect(groups).toHaveLength(3);
    for (const g of groups) {
      expect(g.queries.length).toBeLessThanOrEqual(15);
      expect(g.queries.length).toBeGreaterThan(0);
    }
    expect(groups.map(g => g.label)).toEqual([
      "Director of Security", "biso", "ciso",
    ]);
  });
  it("VP Marketing / CMO / Head of Growth → 2 groups (Fix 4 collapses CMO into VP Marketing family)", () => {
    const groups = expandQueries(["VP Marketing", "CMO", "Head of Growth"]);
    // Fix 4: VP Marketing + CMO both live in the cmo family → merged into
    // the first label ("VP Marketing"). Head of Growth is unknown to the
    // taxonomy so it falls through to raw and becomes its own group.
    expect(groups).toHaveLength(2);
    expect(groups.map(g => g.label)).toEqual(["VP Marketing", "Head of Growth"]);
    // Head of Growth isn't in the taxonomy → falls through to raw
    expect(groups[1].queries).toEqual(["head of growth"]);
  });
  it("dedupes case-insensitive input labels", () => {
    const groups = expandQueries(["CISO", "ciso", "Ciso"]);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("CISO");
  });
  it("skips empty target roles", () => {
    const groups = expandQueries(["", "  ", "CFO"]);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("CFO");
  });
  it("unknown title still produces a group with just the raw query", () => {
    const groups = expandQueries(["Director of Nursing"]);
    expect(groups).toHaveLength(1);
    expect(groups[0].queries).toEqual(["director of nursing"]);
  });
});
