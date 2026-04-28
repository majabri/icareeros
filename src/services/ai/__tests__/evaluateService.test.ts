/**
 * evaluateService unit tests
 *
 * Mocks:
 * - global fetch  → returns a mock EvaluationResult from /api/career-os/evaluate
 * - eventLogger   → no-op
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock eventLogger ──────────────────────────────────────────────────────────
vi.mock("@/orchestrator/eventLogger", () => ({
  eventLogger: {
    log:                vi.fn().mockResolvedValue(undefined),
    logAiCall:          vi.fn().mockResolvedValue(undefined),
    logStageTransition: vi.fn().mockResolvedValue(undefined),
    logCycleEvent:      vi.fn().mockResolvedValue(undefined),
  },
}));

const { evaluateCareerProfile } = await import("../evaluateService");

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MOCK_RESULT = {
  skills:              ["TypeScript", "React", "Node.js"],
  gaps:                ["System Design", "AWS", "Leadership"],
  marketFitScore:      72,
  careerLevel:         "mid",
  recommendedNextStage:"advise",
  summary:             "Strong frontend skills. Needs cloud and leadership experience for senior roles.",
};

function mockFetch(body: unknown, status = 200) {
  return vi.spyOn(global, "fetch").mockResolvedValueOnce({
    ok:   status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("evaluateCareerProfile", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("calls /api/career-os/evaluate with correct payload and returns result", async () => {
    const spy = mockFetch(MOCK_RESULT);

    const result = await evaluateCareerProfile("user-123", "cycle-456");

    // Verify fetch call
    expect(spy).toHaveBeenCalledOnce();
    const [url, opts] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/career-os/evaluate");
    expect(opts.method).toBe("POST");
    expect(opts.credentials).toBe("include");

    const body = JSON.parse(opts.body as string);
    expect(body.user_id).toBe("user-123");
    expect(body.cycle_id).toBe("cycle-456");

    // Verify result shape
    expect(result.skills).toEqual(MOCK_RESULT.skills);
    expect(result.gaps).toEqual(MOCK_RESULT.gaps);
    expect(result.marketFitScore).toBe(72);
    expect(result.careerLevel).toBe("mid");
    expect(result.recommendedNextStage).toBe("advise");
    expect(result.summary).toContain("frontend");
  });

  it("throws when the API route returns a non-OK status", async () => {
    mockFetch({ error: "No profile found — save your profile first." }, 422);

    await expect(
      evaluateCareerProfile("user-999", "cycle-999")
    ).rejects.toThrow("evaluateCareerProfile failed");
  });

  it("throws when fetch itself rejects (network error)", async () => {
    vi.spyOn(global, "fetch").mockRejectedValueOnce(new Error("Network failure"));

    await expect(
      evaluateCareerProfile("user-abc", "cycle-abc")
    ).rejects.toThrow("Network failure");
  });

  it("includes market fit score in plausible range", async () => {
    mockFetch({ ...MOCK_RESULT, marketFitScore: 45 });

    const result = await evaluateCareerProfile("u", "c");
    expect(result.marketFitScore).toBeGreaterThanOrEqual(0);
    expect(result.marketFitScore).toBeLessThanOrEqual(100);
  });
});
