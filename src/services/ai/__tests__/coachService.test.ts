/**
 * coachService unit tests
 *
 * Mocks:
 * - global fetch  → returns a mock CoachResult from /api/career-os/coach
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

const { runCoachingSession } = await import("../coachService");

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MOCK_RESULT = {
  interviewPrep: {
    practiceQuestions: [
      "Tell me about a time you used data to influence a product decision.",
      "How do you prioritise features when resources are constrained?",
      "Describe a product failure and what you learned from it.",
    ],
    keyTalkingPoints: [
      "Highlight cross-functional collaboration at your last role",
      "Quantify impact: revenue driven, users affected, or latency reduced",
    ],
    weaknessesToAddress: [
      "Limited experience with SQL — prepare a concrete learning plan story",
      "No formal PM certification — emphasise shipped products instead",
    ],
    estimatedReadinessScore: 65,
  },
  resumeInsights: {
    score: 72,
    suggestions: [
      "Add measurable outcomes to each bullet (e.g. 'increased retention by 18%')",
      "Lead with a two-line summary targeting Senior PM roles",
    ],
    keywordsAdded: ["product roadmap", "OKR", "stakeholder alignment"],
    sectionsImproved: ["Summary", "Experience", "Skills"],
  },
  actionItems: [
    "Practice answering the top 3 interview questions aloud before Friday",
    "Update resume summary section to target Senior PM roles",
    "Complete one SQL exercise on Mode Analytics this week",
  ],
  nextCheckInDays: 7,
  summary:
    "Your interview readiness is at 65% — strong storytelling but SQL gaps need a prepared narrative. Update your resume summary this week and schedule a mock interview.",
};

function mockFetch(body: unknown, status = 200) {
  return vi.spyOn(global, "fetch").mockResolvedValueOnce({
    ok:     status >= 200 && status < 300,
    status,
    json:   async () => body,
  } as Response);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("runCoachingSession", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("calls /api/career-os/coach with correct payload and returns result", async () => {
    const spy = mockFetch(MOCK_RESULT);

    const result = await runCoachingSession("user-123", "cycle-456");

    // Verify fetch call
    expect(spy).toHaveBeenCalledOnce();
    const [url, opts] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/career-os/coach");
    expect(opts.method).toBe("POST");
    expect(opts.credentials).toBe("include");

    const body = JSON.parse(opts.body as string);
    expect(body.cycle_id).toBe("cycle-456");

    // Verify result shape
    expect(result.interviewPrep.practiceQuestions).toHaveLength(3);
    expect(result.interviewPrep.estimatedReadinessScore).toBe(65);
    expect(result.resumeInsights.score).toBe(72);
    expect(result.resumeInsights.suggestions).toHaveLength(2);
    expect(result.actionItems).toHaveLength(3);
    expect(result.nextCheckInDays).toBe(7);
    expect(result.summary).toContain("65%");
  });

  it("throws when the API route returns 422 (prerequisite stage not completed)", async () => {
    mockFetch({ error: "Advise stage must be completed before running Coach." }, 422);

    await expect(
      runCoachingSession("user-999", "cycle-999")
    ).rejects.toThrow("runCoachingSession failed");
  });

  it("throws when fetch itself rejects (network error)", async () => {
    vi.spyOn(global, "fetch").mockRejectedValueOnce(new Error("Network failure"));

    await expect(
      runCoachingSession("user-abc", "cycle-abc")
    ).rejects.toThrow("Network failure");
  });

  it("result contains both interviewPrep and resumeInsights", async () => {
    mockFetch(MOCK_RESULT);

    const result = await runCoachingSession("u", "c");
    expect(result.interviewPrep).toBeDefined();
    expect(result.resumeInsights).toBeDefined();
    expect(Array.isArray(result.actionItems)).toBe(true);
  });
});
