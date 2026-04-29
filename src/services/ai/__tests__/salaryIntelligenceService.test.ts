/**
 * Unit tests — salaryIntelligenceService
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { enrichSalaries } from "../salaryIntelligenceService";

// ── Helpers ───────────────────────────────────────────────────────────────────

const mockFetch = (body: unknown, status = 200) => {
  global.fetch = vi.fn().mockResolvedValueOnce({
    ok: status < 400,
    status,
    json: async () => body,
  } as Response);
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("enrichSalaries", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("calls /api/salary-intelligence with opportunity_ids", async () => {
    mockFetch({ ranges: {} });
    await enrichSalaries(["opp-1", "opp-2"]);

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/salary-intelligence",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ opportunity_ids: ["opp-1", "opp-2"] }),
      })
    );
  });

  it("returns salary ranges keyed by opportunity ID", async () => {
    const ranges = {
      "opp-1": { min: 120000, max: 150000, currency: "USD", label: "~$120k – $150k", confidence: "high" },
    };
    mockFetch({ ranges });
    const result = await enrichSalaries(["opp-1"]);
    expect(result.ranges["opp-1"].label).toBe("~$120k – $150k");
    expect(result.ranges["opp-1"].min).toBe(120000);
    expect(result.ranges["opp-1"].confidence).toBe("high");
  });

  it("throws on non-ok response", async () => {
    mockFetch({ error: "AI estimation failed" }, 500);
    await expect(enrichSalaries(["opp-1"])).rejects.toThrow("enrichSalaries failed");
  });

  it("returns empty ranges when API returns empty object", async () => {
    mockFetch({ ranges: {} });
    const result = await enrichSalaries(["opp-x"]);
    expect(result.ranges).toEqual({});
  });

  it("includes credentials in the request", async () => {
    mockFetch({ ranges: {} });
    await enrichSalaries(["opp-1"]);
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/salary-intelligence",
      expect.objectContaining({ credentials: "include" })
    );
  });
});
