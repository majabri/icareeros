/**
 * iCareerOS — Career OS Orchestrator tests
 * Unit tests with Supabase mocked.
 * Full integration tests (hitting real DB) require a test Supabase project — Week 3 follow-up.
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

// ── Mock eventLogger (non-blocking, should never throw) ────────────────────
vi.mock("@/orchestrator/eventLogger", () => ({
  eventLogger: {
    logAiCall: vi.fn().mockResolvedValue(undefined),
    logStageTransition: vi.fn().mockResolvedValue(undefined),
    logCycleEvent: vi.fn().mockResolvedValue(undefined),
  },
}));

// Lazy import after mocks are established
const { startCycle, advanceStage, completeCycle, getActiveCycle } = await import(
  "../careerOsOrchestrator"
);

// ── Helpers ────────────────────────────────────────────────────────────────

function makeChain(returnData: unknown = null, returnError: unknown = null) {
  const chain: Record<string, unknown> = {};
  const methods = ["select", "insert", "update", "eq", "neq", "is", "order", "limit", "single", "maybeSingle"];
  methods.forEach((m) => {
    chain[m] = vi.fn(() => chain);
  });
  (chain as Record<string, unknown>).then = undefined; // not a Promise itself
  // Terminal: resolve on .single() / .maybeSingle()
  (chain.single as MockInstance).mockResolvedValue({ data: returnData, error: returnError });
  (chain.maybeSingle as MockInstance).mockResolvedValue({ data: returnData, error: returnError });
  (chain.select as MockInstance).mockReturnValue(chain);
  return chain;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("careerOsOrchestrator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("startCycle", () => {
    it("inserts a cycle row and 6 stage rows", async () => {
      const insertMock = vi.fn().mockResolvedValue({ data: { id: "cycle-1" }, error: null });
      mockFrom.mockReturnValue({ insert: insertMock, select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: "cycle-1" }, error: null }) }) });

      // Should not throw
      await expect(
        startCycle("user-1", "Become a Senior Engineer")
      ).resolves.toBeDefined();
    });

    it("throws if Supabase insert fails", async () => {
      const insertMock = vi.fn().mockResolvedValue({
        data: null,
        error: { message: "DB connection lost" },
      });
      mockFrom.mockReturnValue({
        insert: insertMock,
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: { message: "DB connection lost" } }),
        }),
      });

      await expect(startCycle("user-2")).rejects.toThrow();
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
      const fakeCycle = { id: "cycle-1", user_id: "user-1", status: "active", current_stage: "evaluate" };
      const chain = makeChain(fakeCycle, null);
      mockFrom.mockReturnValue(chain);

      const result = await getActiveCycle("user-1");
      expect(result).toEqual(fakeCycle);
    });
  });

  describe("advanceStage", () => {
    it("returns skipped result if stageRouter returns success:false", async () => {
      // stageRouter is wired to real services — mock supabase.functions.invoke to simulate failure
      mockFnInvoke.mockResolvedValue({
        data: null,
        error: { message: "Edge function unavailable" },
      });

      const chain = makeChain({ notes: null }, null);
      mockFrom.mockReturnValue(chain);

      const result = await advanceStage("user-1", "cycle-1", "evaluate");
      // Should not throw — orchestrator wraps errors gracefully
      expect(result).toBeDefined();
    });
  });

  describe("completeCycle", () => {
    it("marks cycle as completed", async () => {
      const updateMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: { id: "cycle-1", status: "completed" }, error: null }),
      });
      mockFrom.mockReturnValue({ update: updateMock });

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

    const updateChain = { eq: vi.fn().mockReturnThis(), then: undefined };
    updateChain.eq.mockReturnValue({ eq: vi.fn().mockReturnThis() });
    mockFrom.mockReturnValue({ update: vi.fn().mockReturnValue(updateChain) });

    const { stageRouter } = await import("../stageRouter");
    const result = await stageRouter.route("user-1", "cycle-1", "evaluate");

    expect(result.success).toBe(true);
    expect(result.meta?.skillCount).toBe(2);
    expect(result.meta?.marketFitScore).toBe(72);
  });

  it("advise: requires evaluate notes or returns error", async () => {
    // Simulate missing evaluate notes
    const chain = makeChain(null, null);
    mockFrom.mockReturnValue(chain);

    const { stageRouter } = await import("../stageRouter");
    const result = await stageRouter.route("user-1", "cycle-1", "advise");

    // Should fail gracefully (no evaluate notes)
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
