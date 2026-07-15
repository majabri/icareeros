/**
 * feat/jobs-fit-check-internal Task 4 — route-level regression tests.
 *
 * The RBC billing incident (2026-07-15) — the exact URL that failed
 * (https://jobs.rbc.com/ca/en/job/RBCAA0088R0000171276EXTERNALENCA/...)
 * broke because an out-of-credits Anthropic key caused the entire
 * fit-check response to fail with a raw error body leaked to the user.
 * The route must now: (a) return 200 with the full deterministic body,
 * (b) return summary:null / summarySource:"unavailable", (c) never
 * surface the underlying Anthropic error text to the client.
 *
 * These are unit tests that stub the SDK client. See the Chrome MCP
 * end-to-end capture in the PR description for the live-URL proof.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// vi.mock hoists — the factory must return the mocked shape.
const messagesCreateMock = vi.fn();

vi.mock("@/lib/observability/langfuse", () => ({
  createTracedClient: () => ({
    messages: { create: messagesCreateMock },
  }),
}));

// Minimal supabase mock — auth returns a signed-in user; extractUserProfile
// returns null so we exercise the fallback profile path.
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: "test-user" } }, error: null }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null }),
        }),
      }),
    }),
  }),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => [] }),
}));

vi.mock("@/services/scoring/profileExtractor", () => ({
  extractUserProfile: async () => null,   // → fallback profile used
}));

// Import AFTER the mocks are declared.
import { POST } from "../route";

function makeRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/resume/fit-check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/resume/fit-check — LLM-failure resilience (RBC regression)", () => {
  beforeEach(() => {
    messagesCreateMock.mockReset();
    process.env.ANTHROPIC_API_KEY = "dummy-for-test";
  });
  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("returns 200 with full deterministic body + summary:null when LLM throws 400 billing error", async () => {
    messagesCreateMock.mockRejectedValueOnce({
      status: 400,
      message: "Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.",
    });
    const req = makeRequest({
      resumeText: "Senior Security Engineer, 8 years experience in Python and AWS.",
      jobDescription: "Senior Security Engineer\nRequirements:\n- 5+ years\n- Python\n- AWS",
    });
    const res = await POST(req as unknown as Parameters<typeof POST>[0]);
    expect(res.status).toBe(200);
    const body = await res.json();
    // Deterministic fields present
    expect(typeof body.fitScore).toBe("number");
    expect(body.breakdown).toBeTruthy();
    expect(Array.isArray(body.strengths)).toBe(true);
    expect(Array.isArray(body.gaps)).toBe(true);
    expect(Array.isArray(body.recommendations)).toBe(true);
    // LLM piece marked unavailable
    expect(body.summary).toBeNull();
    expect(body.summarySource).toBe("unavailable");
  });

  it("returns 200 with summary:null when the LLM times out (network error)", async () => {
    messagesCreateMock.mockRejectedValueOnce(new Error("fetch failed: ETIMEDOUT"));
    const req = makeRequest({
      resumeText: "Same resume", jobDescription: "Same JD",
    });
    const res = await POST(req as unknown as Parameters<typeof POST>[0]);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summarySource).toBe("unavailable");
    expect(body.summary).toBeNull();
  });

  it("raw Anthropic error text NEVER appears in the response body", async () => {
    messagesCreateMock.mockRejectedValueOnce(
      new Error("Your credit balance is too low — see plans & billing"),
    );
    const req = makeRequest({
      resumeText: "resume", jobDescription: "JD",
    });
    const res = await POST(req as unknown as Parameters<typeof POST>[0]);
    const bodyText = JSON.stringify(await res.json());
    expect(bodyText).not.toMatch(/credit balance/i);
    expect(bodyText).not.toMatch(/plans & billing/i);
    expect(bodyText).not.toMatch(/anthropic/i);
  });

  it("returns 200 with summary populated when the LLM succeeds", async () => {
    messagesCreateMock.mockResolvedValueOnce({
      content: [{ type: "text", text: "Solid fit — 8 yrs of Python + AWS align well with the JD's requirements. One gap around Kubernetes ops depth to address." }],
    });
    const req = makeRequest({
      resumeText: "resume", jobDescription: "JD",
    });
    const res = await POST(req as unknown as Parameters<typeof POST>[0]);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summarySource).toBe("llm");
    expect(typeof body.summary).toBe("string");
    expect(body.summary.length).toBeGreaterThan(0);
  });

  it("returns 200 with summary:null when ANTHROPIC_API_KEY is not set (early exit)", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const req = makeRequest({
      resumeText: "resume", jobDescription: "JD",
    });
    const res = await POST(req as unknown as Parameters<typeof POST>[0]);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summarySource).toBe("unavailable");
    expect(body.summary).toBeNull();
    // The LLM client was never called
    expect(messagesCreateMock).not.toHaveBeenCalled();
  });
});
