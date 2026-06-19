import { describe, it, expect, vi, beforeEach } from "vitest";
import { searchOpportunities } from "../opportunityAggregator";
import {
  mockSupabase,
  mockFunctions,
  resetSupabaseMocks,
} from "@/lib/__mocks__/supabase";

vi.mock("@/lib/supabase", () => ({
  createClient: vi.fn(() => mockSupabase),
}));

const baseFilters = {
  skills: ["Python"],
  jobTypes: ["full-time"],
  location: "Remote",
  query: "Data Scientist",
  careerLevel: "mid",
  targetTitles: ["Data Scientist"],
  searchSource: "all" as const,
  minFitScore: 0,
  showFlagged: false,
};

describe("opportunityAggregator", () => {
  beforeEach(() => {
    resetSupabaseMocks();
  });

  it("deduplicates opportunities by URL across sources", async () => {
    // Both LinkedIn and database return the same URL
    const sharedOpp = {
      id: "1",
      title: "Data Scientist",
      company: "TechCo",
      url: "https://example.com/jobs/1",
      source: "linkedin",
    };

    mockFunctions.invoke
      .mockResolvedValueOnce({
        data: { opportunities: [sharedOpp], total: 1, source: "linkedin" },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { opportunities: [sharedOpp], total: 1, source: "indeed" },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { opportunities: [sharedOpp], total: 1, source: "database" },
        error: null,
      });

    const result = await searchOpportunities({ filters: baseFilters });

    // Should deduplicate to just 1 result
    expect(result.opportunities).toHaveLength(1);
  });

  it("sorts by fit_score descending", async () => {
    const opps = [
      { id: "1", title: "A", company: "X", url: "https://x.com/1", fit_score: 60, source: "linkedin" },
      { id: "2", title: "B", company: "Y", url: "https://y.com/2", fit_score: 90, source: "database" },
      { id: "3", title: "C", company: "Z", url: "https://z.com/3", fit_score: 75, source: "indeed" },
    ];

    mockFunctions.invoke
      .mockResolvedValueOnce({ data: { opportunities: [opps[0]], total: 1, source: "linkedin" }, error: null })
      .mockResolvedValueOnce({ data: { opportunities: [opps[2]], total: 1, source: "indeed" }, error: null })
      .mockResolvedValueOnce({ data: { opportunities: [opps[1]], total: 1, source: "database" }, error: null });

    const result = await searchOpportunities({ filters: baseFilters });

    expect(result.opportunities[0].fit_score).toBe(90);
    expect(result.opportunities[1].fit_score).toBe(75);
    expect(result.opportunities[2].fit_score).toBe(60);
  });

  it("handles all sources erroring gracefully", async () => {
    mockFunctions.invoke.mockResolvedValue({ data: null, error: new Error("down") });

    const result = await searchOpportunities({ filters: baseFilters });

    expect(result.opportunities).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it("respects sources filter — database only", async () => {
    mockFunctions.invoke.mockResolvedValue({
      data: { opportunities: [], total: 0, source: "database" },
      error: null,
    });

    await searchOpportunities({ filters: baseFilters, sources: ["database"] });

    // Should only have called invoke once (for database only)
    expect(mockFunctions.invoke).toHaveBeenCalledTimes(1);
    expect(mockFunctions.invoke).toHaveBeenCalledWith("search-jobs", {
      body: expect.objectContaining({ source_filter: "database" }),
    });
  });

  // ── 2026-06-18 (feat/jobs-opportunity-aggregator) — Adzuna added as
  //    a 4th source ────────────────────────────────────────────────────
  describe("Adzuna source", () => {
    const ADZUNA_OPP = {
      id: "adzuna-001",
      title: "Adzuna PM",
      company: "AdzCo",
      url: "https://adzuna.example.com/jobs/1",
      source: "adzuna",
      fit_score: 50,
    };

    function mockAdzunaFetch(payload: { results: Array<Record<string, unknown>>; count: number }) {
      return vi.spyOn(global, "fetch").mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => payload,
      } as Response);
    }

    it("includes Adzuna results in the aggregated set when keys are configured", async () => {
      process.env.ADZUNA_APP_ID  = "test-app-id";
      process.env.ADZUNA_APP_KEY = "test-app-key";

      // LinkedIn / Indeed / DB return empty so we isolate Adzuna's contribution
      mockFunctions.invoke
        .mockResolvedValueOnce({ data: { opportunities: [], total: 0, source: "linkedin" }, error: null })
        .mockResolvedValueOnce({ data: { opportunities: [], total: 0, source: "indeed"   }, error: null })
        .mockResolvedValueOnce({ data: { opportunities: [], total: 0, source: "database" }, error: null });

      mockAdzunaFetch({
        results: [{
          id: "001",
          title: "Adzuna PM",
          company:  { display_name: "AdzCo" },
          location: { display_name: "Remote" },
          description: "great role",
          redirect_url: ADZUNA_OPP.url,
          created: "2026-06-18T00:00:00Z",
        }],
        count: 1,
      });

      const result = await searchOpportunities({ filters: baseFilters });

      expect(result.opportunities.length).toBe(1);
      expect(result.opportunities[0].source).toBe("adzuna");
      expect(result.sources.adzuna).toEqual({ count: 1, fallback: false });
    });

    it("falls back to empty when ADZUNA_APP_ID / ADZUNA_APP_KEY are missing — does not throw", async () => {
      // Force the adapter's `if (!appId || !appKey)` early-return path.
      // Use empty strings (falsy) rather than delete — the latter can leak
      // earlier-test values across the same vitest worker.
      process.env.ADZUNA_APP_ID  = "";
      process.env.ADZUNA_APP_KEY = "";

      // All edge-fn sources empty too
      mockFunctions.invoke.mockResolvedValue({
        data: { opportunities: [], total: 0, source: "database" },
        error: null,
      });

      const result = await searchOpportunities({ filters: baseFilters });

      // Behavioural assertion (impl-independent of fetch call count):
      // aggregator returns the empty/fallback shape, doesn't throw.
      expect(result.opportunities).toEqual([]);
      expect(result.sources.adzuna).toEqual({ count: 0, fallback: true });
    });

    it("dedupes across Adzuna + LinkedIn when both return the same URL", async () => {
      process.env.ADZUNA_APP_ID  = "test-app-id";
      process.env.ADZUNA_APP_KEY = "test-app-key";

      const SHARED_URL = "https://shared.example.com/jobs/77";

      mockFunctions.invoke
        // LinkedIn returns the shared URL
        .mockResolvedValueOnce({
          data: {
            opportunities: [{
              id: "li-77",
              title: "Shared Role",
              company: "Shared Co",
              url: SHARED_URL,
              source: "linkedin",
              fit_score: 80,
            }],
            total: 1,
            source: "linkedin",
          },
          error: null,
        })
        // Indeed empty
        .mockResolvedValueOnce({ data: { opportunities: [], total: 0, source: "indeed"   }, error: null })
        // DB empty
        .mockResolvedValueOnce({ data: { opportunities: [], total: 0, source: "database" }, error: null });

      // Adzuna ALSO returns the shared URL — should dedupe with LinkedIn
      mockAdzunaFetch({
        results: [{
          id: "001",
          title: "Shared Role",
          company:  { display_name: "Shared Co" },
          location: { display_name: "Remote" },
          description: "duplicate post",
          redirect_url: SHARED_URL,
          created: "2026-06-18T00:00:00Z",
        }],
        count: 1,
      });

      const result = await searchOpportunities({ filters: baseFilters });

      // Cross-source dedupe: only ONE entry in the merged set, but per-source
      // counts still show 1 in each provider (so the page can report "1 from
      // LinkedIn, 1 from Adzuna" without lying about provider reach).
      expect(result.opportunities.length).toBe(1);
      expect(result.sources.linkedin?.count).toBe(1);
      expect(result.sources.adzuna?.count).toBe(1);
      // LinkedIn came first in the merge order → its row wins the dedupe slot.
      expect(result.opportunities[0].source).toBe("linkedin");
    });
  });
});
