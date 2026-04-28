/**
 * achieveService unit tests
 *
 * Mocks:
 * - global fetch  → returns a mock AchieveResult from /api/career-os/achieve
 * - eventLogger   → no-op
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/orchestrator/eventLogger", () => ({
  eventLogger: {
    log:                vi.fn().mockResolvedValue(undefined),
    logAiCall:          vi.fn().mockResolvedValue(undefined),
    logStageTransition: vi.fn().mockResolvedValue(undefined),
    logCycleEvent:      vi.fn().mockResolvedValue(undefined),
  },
}));

const { recordAchievement } = await import("../achieveService");

const MOCK_RESULT = {
  milestoneType: "goal_completed",
  milestoneRecorded: true,
  accomplishments: [
    "Completed a full Career OS cycle from evaluation to coaching",
    "Identified and started closing 3 key skill gaps",
    "Built a targeted job-search plan with 5 applications per week",
  ],
  nextCycleRecommendations: [
    { focus: "Track application outcomes to refine targeting", priority: "high" },
    { focus: "Complete the SQL course before next Evaluate stage", priority: "high" },
    { focus: "Expand networking to 5 warm contacts", priority: "medium" },
  ],
  celebrationMessage:
    "You've completed your first full Career OS cycle — a huge step. You now have clarity on your path, a learning plan underway, and an active job search. Keep the momentum going.",
  cycleReadyToComplete: true,
  notificationSent: false,
  achievedAt: "2026-04-28T16:00:00.000Z",
  summary:
    "You completed all five Career OS stages and are ready to launch your job search. Next cycle: focus on tracking applications and closing the SQL skill gap.",
};

function mockFetch(body: unknown, status = 200) {
  return vi.spyOn(global, "fetch").mockResolvedValueOnce({
    ok:     status >= 200 && status < 300,
    status,
    json:   async () => body,
  } as Response);
}

describe("recordAchievement", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("calls /api/career-os/achieve with correct payload and returns result", async () => {
    const spy = mockFetch(MOCK_RESULT);

    const result = await recordAchievement("user-123", "cycle-456");

    expect(spy).toHaveBeenCalledOnce();
    const [url, opts] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/career-os/achieve");
    expect(opts.method).toBe("POST");
    expect(opts.credentials).toBe("include");

    const body = JSON.parse(opts.body as string);
    expect(body.cycle_id).toBe("cycle-456");

    expect(result.milestoneType).toBe("goal_completed");
    expect(result.milestoneRecorded).toBe(true);
    expect(result.accomplishments).toHaveLength(3);
    expect(result.nextCycleRecommendations).toHaveLength(3);
    expect(result.cycleReadyToComplete).toBe(true);
    expect(result.celebrationMessage).toContain("first full Career OS cycle");
    expect(result.achievedAt).toBeTruthy();
  });

  it("throws when the API route returns 422 (prerequisite stage not completed)", async () => {
    mockFetch({ error: "Advise stage must be completed before running Achieve." }, 422);

    await expect(
      recordAchievement("user-999", "cycle-999")
    ).rejects.toThrow("recordAchievement failed");
  });

  it("throws when fetch itself rejects (network error)", async () => {
    vi.spyOn(global, "fetch").mockRejectedValueOnce(new Error("Network failure"));

    await expect(
      recordAchievement("user-abc", "cycle-abc")
    ).rejects.toThrow("Network failure");
  });

  it("cycleReadyToComplete is true on success", async () => {
    mockFetch(MOCK_RESULT);
    const result = await recordAchievement("u", "c");
    expect(result.cycleReadyToComplete).toBe(true);
  });
});
