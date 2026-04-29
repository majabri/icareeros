/**
 * outreachService unit tests
 *
 * Mocks:
 * - global fetch  → returns a mock OutreachResult from /api/outreach
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

const { generateOutreach } = await import("../outreachService");

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MOCK_RESULT = {
  linkedin: {
    subject: "Connection request",
    message:
      "Hi [Name], I came across the Senior PM opening at Stripe and your team's work on payments infrastructure stood out. I'd love to connect. [Your name]",
  },
  email: {
    subject: "Interest in Senior PM role at Stripe",
    message:
      "Hi [Name],\n\nI noticed the Senior PM position at Stripe and wanted to reach out directly.\n\nBest,\n[Your name]",
  },
  tips: [
    "Personalise [Name] with the actual hiring manager's name from LinkedIn",
    "Reference a specific Stripe product or blog post to stand out",
    "Send Monday–Thursday 9–11am PST for highest open rates",
  ],
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("generateOutreach", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => MOCK_RESULT,
      }),
    );
  });

  it("calls /api/outreach with opportunity_id", async () => {
    const result = await generateOutreach("opp-123");

    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("/api/outreach");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body.opportunity_id).toBe("opp-123");
    expect(body.cycle_id).toBeUndefined();

    expect(result.linkedin.message).toContain("Stripe");
    expect(result.email.subject).toContain("Stripe");
    expect(result.tips).toHaveLength(3);
  });

  it("passes cycle_id when provided", async () => {
    await generateOutreach("opp-456", "cycle-789");

    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.cycle_id).toBe("cycle-789");
  });

  it("throws when the API returns an error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ error: "Opportunity not found" }),
      }),
    );

    await expect(generateOutreach("bad-id")).rejects.toThrow("Opportunity not found");
  });

  it("returns linkedin and email messages", async () => {
    const result = await generateOutreach("opp-123");

    expect(result.linkedin).toMatchObject({
      subject: expect.any(String),
      message: expect.any(String),
    });
    expect(result.email).toMatchObject({
      subject: expect.any(String),
      message: expect.any(String),
    });
  });

  it("returns an array of tips", async () => {
    const result = await generateOutreach("opp-123");
    expect(Array.isArray(result.tips)).toBe(true);
    expect(result.tips.length).toBeGreaterThan(0);
  });
});
