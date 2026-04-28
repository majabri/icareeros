/**
 * adviseService unit tests
 *
 * Mocks:
 * - global fetch  → returns a mock AdviceResult from /api/career-os/advise
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

const { generateAdvice } = await import("../adviseService");

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MOCK_RESULT = {
  recommendedPaths: [
    {
      title: "Senior Product Manager",
      matchScore: 82,
      requiredSkills: ["Product strategy", "Stakeholder management", "Data analysis"],
      gapSkills: ["SQL", "A/B testing"],
      estimatedWeeks: 16,
    },
    {
      title: "Engineering Manager",
      matchScore: 64,
      requiredSkills: ["Leadership", "System design", "TypeScript"],
      gapSkills: ["Leadership", "System design"],
      estimatedWeeks: 24,
    },
  ],
  nextActions: [
    "Complete a SQL fundamentals course on Coursera",
    "Apply to 3 PM roles at Series B startups this week",
    "Request a mock interview with a PM at your target company",
  ],
  timelineWeeks: 16,
  summary:
    "Your strongest path is Senior PM given your product and TypeScript background. Focus on SQL and A/B testing to close the gap within 4 months.",
};

function mockFetch(body: unknown, status = 200) {
  return vi.spyOn(global, "fetch").mockResolvedValueOnce({
    ok:   status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("generateAdvice", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("calls /api/career-os/advise with correct payload and returns result", async () => {
    const spy = mockFetch(MOCK_RESULT);

    const result = await generateAdvice("user-123", "cycle-456");

    // Verify fetch call
    expect(spy).toHaveBeenCalledOnce();
    const [url, opts] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/career-os/advise");
    expect(opts.method).toBe("POST");
    expect(opts.credentials).toBe("include");

    const body = JSON.parse(opts.body as string);
    expect(body.cycle_id).toBe("cycle-456");

    // Verify result shape
    expect(result.recommendedPaths).toHaveLength(2);
    expect(result.recommendedPaths[0].title).toBe("Senior Product Manager");
    expect(result.recommendedPaths[0].matchScore).toBe(82);
    expect(result.nextActions).toHaveLength(3);
    expect(result.timelineWeeks).toBe(16);
    expect(result.summary).toContain("Senior PM");
  });

  it("throws when the API route returns a non-OK status", async () => {
    mockFetch({ error: "Evaluate stage must be completed before running Advise." }, 422);

    await expect(
      generateAdvice("user-999", "cycle-999")
    ).rejects.toThrow("generateAdvice failed");
  });

  it("throws when fetch itself rejects (network error)", async () => {
    vi.spyOn(global, "fetch").mockRejectedValueOnce(new Error("Network failure"));

    await expect(
      generateAdvice("user-abc", "cycle-abc")
    ).rejects.toThrow("Network failure");
  });

  it("result paths are ordered by matchScore descending", async () => {
    mockFetch(MOCK_RESULT);

    const result = await generateAdvice("u", "c");
    const scores = result.recommendedPaths.map((p) => p.matchScore);
    for (let i = 0; i < scores.length - 1; i++) {
      expect(scores[i]).toBeGreaterThanOrEqual(scores[i + 1]);
    }
  });
});
