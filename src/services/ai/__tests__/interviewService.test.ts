import { describe, it, expect, vi } from "vitest";
import {
  extractReadinessScore,
  parseFinalFeedback,
  InterviewMessage,
} from "../interviewService";

// ── extractReadinessScore ────────────────────────────────────────────────────
describe("extractReadinessScore", () => {
  it("returns null when no readiness marker", () => {
    expect(extractReadinessScore("Great answer! Let's continue.")).toBeNull();
  });
  it("parses **Overall Readiness: 82%** format", () => {
    expect(extractReadinessScore("**Overall Readiness: 82%**")).toBe(82);
  });
  it("parses Overall Readiness 75% without bold", () => {
    expect(extractReadinessScore("Overall Readiness 75% overall")).toBe(75);
  });
  it("is case-insensitive", () => {
    expect(extractReadinessScore("overall readiness: 60%")).toBe(60);
  });
  it("picks first occurrence", () => {
    expect(extractReadinessScore("Overall Readiness: 90%\nother 40%")).toBe(90);
  });
  it("returns null for unrelated percentage", () => {
    expect(extractReadinessScore("success rate 0%")).toBeNull();
  });
});

// ── parseFinalFeedback ───────────────────────────────────────────────────────
describe("parseFinalFeedback", () => {
  const sample = `**Overall Readiness: 78%**
**Top strengths:**
- Clear communication
- Strong technical knowledge
- Good use of STAR method
**Areas to work on:**
- Needs more quantified results
- Work on conciseness`;

  it("extracts the readiness score", () => {
    expect(parseFinalFeedback(sample).score).toBe(78);
  });

  it("extracts strengths as an array", () => {
    const { strengths } = parseFinalFeedback(sample);
    expect(strengths.length).toBeGreaterThan(0);
    expect(strengths.some((s) => s.toLowerCase().includes("communication"))).toBe(true);
  });

  it("extracts areasToWork as an array", () => {
    const { areasToWork } = parseFinalFeedback(sample);
    expect(areasToWork.length).toBeGreaterThan(0);
  });

  it("returns empty arrays when sections are missing", () => {
    const { strengths, areasToWork } = parseFinalFeedback("Overall Readiness: 50%");
    expect(strengths).toEqual([]);
    expect(areasToWork).toEqual([]);
  });

  it("returns null score when no readiness marker", () => {
    expect(parseFinalFeedback("Some feedback without score").score).toBeNull();
  });
});

// ── Network-bound functions (mocked) ────────────────────────────────────────
vi.mock("@/lib/supabase", () => ({
  createClient: () => ({
    functions: {
      invoke: vi.fn().mockResolvedValue({
        data: { content: "Tell me about yourself." },
        error: null,
      }),
    },
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }),
    },
    from: vi.fn().mockReturnValue({
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      single: vi.fn().mockResolvedValue({ data: { id: "session-1" }, error: null }),
    }),
  }),
}));

import {
  sendInterviewMessage,
  generateInterviewPrep,
  createInterviewSession,
  updateInterviewSession,
  listInterviewSessions,
} from "../interviewService";

describe("sendInterviewMessage", () => {
  it("returns content string from edge function", async () => {
    const msgs: InterviewMessage[] = [{ role: "user", content: "Start." }];
    const result = await sendInterviewMessage({ messages: msgs, jobTitle: "Engineer" });
    expect(result).toBe("Tell me about yourself.");
  });
});

describe("generateInterviewPrep", () => {
  it("returns prep content string", async () => {
    const result = await generateInterviewPrep({
      jobTitle: "PM",
      jobDescription: "Lead product initiatives.",
    });
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });
});

describe("createInterviewSession", () => {
  it("returns the session id", async () => {
    const id = await createInterviewSession("Product Manager");
    expect(id).toBe("session-1");
  });
});

describe("updateInterviewSession", () => {
  it("resolves without throwing", async () => {
    await expect(
      updateInterviewSession("session-1", [{ role: "assistant", content: "Q?" }], 80),
    ).resolves.toBeUndefined();
  });
});

describe("listInterviewSessions", () => {
  it("returns an array", async () => {
    const result = await listInterviewSessions();
    expect(Array.isArray(result)).toBe(true);
  });
});
