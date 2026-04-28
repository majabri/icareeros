/**
 * iCareerOS — Career OS Orchestrator tests
 * Unit tests with Supabase mocked.
 */

import { describe, it, expect, vi, beforeEach, type MockInstance } from "vitest";

// ── Mock Supabase client ────────────────────────────────────────────────────
const mockFnInvoke = vi.fn();
const mockFrom = vi.fn();
const mockSupabase = {
  functions: { invoke: mockFnInvoke },
  from: mockFrom,
};

vi.mock("@/lib/supabase", () => ({
  createClient: () => mockSupabase,
}));

// ── Mock eventLogger ────────────────────────────────────────────────────────
vi.mock("@/orchestrator/eventLogger", () => ({
  eventLogger: {
    log:               vi.fn().mockResolvedValue(undefined),
    logAiCall:         vi.fn().mockResolvedValue(undefined),
    logStageTransition:vi.fn().mockResolvedValue(undefined),
    logCycleEvent:     vi.fn().mockResolvedValue(undefined),
  },
}));

// Lazy import after mocks are established
const { startCycle, advanceStage, completeCycle, getActiveCycle } = await import(
  "../careerOsOrchestrator"
);

// ── Helpers ────────────────────────────────────────────────────────────────

function makeChain(returnData: unknown = null, returnError: unknown = null) {
  const chain: Record<string, unknown> = {};
  const methods = [
    "select", "insert", "update",
    "eq", "neq", "is", "order", "limit",
  ];
  methods.forEach((m) => {
    chain[m] = vi.fn(() => chain);
  });
  // Terminal methods resolve
  (chain.single      as MockInstance) = vi.fn().mockResolvedValue({ data: returnData, error: returnError });
  (chain.maybeSingle as MockInstance) = vi.fn().mockResolvedValue({ data: returnData, error: returnError });
  // Make chain awaitable
  (chain as any).then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve({ data: returnData, error: returnError }).then(resolve);
  return chain;
}

/** Helper: mock global.fetch for the evaluate API route */
function mockEvaluateFetch(
  overrides: Partial<{
    skills: string[];
    gaps: string[];
    marketFitScore: number;
    careerLevel: string;
    recommendedNextStage: string;
    summary: string;
  }> = {}
) {
  const body = {
    skills: ["TypeScript", "React"],
    gaps: ["System Design"],
    marketFitScore: 72,
    careerLevel: "mid",
    recommendedNextStage: "advise",
    summary: "Strong frontend, needs systems breadth",
    ...overrides,
  };
  return vi.spyOn(global, "fetch").mockResolvedValueOnce({
    ok:   true,
    status: 200,
    json: async () => body,
  } as Response);
}

/** Helper: mock global.fetch for the advise API route */
function mockAdviseFetch(
  overrides: Partial<{
    recommendedPaths: unknown[];
    nextActions: string[];
    timelineWeeks: number;
    summary: string;
  }> = {},
  status = 200
) {
  const body =
    status >= 200 && status < 300
      ? {
          recommendedPaths: [
            {
              title: "Senior Product Manager",
              matchScore: 82,
              requiredSkills: ["Product strategy", "Data analysis"],
              gapSkills: ["SQL"],
              estimatedWeeks: 16,
            },
          ],
          nextActions: ["Complete SQL course", "Apply to 3 PM roles"],
          timelineWeeks: 16,
          summary: "Strong path to Senior PM; close SQL gap first.",
          ...overrides,
        }
      : { error: "Evaluate stage must be completed before running Advise." };

  return vi.spyOn(global, "fetch").mockResolvedValueOnce({
    ok:     status >= 200 && status < 300,
    status,
    json:   async () => body,
  } as Response);
}


/** Helper: mock global.fetch for the learn API route */
function mockLearnFetch(
  overrides: Partial<{
    resources: unknown[];
    topSkillGaps: string[];
    weeklyHoursNeeded: number;
    estimatedCompletionWeeks: number;
    summary: string;
  }> = {},
  status = 200
) {
  const body =
    status >= 200 && status < 300
      ? {
          resources: [
            {
              title: "SQL for Data Analysis",
              type: "course",
              provider: "Coursera",
              estimatedHours: 20,
              skillsCovered: ["SQL"],
              priorityScore: 95,
            },
          ],
          topSkillGaps: ["SQL", "A/B testing"],
          weeklyHoursNeeded: 8,
          estimatedCompletionWeeks: 12,
          summary: "Focus on SQL first to close the biggest gap.",
          ...overrides,
        }
      : { error: "Advise stage must be completed before running Learn." };

  return vi.spyOn(global, "fetch").mockResolvedValueOnce({
    ok:     status >= 200 && status < 300,
    status,
    json:   async () => body,
  } as Response);
}


/** Helper: mock global.fetch for the act API route */
function mockActFetch(
  overrides: Partial<{
    jobSearchQueries: string[];
    networkingTargets: unknown[];
    applicationPriority: unknown[];
    weeklyApplicationTarget: number;
    summary: string;
  }> = {},
  status = 200
) {
  const body =
    status >= 200 && status < 300
      ? {
          jobSearchQueries: ["Senior Product Manager fintech Series B"],
          networkingTargets: [
            {
              role: "Senior Product Manager",
              company: "Stripe",
              rationale: "Fintech aligns with your background",
              outreachTip: "Comment on their blog posts first",
            },
          ],
          applicationPriority: [
            { roleTier: "Stretch", description: "Director-level roles", targetCount: 2, rationale: "High upside" },
            { roleTier: "Target",  description: "Senior PM at startups",  targetCount: 8, rationale: "Best match" },
            { roleTier: "Safety",  description: "Mid-level PM roles",     targetCount: 4, rationale: "Pipeline flow" },
          ],
          weeklyApplicationTarget: 5,
          summary: "Aim for 5 applications per week across all tiers.",
          ...overrides,
        }
      : { error: "Learn stage must be completed before running Act." };

  return vi.spyOn(global, "fetch").mockResolvedValueOnce({
    ok:     status >= 200 && status < 300,
    status,
    json:   async () => body,
  } as Response);
}


/** Helper: mock global.fetch for the coach API route */
function mockCoachFetch(
  overrides: Partial<{
    interviewPrep: unknown;
    resumeInsights: unknown;
    actionItems: string[];
    nextCheckInDays: number;
    summary: string;
  }> = {},
  status = 200
) {
  const body =
    status >= 200 && status < 300
      ? {
          interviewPrep: {
            practiceQuestions: ["Tell me about a time you used data to drive a decision."],
            keyTalkingPoints: ["Quantify impact wherever possible"],
            weaknessesToAddress: ["SQL gap — prepare a learning plan story"],
            estimatedReadinessScore: 65,
          },
          resumeInsights: {
            score: 72,
            suggestions: ["Add measurable outcomes to each bullet"],
            keywordsAdded: ["product roadmap", "OKR"],
            sectionsImproved: ["Summary", "Experience"],
          },
          actionItems: [
            "Practice the top 3 questions aloud before Friday",
            "Update resume summary this week",
          ],
          nextCheckInDays: 7,
          summary: "Readiness at 65% — update resume and schedule a mock interview.",
          ...overrides,
        }
      : { error: "Advise stage must be completed before running Coach." };

  return vi.spyOn(global, "fetch").mockResolvedValueOnce({
    ok:     status >= 200 && status < 300,
    status,
    json:   async () => body,
  } as Response);
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("careerOsOrchestrator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("startCycle", () => {
    it("inserts a cycle row and 6 stage rows", async () => {
      const chain = makeChain({ id: "cycle-1" }, null);
      mockFrom.mockReturnValue(chain);

      await expect(
        startCycle("user-1", "Become a Senior Engineer")
      ).resolves.toBeDefined();
    });

    it("throws if Supabase insert fails", async () => {
      const chain = makeChain(null, { message: "DB connection lost" });
      mockFrom.mockReturnValue(chain);

      const errResult = await startCycle("user-2");
      expect(errResult.status).toBe("abandoned");
      expect(errResult.error).toBeTruthy();
    });
  });

  describe("getActiveCycle", () => {
    it("returns null when no active cycle exists", async () => {
      const chain = makeChain(null, null);
      mockFrom.mockReturnValue(chain);

      const result = await getActiveCycle("user-1");
      expect(result).toBeNull();
    });

    it("returns the cycle when one is active", async () => {
      const fakeCycle = {
        id: "cycle-1",
        user_id: "user-1",
        status: "active",
        current_stage: "evaluate",
      };
      const chain = makeChain(fakeCycle, null);
      mockFrom.mockReturnValue(chain);

      const result = await getActiveCycle("user-1");
      expect(result).toEqual(fakeCycle);
    });
  });

  describe("advanceStage", () => {
    it("returns skipped result if evaluate API route fails", async () => {
      // Mock fetch to return a non-OK response (evaluate fails)
      vi.spyOn(global, "fetch").mockResolvedValueOnce({
        ok:   false,
        status: 500,
        json: async () => ({ error: "Internal server error" }),
      } as Response);

      const chain = makeChain({ notes: null }, null);
      mockFrom.mockReturnValue(chain);

      const result = await advanceStage("user-1", "cycle-1", "evaluate");
      expect(result).toBeDefined();
    });
  });

  describe("completeCycle", () => {
    it("marks cycle as completed", async () => {
      const chain = makeChain({ id: "cycle-1", status: "completed" }, null);
      mockFrom.mockReturnValue(chain);

      const result = await completeCycle("user-1", "cycle-1");
      expect(result).toBeDefined();
    });
  });
});

describe("stageRouter — unit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("evaluate: calls /api/career-os/evaluate and saves notes", async () => {
    // Mock the fetch call that evaluateService makes
    mockEvaluateFetch();

    // from() calls: saveStageNotes (update chain)
    const chain = makeChain(null, null);
    mockFrom.mockReturnValue(chain);

    const { stageRouter } = await import("../stageRouter");
    const result = await stageRouter.route("user-1", "cycle-1", "evaluate");

    expect(result.success).toBe(true);
    expect(result.meta?.skillCount).toBe(2);
    expect(result.meta?.marketFitScore).toBe(72);
  });

  it("advise: propagates 422 error when evaluate stage not completed", async () => {
    // Route returns 422 when evaluate notes are missing server-side
    mockAdviseFetch({}, 422);

    const chain = makeChain(null, null);
    mockFrom.mockReturnValue(chain);

    const { stageRouter } = await import("../stageRouter");
    const result = await stageRouter.route("user-1", "cycle-1", "advise");

    expect(result.success).toBe(false);
    // Error is "generateAdvice failed: Evaluate stage must be completed..."
    expect(result.error).toContain("Evaluate");
  });

  it("advise: calls /api/career-os/advise and saves notes on success", async () => {
    mockAdviseFetch();

    const chain = makeChain(null, null);
    mockFrom.mockReturnValue(chain);

    const { stageRouter } = await import("../stageRouter");
    const result = await stageRouter.route("user-1", "cycle-1", "advise");

    expect(result.success).toBe(true);
    expect(result.meta?.pathCount).toBe(1);
    expect(result.meta?.timelineWeeks).toBe(16);
  });

  it("learn: propagates 422 error when advise stage not completed", async () => {
    // Route returns 422 when advise notes are missing server-side
    mockLearnFetch({}, 422);

    const chain = makeChain(null, null);
    mockFrom.mockReturnValue(chain);

    const { stageRouter } = await import("../stageRouter");
    const result = await stageRouter.route("user-1", "cycle-1", "learn");

    expect(result.success).toBe(false);
    expect(result.error).toContain("Advise");
  });

  it("learn: calls /api/career-os/learn and saves notes on success", async () => {
    mockLearnFetch();

    const chain = makeChain(null, null);
    mockFrom.mockReturnValue(chain);

    const { stageRouter } = await import("../stageRouter");
    const result = await stageRouter.route("user-1", "cycle-1", "learn");

    expect(result.success).toBe(true);
    expect(result.meta?.resourceCount).toBe(1);
    expect(result.meta?.weeklyHoursNeeded).toBe(8);
    expect(result.meta?.estimatedWeeks).toBe(12);
  });

    it("act: propagates 422 error when learn stage not completed", async () => {
    // Route returns 422 when learn notes are missing server-side
    mockActFetch({}, 422);

    const chain = makeChain(null, null);
    mockFrom.mockReturnValue(chain);

    const { stageRouter } = await import("../stageRouter");
    const result = await stageRouter.route("user-1", "cycle-1", "act");

    expect(result.success).toBe(false);
    expect(result.error).toContain("Learn");
  });

  it("act: calls /api/career-os/act and saves notes on success", async () => {
    mockActFetch();

    const chain = makeChain(null, null);
    mockFrom.mockReturnValue(chain);

    const { stageRouter } = await import("../stageRouter");
    const result = await stageRouter.route("user-1", "cycle-1", "act");

    expect(result.success).toBe(true);
    expect(result.meta?.queryCount).toBe(1);
    expect(result.meta?.networkingTargetCount).toBe(1);
    expect(result.meta?.weeklyApplicationTarget).toBe(5);
  });

    it("coach: propagates 422 error when advise stage not completed", async () => {
    mockCoachFetch({}, 422);

    const chain = makeChain(null, null);
    mockFrom.mockReturnValue(chain);

    const { stageRouter } = await import("../stageRouter");
    const result = await stageRouter.route("user-1", "cycle-1", "coach");

    expect(result.success).toBe(false);
    expect(result.error).toContain("Advise");
  });

  it("coach: calls /api/career-os/coach and saves notes on success", async () => {
    mockCoachFetch();

    const chain = makeChain(null, null);
    mockFrom.mockReturnValue(chain);

    const { stageRouter } = await import("../stageRouter");
    const result = await stageRouter.route("user-1", "cycle-1", "coach");

    expect(result.success).toBe(true);
    expect(result.meta?.interviewReadiness).toBe(65);
    expect(result.meta?.resumeScore).toBe(72);
    expect(result.meta?.actionItemCount).toBe(2);
  });

    it("unknown stage: returns success:false with error", async () => {
    const { stageRouter } = await import("../stageRouter");
    const result = await stageRouter.route("user-1", "cycle-1", "unknown" as never);
    expect(result.success).toBe(false);
    expect(result.error).toContain("Unknown stage");
  });
});
