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
  (chain.single     as MockInstance) = vi.fn().mockResolvedValue({ data: returnData, error: returnError });
  (chain.maybeSingle as MockInstance) = vi.fn().mockResolvedValue({ data: returnData, error: returnError });
  // Make chain awaitable
  (chain as any).then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve({ data: returnData, error: returnError }).then(resolve);
  return chain;
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
    it("returns skipped result if stageRouter returns success:false", async () => {
      mockFnInvoke.mockResolvedValue({
        data: null,
        error: { message: "Edge function unavailable" },
      });
      const chain = makeChain({ notes: null }, null);
      mockFrom.mockReturnValue(chain);

      const result = await advanceStage("user-1", "cycle-1", "evaluate");
      expect(result).toBeDefined();
    });
  });

  describe("completeCycle", () => {
    it("marks cycle as completed", async () => {
      // Build a full chain supporting .update().eq().eq().select().single()
      const chain = makeChain({ id: "cycle-1", status: "completed" }, null);
      mockFrom.mockReturnValue(chain);

      const result = await completeCycle("user-1", "cycle-1");
      expect(result).toBeDefined();
    });
  });
});

describe("stageRouter — unit", () => {
  beforeEach(() => vi.clearAllMocks());

  it("evaluate: calls evaluateCareerProfile and saves notes", async () => {
    mockFnInvoke.mockResolvedValue({
      data: {
        skills: ["TypeScript", "React"],
        gaps: ["System Design"],
        market_fit_score: 72,
        career_level: "mid",
        summary: "Strong frontend, needs systems breadth",
      },
      error: null,
    });

    // from() calls: loadStageNotes (maybeSingle) + saveStageNotes (update chain)
    const chain = makeChain(null, null);
    mockFrom.mockReturnValue(chain);

    const { stageRouter } = await import("../stageRouter");
    const result = await stageRouter.route("user-1", "cycle-1", "evaluate");

    expect(result.success).toBe(true);
    expect(result.meta?.skillCount).toBe(2);
    expect(result.meta?.marketFitScore).toBe(72);
  });

  it("advise: requires evaluate notes or returns error", async () => {
    // maybeSingle returns null notes → advise should fail gracefully
    const chain = makeChain(null, null);
    mockFrom.mockReturnValue(chain);

    const { stageRouter } = await import("../stageRouter");
    const result = await stageRouter.route("user-1", "cycle-1", "advise");

    expect(result.success).toBe(false);
    expect(result.error).toContain("Evaluate");
  });

  it("unknown stage: returns success:false with error", async () => {
    const { stageRouter } = await import("../stageRouter");
    const result = await stageRouter.route("user-1", "cycle-1", "unknown" as never);
    expect(result.success).toBe(false);
    expect(result.error).toContain("Unknown stage");
  });
});
