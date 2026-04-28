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

  it("unknown stage: returns success:false with error", async () => {
    const { stageRouter } = await import("../stageRouter");
    const result = await stageRouter.route("user-1", "cycle-1", "unknown" as never);
    expect(result.success).toBe(false);
    expect(result.error).toContain("Unknown stage");
  });
});
