import { describe, it, expect, vi, afterEach } from "vitest";
import { generateCoverLetter } from "../coverLetterService";

// ── Mock eventLogger ──────────────────────────────────────────────────────────
vi.mock("@/orchestrator/eventLogger", () => ({
  eventLogger: {
    logAiCall: vi.fn().mockResolvedValue(undefined),
  },
}));

const MOCK_RESULT = {
  subject: "Application for Software Engineer — Your Name",
  body: "Dear Hiring Manager,\n\nI am writing to express my interest in the Software Engineer role at Acme Corp. My background in TypeScript and React aligns closely with your requirements.\n\nSincerely,\n[Your Name]",
  word_count: 38,
  tips: [
    "Personalise [Your Name] with your actual name",
    "Add a specific metric from your experience",
    "Reference a recent Acme product launch",
  ],
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("generateCoverLetter", () => {
  it("calls POST /api/cover-letter with correct URL and body", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => MOCK_RESULT,
    });
    vi.stubGlobal("fetch", mockFetch);

    await generateCoverLetter("opp-123", "cycle-abc");

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/cover-letter",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opportunity_id: "opp-123", cycle_id: "cycle-abc" }),
      })
    );
  });

  it("returns parsed CoverLetterResult on success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => MOCK_RESULT,
    }));

    const result = await generateCoverLetter("opp-123");

    expect(result.subject).toBe(MOCK_RESULT.subject);
    expect(result.body).toContain("Acme Corp");
    expect(Array.isArray(result.tips)).toBe(true);
    expect(result.tips).toHaveLength(3);
    expect(typeof result.word_count).toBe("number");
  });

  it("throws when the API returns an error response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: "Internal server error" }),
    }));

    await expect(generateCoverLetter("opp-bad")).rejects.toThrow(
      "Internal server error"
    );
  });

  it("works without a cycleId (sends undefined cycle_id)", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => MOCK_RESULT,
    });
    vi.stubGlobal("fetch", mockFetch);

    await generateCoverLetter("opp-456");

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody.opportunity_id).toBe("opp-456");
    expect(callBody.cycle_id).toBeUndefined();
  });

  it("throws with a generic message when API returns non-JSON error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      statusText: "Bad Gateway",
      json: async () => { throw new Error("not json"); },
    }));

    await expect(generateCoverLetter("opp-err")).rejects.toThrow(
      "Bad Gateway"
    );
  });
});
