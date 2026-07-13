/**
 * fix/jobs-curation-family-precision PR 1 — retrieveByTitle primitive.
 *
 * Focus on the pure logic (tsquery construction, phrase cap, dedup+
 * retrievedFor accumulation). The DB integration is exercised by PR 2's
 * baseline diff + PR 3's archetype regression suite.
 */
import { describe, it, expect } from "vitest";
import { buildTsqueryArg, MAX_PHRASES_PER_TSQUERY, retrieveByTitle } from "../retrieveByTitle";

describe("buildTsqueryArg — Search vs Curation modes", () => {
  it("single phrase → websearch mode with the raw phrase passed through", () => {
    expect(buildTsqueryArg(["director of security"])).toEqual({
      arg: "director of security", mode: "websearch",
    });
  });
  it("multi phrase → plain mode with OR-joined (tok & tok)", () => {
    const { arg, mode } = buildTsqueryArg(["director of security", "ciso", "chief security officer"]);
    expect(mode).toBe("plain");
    expect(arg).toBe("(director & of & security) | ciso | (chief & security & officer)");
  });
  it("empty input → empty arg (caller skips textSearch)", () => {
    expect(buildTsqueryArg([])).toEqual({ arg: "", mode: "websearch" });
    expect(buildTsqueryArg(["", "  "])).toEqual({ arg: "", mode: "websearch" });
  });
  it("15-phrase cap enforced (PR #354 hang lesson)", () => {
    const many = Array.from({ length: 30 }, (_, i) => `phrase${i}`);
    const { arg } = buildTsqueryArg(many);
    // 15 pipes → 16 fragments would be too many; each phrase is one token so we get 15 pieces
    const parts = arg.split(" | ").filter(Boolean);
    expect(parts.length).toBe(MAX_PHRASES_PER_TSQUERY);
  });
  it("lowercases every phrase before tsquery construction", () => {
    const { arg } = buildTsqueryArg(["CISO", "Chief Information Security Officer"]);
    expect(arg).toBe("ciso | (chief & information & security & officer)");
  });
});

// ── Mock supabase-js chain so we can exercise queryGroups dedup logic ─
function makeMockSupabase(rowsByTsquery: Record<string, unknown[]>) {
  return {
    from() {
      const chain: any = {};
      let lastTs = "";
      const passThrough = () => chain;
      chain.select = passThrough;
      chain.eq = passThrough;
      chain.ilike = passThrough;
      chain.in = passThrough;
      chain.gte = passThrough;
      chain.order = passThrough;
      chain.textSearch = (_col: string, arg: string) => { lastTs = arg; return chain; };
      chain.limit = () => Promise.resolve({ data: rowsByTsquery[lastTs] ?? [], error: null });
      return chain;
    },
  } as unknown as import("@supabase/supabase-js").SupabaseClient;
}

describe("retrieveByTitle — queryGroups mode dedup + retrievedFor", () => {
  it("dedupes across groups keeping all retrievedFor labels", async () => {
    const shared = { id: "job1", source: "greenhouse", external_id: "x",
      company: "Acme", title: "CISO", location: "Remote", description: "",
      apply_url: "https://a/1", direct_apply_url: null,
      salary_min: null, salary_max: null, salary_currency: null,
      employment_type: null, remote: true, posted_at: "2026-07-01",
      last_seen_at: "2026-07-01", extracted_skills: null,
      extracted_seniority: "executive", seniority_tier: "executive" };
    const supabase = makeMockSupabase({
      "ciso": [shared],
      "chief security officer": [shared],
    });
    const result = await retrieveByTitle(supabase, {
      queryGroups: [
        { label: "CISO", queries: ["ciso"] },
        { label: "Chief Security Officer", queries: ["chief security officer"] },
      ],
    });
    expect(result).toHaveLength(1);
    expect(result[0].retrievedFor).toEqual(expect.arrayContaining(["CISO", "Chief Security Officer"]));
    expect(result[0].retrievedFor).toHaveLength(2);
  });

  it("distinct jobs from different groups are unioned, retrievedFor scoped to their group", async () => {
    const j1 = { id: "1", source: "greenhouse", external_id: null, company: "A",
      title: "CISO", location: "", description: "", apply_url: "https://a/1",
      direct_apply_url: null, salary_min: null, salary_max: null,
      salary_currency: null, employment_type: null, remote: false,
      posted_at: "2026-07-02", last_seen_at: "2026-07-02",
      extracted_skills: null, extracted_seniority: null, seniority_tier: null };
    const j2 = { ...j1, id: "2", title: "Director of Security", apply_url: "https://a/2", posted_at: "2026-07-01" };
    const supabase = makeMockSupabase({
      "ciso": [j1],
      "director of security": [j2],
    });
    const result = await retrieveByTitle(supabase, {
      queryGroups: [
        { label: "CISO", queries: ["ciso"] },
        { label: "Director of Security", queries: ["director of security"] },
      ],
    });
    expect(result).toHaveLength(2);
    // Sorted newest first — j1 (2026-07-02) before j2 (2026-07-01)
    expect(result[0].title).toBe("CISO");
    expect(result[0].retrievedFor).toEqual(["CISO"]);
    expect(result[1].title).toBe("Director of Security");
    expect(result[1].retrievedFor).toEqual(["Director of Security"]);
  });

  it("flat titleQueries mode returns no retrievedFor tags", async () => {
    const j = { id: "1", source: "greenhouse", external_id: null, company: "A",
      title: "CISO", location: "", description: "", apply_url: "https://a/1",
      direct_apply_url: null, salary_min: null, salary_max: null,
      salary_currency: null, employment_type: null, remote: false,
      posted_at: "2026-07-01", last_seen_at: "2026-07-01",
      extracted_skills: null, extracted_seniority: null, seniority_tier: null };
    const supabase = makeMockSupabase({ "ciso": [j] });
    const result = await retrieveByTitle(supabase, { titleQueries: ["ciso"] });
    expect(result).toHaveLength(1);
    expect(result[0].retrievedFor).toBeUndefined();
  });

  it("empty input returns empty array (no crash)", async () => {
    const supabase = makeMockSupabase({});
    expect(await retrieveByTitle(supabase, {})).toEqual([]);
    expect(await retrieveByTitle(supabase, { titleQueries: [] })).toEqual([]);
    expect(await retrieveByTitle(supabase, { queryGroups: [] })).toEqual([]);
  });
});
