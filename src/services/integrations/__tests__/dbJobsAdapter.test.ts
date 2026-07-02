/**
 * feat/jobs-search-db (Task 5) — tests for the DB-first adapter.
 *
 * Contract:
 *   1. Empty array on Supabase error (never throws)
 *   2. Normalises ats_jobs row → OpportunityResult shape
 *   3. Falls back to description-ilike when title FTS returns < 5 rows
 *   4. Freshness signal + per-source counts populated
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const baseFilters = {
  skills: [], jobTypes: [], location: "", query: "engineer",
  careerLevel: "mid", targetTitles: [],
  searchSource: "all" as const, minFitScore: 0, showFlagged: false,
};

// Build a Supabase mock whose chain resolves to configurable data/error.
function mockSb(resolve: { data?: unknown; error?: unknown }[]) {
  let call = 0;
  const from = (_table: string) => {
    const chain: Record<string, unknown> = {};
    const returnSelf = () => chain;
    chain.select     = returnSelf;
    chain.eq         = returnSelf;
    chain.order      = returnSelf;
    chain.limit      = returnSelf;
    chain.textSearch = returnSelf;
    chain.ilike      = returnSelf;
    chain.range      = returnSelf;
    chain.in         = returnSelf;
    // Make the chain awaitable — resolves on await
    chain.then = (onFul: (v: unknown) => unknown) =>
      Promise.resolve(resolve[call++] ?? { data: [], error: null }).then(onFul);
    return chain;
  };
  return { from };
}

vi.mock("@/lib/supabase", () => ({
  createClient: vi.fn(),
}));

let searchFromDatabase: typeof import("../dbJobsAdapter").searchFromDatabase;

beforeEach(async () => {
  vi.resetModules();
  const mod = await import("../dbJobsAdapter");
  searchFromDatabase = mod.searchFromDatabase;
});

describe("searchFromDatabase", () => {
  it("returns [] on Supabase error (never throws)", async () => {
    const { createClient } = await import("@/lib/supabase");
    (createClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      mockSb([{ data: null, error: { message: "boom" } }])
    );
    const r = await searchFromDatabase(baseFilters);
    expect(r.opportunities).toEqual([]);
    expect(r.fallback).toBe(true);
  });

  it("normalises an ats_jobs row to OpportunityResult shape", async () => {
    const row = {
      id: "abc-123",
      source: "greenhouse",
      external_id: "gh-999",
      company: "Stripe",
      title: "Senior Engineer",
      location: "Remote — US",
      description: "Build things.",
      apply_url: "https://boards.greenhouse.io/stripe/jobs/999",
      salary_min: 150000,
      salary_max: 250000,
      salary_currency: "USD",
      employment_type: "Full-time",
      remote: true,
      posted_at: "2026-07-01T00:00:00Z",
      last_seen_at: "2026-07-01T04:00:00Z",
    };
    const { createClient } = await import("@/lib/supabase");
    (createClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      mockSb([{ data: [row], error: null }])
    );
    const r = await searchFromDatabase(baseFilters);
    expect(r.opportunities.length).toBe(1);
    const opp = r.opportunities[0];
    expect(opp.title).toBe("Senior Engineer");
    expect(opp.company).toBe("Stripe");
    expect(opp.source).toBe("greenhouse");
    expect(opp.salary_min).toBe(150000);
    expect(opp.is_remote).toBe(true);
    expect(opp.id).toContain("ats-greenhouse-");
    expect(r.freshestAt).toBe("2026-07-01T04:00:00Z");
    expect(r.perSource.greenhouse).toBe(1);
    expect(r.fallback).toBe(false);
  });

  it("returns opportunities with per-source counts across greenhouse/lever/ashby", async () => {
    const rows = [
      { id: "1", source: "greenhouse", company: "Stripe",  title: "Engineer",   location: "Remote",     description: "d", apply_url: "https://x.com/company/jobs/1", salary_min: null, salary_max: null, salary_currency: null, employment_type: null, remote: true,  posted_at: "2026-07-01", last_seen_at: "2026-07-01T01:00Z" },
      { id: "2", source: "lever",      company: "Netflix", title: "Engineer",   location: "LA",         description: "d", apply_url: "https://x.com/company/jobs/2", salary_min: null, salary_max: null, salary_currency: null, employment_type: null, remote: false, posted_at: "2026-07-01", last_seen_at: "2026-07-01T02:00Z" },
      { id: "3", source: "ashby",      company: "Ramp",    title: "SRE",        location: "NY",         description: "d", apply_url: "https://x.com/company/jobs/3", salary_min: null, salary_max: null, salary_currency: null, employment_type: null, remote: false, posted_at: "2026-07-01", last_seen_at: "2026-07-01T03:00Z" },
    ];
    const { createClient } = await import("@/lib/supabase");
    (createClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      mockSb([{ data: rows, error: null }])
    );
    const r = await searchFromDatabase(baseFilters);
    expect(r.opportunities.length).toBe(3);
    expect(r.perSource).toEqual({ greenhouse: 1, lever: 1, ashby: 1 });
    // Freshest = max last_seen_at (03:00Z)
    expect(r.freshestAt).toBe("2026-07-01T03:00Z");
  });

  it("degrades gracefully to [] when createClient throws", async () => {
    const { createClient } = await import("@/lib/supabase");
    (createClient as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error("no supabase");
    });
    const r = await searchFromDatabase(baseFilters);
    expect(r.opportunities).toEqual([]);
    expect(r.fallback).toBe(true);
  });
});
