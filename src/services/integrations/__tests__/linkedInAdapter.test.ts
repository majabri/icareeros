import { describe, it, expect, vi, beforeEach } from "vitest";
import { searchLinkedIn } from "../linkedInAdapter";
import {
  mockSupabase,
  mockFunctions,
  resetSupabaseMocks,
} from "@/lib/__mocks__/supabase";

vi.mock("@/lib/supabase", () => ({
  createClient: vi.fn(() => mockSupabase),
}));

const baseFilters = {
  skills: ["TypeScript", "React"],
  jobTypes: ["full-time"],
  location: "San Francisco, CA",
  query: "Software Engineer",
  careerLevel: "senior",
  targetTitles: ["Senior Engineer"],
  searchSource: "all" as const,
  minFitScore: 0,
  showFlagged: false,
};

describe("linkedInAdapter", () => {
  beforeEach(() => {
    resetSupabaseMocks();
  });

  it("returns opportunities on success", async () => {
    const mockOpps = [
      { id: "1", title: "Senior Engineer", company: "Acme", url: "https://linkedin.com/jobs/1", source: "linkedin" },
    ];
    mockFunctions.invoke.mockResolvedValue({
      data: { opportunities: mockOpps, total: 1, source: "linkedin" },
      error: null,
    });

    const result = await searchLinkedIn({ filters: baseFilters });

    expect(result.opportunities).toHaveLength(1);
    expect(result.opportunities[0].title).toBe("Senior Engineer");
    expect(result.fallback).toBe(false);
    expect(result.source).toBe("linkedin");
  });

  it("returns fallback=true when source is database", async () => {
    mockFunctions.invoke.mockResolvedValue({
      data: { opportunities: [], total: 0, source: "database" },
      error: null,
    });

    const result = await searchLinkedIn({ filters: baseFilters });

    expect(result.fallback).toBe(true);
    expect(result.source).toBe("database");
  });

  it("returns empty array gracefully on edge function error", async () => {
    mockFunctions.invoke.mockResolvedValue({
      data: null,
      error: new Error("edge function unavailable"),
    });

    const result = await searchLinkedIn({ filters: baseFilters });

    expect(result.opportunities).toHaveLength(0);
    expect(result.fallback).toBe(true);
    expect(result.total).toBe(0);
  });

  it("calls search-jobs with source_filter=linkedin", async () => {
    mockFunctions.invoke.mockResolvedValue({
      data: { opportunities: [], total: 0, source: "linkedin" },
      error: null,
    });

    await searchLinkedIn({ filters: baseFilters, limit: 10, offset: 5 });

    expect(mockFunctions.invoke).toHaveBeenCalledWith("search-jobs", {
      body: expect.objectContaining({
        source_filter: "linkedin",
        limit: 10,
        offset: 5,
      }),
    });
  });
});
