/**
 * fitScoreService unit tests
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock eventLogger (not used here, but imported transitively) ───────────────
vi.mock("@/orchestrator/eventLogger", () => ({
  eventLogger: {
    log:                vi.fn().mockResolvedValue(undefined),
    logAiCall:          vi.fn().mockResolvedValue(undefined),
    logStageTransition: vi.fn().mockResolvedValue(undefined),
    logCycleEvent:      vi.fn().mockResolvedValue(undefined),
  },
}));

// Lazy import after mocks
const { scoreFitBatch } = await import("../fitScoreService");

const MOCK_SCORES = {
  "opp-1": {
    fit_score: 85,
    match_summary: "Strong React background matches senior frontend role.",
    strengths: ["React expertise", "TypeScript"],
    skill_gaps: [],
  },
  "opp-2": {
    fit_score: 52,
    match_summary: "Partial match — missing required Java experience.",
    strengths: ["Problem solving"],
    skill_gaps: ["Java", "Spring Boot"],
  },
};

function mockFitFetch(
  status: number,
  body: unknown,
  rejects?: boolean,
) {
  vi.spyOn(global, "fetch").mockImplementationOnce(
    rejects
      ? () => Promise.reject(new Error("Network error"))
      : () =>
          Promise.resolve({
            ok: status >= 200 && status < 300,
            status,
            json: () => Promise.resolve(body),
          } as Response),
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("scoreFitBatch", () => {
  it("calls /api/jobs/fit-scores with correct args and returns scores", async () => {
    mockFitFetch(200, { scores: MOCK_SCORES });

    const result = await scoreFitBatch(["opp-1", "opp-2"], "cycle-abc");

    const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(fetchCall[0]).toBe("/api/jobs/fit-scores");
    const opts = fetchCall[1] as RequestInit;
    expect(opts.method).toBe("POST");
    expect(opts.credentials).toBe("include");

    const body = JSON.parse(opts.body as string);
    expect(body.opportunity_ids).toEqual(["opp-1", "opp-2"]);
    expect(body.cycle_id).toBe("cycle-abc");

    expect(result.scores["opp-1"].fit_score).toBe(85);
    expect(result.scores["opp-2"].skill_gaps).toContain("Java");
  });

  it("works without a cycleId (profile fallback path)", async () => {
    mockFitFetch(200, { scores: MOCK_SCORES });

    const result = await scoreFitBatch(["opp-1"]);

    const body = JSON.parse(
      ((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body.cycle_id).toBeUndefined();
    expect(result.scores).toBeDefined();
  });

  it("throws on non-OK response", async () => {
    mockFitFetch(401, { error: "Unauthorized" });

    await expect(scoreFitBatch(["opp-1"])).rejects.toThrow("scoreFitBatch failed");
  });

  it("throws on network error", async () => {
    mockFitFetch(0, null, /* rejects */ true);

    await expect(scoreFitBatch(["opp-1"])).rejects.toThrow("Network error");
  });
});
