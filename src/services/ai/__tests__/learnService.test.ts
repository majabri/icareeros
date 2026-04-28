/**
 * learnService unit tests
 *
 * Mocks:
 * - global fetch  → returns a mock LearnResult from /api/career-os/learn
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

const { generateLearningPlan } = await import("../learnService");

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MOCK_RESULT = {
  resources: [
    {
      title: "SQL for Data Analysis",
      type: "course",
      provider: "Coursera",
      url: "https://www.coursera.org/learn/sql-for-data-science",
      estimatedHours: 20,
      skillsCovered: ["SQL", "Data querying", "Aggregations"],
      priorityScore: 95,
    },
    {
      title: "A/B Testing and Experimentation",
      type: "course",
      provider: "Udemy",
      estimatedHours: 12,
      skillsCovered: ["A/B testing", "Statistical significance", "Hypothesis testing"],
      priorityScore: 88,
    },
    {
      title: "Cracking the PM Interview",
      type: "book",
      provider: "O'Reilly",
      estimatedHours: 8,
      skillsCovered: ["Product strategy", "Stakeholder management"],
      priorityScore: 75,
    },
  ],
  topSkillGaps: ["SQL", "A/B testing", "System design"],
  weeklyHoursNeeded: 8,
  estimatedCompletionWeeks: 12,
  summary:
    "Focus on SQL and A/B testing first — these are the highest-impact gaps for a Senior PM role. Completing these resources over 12 weeks at 8 hours per week will position you for job applications.",
};

function mockFetch(body: unknown, status = 200) {
  return vi.spyOn(global, "fetch").mockResolvedValueOnce({
    ok:     status >= 200 && status < 300,
    status,
    json:   async () => body,
  } as Response);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("generateLearningPlan", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("calls /api/career-os/learn with correct payload and returns result", async () => {
    const spy = mockFetch(MOCK_RESULT);

    const result = await generateLearningPlan("user-123", "cycle-456");

    // Verify fetch call
    expect(spy).toHaveBeenCalledOnce();
    const [url, opts] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/career-os/learn");
    expect(opts.method).toBe("POST");
    expect(opts.credentials).toBe("include");

    const body = JSON.parse(opts.body as string);
    expect(body.cycle_id).toBe("cycle-456");

    // Verify result shape
    expect(result.resources).toHaveLength(3);
    expect(result.resources[0].title).toBe("SQL for Data Analysis");
    expect(result.resources[0].priorityScore).toBe(95);
    expect(result.topSkillGaps).toContain("SQL");
    expect(result.weeklyHoursNeeded).toBe(8);
    expect(result.estimatedCompletionWeeks).toBe(12);
    expect(result.summary).toContain("SQL");
  });

  it("throws when the API route returns 422 (prerequisite stage not completed)", async () => {
    mockFetch({ error: "Advise stage must be completed before running Learn." }, 422);

    await expect(
      generateLearningPlan("user-999", "cycle-999")
    ).rejects.toThrow("generateLearningPlan failed");
  });

  it("throws when fetch itself rejects (network error)", async () => {
    vi.spyOn(global, "fetch").mockRejectedValueOnce(new Error("Network failure"));

    await expect(
      generateLearningPlan("user-abc", "cycle-abc")
    ).rejects.toThrow("Network failure");
  });

  it("result resources are ordered by priorityScore descending", async () => {
    mockFetch(MOCK_RESULT);

    const result = await generateLearningPlan("u", "c");
    const scores = result.resources.map((r) => r.priorityScore);
    for (let i = 0; i < scores.length - 1; i++) {
      expect(scores[i]).toBeGreaterThanOrEqual(scores[i + 1]);
    }
  });
});
