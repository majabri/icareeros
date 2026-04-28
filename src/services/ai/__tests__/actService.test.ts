/**
 * actService unit tests
 *
 * Mocks:
 * - global fetch  → returns a mock ActResult from /api/career-os/act
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

const { triggerAction } = await import("../actService");

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MOCK_RESULT = {
  jobSearchQueries: [
    "Senior Product Manager fintech Series B",
    "Product Manager SQL data-driven startup",
    "Associate Director of Product SaaS remote",
  ],
  networkingTargets: [
    {
      role: "Senior Product Manager",
      company: "Stripe",
      rationale: "Fintech aligns with your background; referrals 3x interview rate",
      outreachTip: "Comment on their PM blog posts before connecting on LinkedIn",
    },
    {
      role: "Group Product Manager",
      company: "Notion",
      rationale: "PLG experience directly relevant; team is hiring",
      outreachTip: "Mention a specific Notion feature you use daily in your outreach",
    },
  ],
  applicationPriority: [
    {
      roleTier: "Stretch",
      description: "Director-level roles at large tech companies",
      targetCount: 2,
      rationale: "Low probability but high upside",
    },
    {
      roleTier: "Target",
      description: "Senior PM at Series B–D startups",
      targetCount: 8,
      rationale: "Best match for your current profile",
    },
    {
      roleTier: "Safety",
      description: "Mid-level PM roles at established companies",
      targetCount: 4,
      rationale: "Ensures pipeline flow and interview practice",
    },
  ],
  weeklyApplicationTarget: 5,
  summary:
    "Your strongest target is Senior PM at fintech Series B startups. Aim for 5 applications per week across all tiers and warm up two Stripe contacts this week.",
};

function mockFetch(body: unknown, status = 200) {
  return vi.spyOn(global, "fetch").mockResolvedValueOnce({
    ok:     status >= 200 && status < 300,
    status,
    json:   async () => body,
  } as Response);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("triggerAction", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("calls /api/career-os/act with correct payload and returns result", async () => {
    const spy = mockFetch(MOCK_RESULT);

    const result = await triggerAction("user-123", "cycle-456");

    // Verify fetch call
    expect(spy).toHaveBeenCalledOnce();
    const [url, opts] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/career-os/act");
    expect(opts.method).toBe("POST");
    expect(opts.credentials).toBe("include");

    const body = JSON.parse(opts.body as string);
    expect(body.cycle_id).toBe("cycle-456");

    // Verify result shape
    expect(result.jobSearchQueries).toHaveLength(3);
    expect(result.networkingTargets).toHaveLength(2);
    expect(result.networkingTargets[0].company).toBe("Stripe");
    expect(result.applicationPriority).toHaveLength(3);
    expect(result.weeklyApplicationTarget).toBe(5);
    expect(result.summary).toContain("Senior PM");
  });

  it("throws when the API route returns 422 (prerequisite stage not completed)", async () => {
    mockFetch({ error: "Learn stage must be completed before running Act." }, 422);

    await expect(
      triggerAction("user-999", "cycle-999")
    ).rejects.toThrow("triggerAction failed");
  });

  it("throws when fetch itself rejects (network error)", async () => {
    vi.spyOn(global, "fetch").mockRejectedValueOnce(new Error("Network failure"));

    await expect(
      triggerAction("user-abc", "cycle-abc")
    ).rejects.toThrow("Network failure");
  });

  it("applicationPriority includes all three tiers", async () => {
    mockFetch(MOCK_RESULT);

    const result = await triggerAction("u", "c");
    const tiers = result.applicationPriority.map((t) => t.roleTier);
    expect(tiers).toContain("Stretch");
    expect(tiers).toContain("Target");
    expect(tiers).toContain("Safety");
  });
});
