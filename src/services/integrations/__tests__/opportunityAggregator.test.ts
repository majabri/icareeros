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
});
