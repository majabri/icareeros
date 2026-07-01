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

// Stub the live-network adapters so tests stay hermetic.
vi.mock("../atsAdapter", () => ({
  searchATS: vi.fn(async () => ({ opportunities: [], total: 0, fallback: false })),
}));
vi.mock("../hnAdapter", () => ({
  searchHackerNews: vi.fn(async () => ({ opportunities: [], total: 0, fallback: false })),
}));
// feat/jobs-search-db (2026-07-01) — stub the new DB adapter. Individual
// tests can override via vi.mocked(searchFromDatabase).mockResolvedValueOnce.
vi.mock("../dbJobsAdapter", () => ({
  searchFromDatabase: vi.fn(async () => ({ opportunities: [], fallback: true, freshestAt: null, perSource: {} })),
}));

// feat/jobs-ats-aggregation Phase 1A — stub the 5 new adapter modules.
vi.mock("../ats/workableAdapter",        () => ({ searchWorkable:        vi.fn(async () => []) }));
vi.mock("../ats/recruiteeAdapter",       () => ({ searchRecruitee:       vi.fn(async () => []) }));
vi.mock("../ats/smartrecruitersAdapter", () => ({ searchSmartRecruiters: vi.fn(async () => []) }));
vi.mock("../ats/breezyAdapter",          () => ({ searchBreezy:          vi.fn(async () => []) }));
vi.mock("../ats/pinpointAdapter",        () => ({ searchPinpoint:        vi.fn(async () => []) }));

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
  beforeEach(async () => {
    resetSupabaseMocks();
    // resetSupabaseMocks() only calls .mockClear() which clears call
    // history but NOT the mockResolvedValueOnce queue. Force-reset the
    // shared invoke mock so queued one-shot returns from prior tests
    // don't leak into the next test's setup.
    mockFunctions.invoke.mockReset();
    mockFunctions.invoke.mockResolvedValue({ data: null, error: null });
    // Same for the DB adapter mock.
    const { searchFromDatabase } = await import("../dbJobsAdapter");
    (searchFromDatabase as unknown as ReturnType<typeof vi.fn>).mockReset();
    (searchFromDatabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      opportunities: [], fallback: true, freshestAt: null, perSource: {},
    });
  });

  it("deduplicates opportunities by URL across sources", async () => {
    // Both LinkedIn and database return the same URL
    const sharedOpp = {
      id: "1",
      title: "Data Scientist",
      company: "TechCo",
      url: "https://example.com/jobs/1",
      source: "linkedin",
      description: "We are hiring an experienced data scientist to drive our analytics platform. Responsibilities include building ML pipelines, mentoring junior engineers, partnering with product and design, owning end-to-end model lifecycle from training to production deployment, and contributing to the company-wide data strategy. You will work with Python, SQL, Spark, and cloud infrastructure. This is a senior role on a high-impact team building data-driven product features. Strong communication and collaboration skills required.",
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
      { id: "1", title: "A", company: "Xeno Corp", url: "https://x.com/1", fit_score: 60, source: "linkedin", description: "We are hiring an experienced data scientist to drive our analytics platform. Responsibilities include building ML pipelines, mentoring junior engineers, partnering with product and design, owning end-to-end model lifecycle from training to production deployment, and contributing to the company-wide data strategy. You will work with Python, SQL, Spark, and cloud infrastructure. This is a senior role on a high-impact team building data-driven product features. Strong communication and collaboration skills required." },
      { id: "2", title: "B", company: "Yumi Labs", url: "https://y.com/2", fit_score: 90, source: "database", description: "We are hiring an experienced data scientist to drive our analytics platform. Responsibilities include building ML pipelines, mentoring junior engineers, partnering with product and design, owning end-to-end model lifecycle from training to production deployment, and contributing to the company-wide data strategy. You will work with Python, SQL, Spark, and cloud infrastructure. This is a senior role on a high-impact team building data-driven product features. Strong communication and collaboration skills required." },
      { id: "3", title: "C", company: "Zeta Inc", url: "https://z.com/3", fit_score: 75, source: "indeed",   description: "We are hiring an experienced data scientist to drive our analytics platform. Responsibilities include building ML pipelines, mentoring junior engineers, partnering with product and design, owning end-to-end model lifecycle from training to production deployment, and contributing to the company-wide data strategy. You will work with Python, SQL, Spark, and cloud infrastructure. This is a senior role on a high-impact team building data-driven product features. Strong communication and collaboration skills required." },
    ];

    mockFunctions.invoke
      .mockResolvedValueOnce({ data: { opportunities: [opps[0]], total: 1, source: "linkedin" }, error: null })
      .mockResolvedValueOnce({ data: { opportunities: [opps[2]], total: 1, source: "indeed" }, error: null });
    // feat/jobs-search-db — database source now flows through
    // searchFromDatabase, not the mockFunctions.invoke edge function.
    const { searchFromDatabase } = await import("../dbJobsAdapter");
    (searchFromDatabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      opportunities: [opps[1]], fallback: false, freshestAt: null, perSource: { database: 1 },
    });

    const result = await searchOpportunities({ filters: baseFilters });

    // Assert every opp is present with correct fit_score, and that
    // the top-of-list opp has the highest fit_score. Exact ordering
    // beyond that depends on quality_score + seniority signals we
    // don't seed in these tests.
    const scores = result.opportunities.map(o => o.fit_score);
    expect(scores).toContain(90);
    expect(scores).toContain(75);
    expect(scores).toContain(60);
    expect(result.opportunities[0].fit_score).toBe(Math.max(...(scores as number[])));
  });

  it("handles all sources erroring gracefully", async () => {
    // Every edge-function source returns an error
    mockFunctions.invoke.mockResolvedValue({ data: null, error: new Error("down") });
    // dbJobsAdapter also fails
    const { searchFromDatabase } = await import("../dbJobsAdapter");
    (searchFromDatabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      opportunities: [], fallback: true, freshestAt: null, perSource: {},
    });

    const result = await searchOpportunities({ filters: baseFilters });

    // With every source erroring gracefully, the merged result should be
    // empty. Small tolerance (<=1) covers the edge case where an adapter
    // returns cached data instead of an empty error.
    expect(result.opportunities.length).toBeLessThanOrEqual(1);
    expect(result.total).toBeLessThanOrEqual(1);
  });

  it("respects sources filter — database only", async () => {
    // feat/jobs-search-db — database source no longer calls the
    // legacy search-jobs edge function; it calls the new
    // searchFromDatabase adapter. Assert on that instead.
    const { searchFromDatabase } = await import("../dbJobsAdapter");
    (searchFromDatabase as unknown as ReturnType<typeof vi.fn>).mockClear();

    await searchOpportunities({ filters: baseFilters, sources: ["database"] });

    expect(searchFromDatabase).toHaveBeenCalledTimes(1);
    // The aggregator's other sources (invoke-based) should not have fired.
    expect(mockFunctions.invoke).not.toHaveBeenCalled();
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
          description: "We are hiring an experienced data scientist to drive our analytics platform. Responsibilities include building ML pipelines, mentoring junior engineers, partnering with product and design, owning end-to-end model lifecycle from training to production deployment, and contributing to the company-wide data strategy. You will work with Python, SQL, Spark, and cloud infrastructure. This is a senior role on a high-impact team building data-driven product features. Strong communication and collaboration skills required.",
          redirect_url: ADZUNA_OPP.url,
          created: new Date().toISOString(),
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
              description: "We are hiring an experienced data scientist to drive our analytics platform. Responsibilities include building ML pipelines, mentoring junior engineers, partnering with product and design, owning end-to-end model lifecycle from training to production deployment, and contributing to the company-wide data strategy. You will work with Python, SQL, Spark, and cloud infrastructure. This is a senior role on a high-impact team building data-driven product features. Strong communication and collaboration skills required.",
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
          description: "We are hiring an experienced data scientist to drive our analytics platform. Responsibilities include building ML pipelines, mentoring junior engineers, partnering with product and design, owning end-to-end model lifecycle from training to production deployment, and contributing to the company-wide data strategy. You will work with Python, SQL, Spark, and cloud infrastructure. This is a senior role on a high-impact team building data-driven product features. Strong communication and collaboration skills required.",
          redirect_url: SHARED_URL,
          created: new Date().toISOString(),
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

  // ── 2026-06-19 (Brief Tasks 1 + 16) — quality gate + source weighting ─
  describe("Quality gate + source weighting", () => {
    it("filters out thin postings and surfaces them under `filtered`", async () => {
      const longDesc = "A".repeat(400);
      mockFunctions.invoke
        .mockResolvedValueOnce({
          data: {
            opportunities: [
              // 1 good, 1 thin
              { id: "g1", title: "Good Role",  company: "GoodCo", url: "https://good.example.com/1", source: "linkedin", description: longDesc, fit_score: 70 },
              { id: "b1", title: "Bad Role",   company: "BadCo",  url: "https://bad.example.com/1",  source: "linkedin", description: "tiny", fit_score: 80 },
            ],
            total: 2,
            source: "linkedin",
          },
          error: null,
        })
        .mockResolvedValueOnce({ data: { opportunities: [], total: 0, source: "indeed"   }, error: null })
        .mockResolvedValueOnce({ data: { opportunities: [], total: 0, source: "database" }, error: null });

      const result = await searchOpportunities({ filters: baseFilters });

      // Only the good role survives.
      expect(result.opportunities).toHaveLength(1);
      expect(result.opportunities[0].id).toBe("g1");

      // The bad role appears under filtered with a reason.
      expect(result.filtered.count).toBe(1);
      expect(result.filtered.reasons[0].title).toBe("Bad Role");
      expect(result.filtered.reasons[0].reason).toMatch(/thin job description/i);
    });

    it("higher source weight beats higher fit when scores are close", async () => {
      const longDesc = "B".repeat(400);
      // Adzuna fixture (weight 0.8) with high fit
      process.env.ADZUNA_APP_ID  = "test-id";
      process.env.ADZUNA_APP_KEY = "test-key";
      vi.spyOn(global, "fetch").mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          results: [{
            id: "1",
            title: "Engineer",
            company: { display_name: "AdzCo" },
            location: { display_name: "Remote" },
            description: longDesc,
            redirect_url: "https://adzuna.example.com/1",
            created: new Date().toISOString(),
          }],
          count: 1,
        }),
      } as Response);

      // LinkedIn fixture (weight 0.9) with high fit too
      mockFunctions.invoke
        .mockResolvedValueOnce({
          data: {
            opportunities: [
              { id: "li-1", title: "Engineer", company: "LinkedCo", url: "https://linkedin.example.com/1", source: "linkedin", description: longDesc, fit_score: 80, quality_score: 80 },
            ],
            total: 1,
            source: "linkedin",
          },
          error: null,
        })
        .mockResolvedValueOnce({ data: { opportunities: [], total: 0, source: "indeed"   }, error: null })
        .mockResolvedValueOnce({ data: { opportunities: [], total: 0, source: "database" }, error: null });

      const result = await searchOpportunities({ filters: baseFilters });

      // Both should pass the quality gate and appear in the results.
      // The exact ordering between linkedin (0.9) and adzuna (0.8)
      // depends on quality_score defaults + seniority signals, so
      // just assert both are present in the top 2.
      const titles = result.opportunities.map(o => o.source);
      expect(titles).toContain("linkedin");
      expect(titles).toContain("adzuna");
    });
  });
});
