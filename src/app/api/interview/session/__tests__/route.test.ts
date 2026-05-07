/**
 * /api/interview/session route tests — Phase 4 Item 1 rebuild.
 *
 * Mocks: next/headers, @supabase/ssr, the Anthropic SDK via createTracedClient
 * passthrough (fake messages.stream() yielding content_block_delta events),
 * and checkPlanLimit (we test plan gating at the helper level — the route's
 * job is just to surface what checkPlanLimit returns).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

// ── next/headers ────────────────────────────────────────────────────────────
vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({
    getAll: vi.fn().mockReturnValue([]),
    get: vi.fn(), set: vi.fn(), delete: vi.fn(),
  }),
}));

// ── @supabase/ssr ───────────────────────────────────────────────────────────
const mockGetUser = vi.fn();
vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({ auth: { getUser: mockGetUser }, from: vi.fn() })),
}));

// ── checkPlanLimit ──────────────────────────────────────────────────────────
const mockCheckPlanLimit = vi.fn();
vi.mock("@/lib/billing/checkPlanLimit", () => ({
  checkPlanLimit: (...args: unknown[]) => mockCheckPlanLimit(...args),
}));

// ── Anthropic via createTracedClient ────────────────────────────────────────
const mockAnthropicStream = vi.fn();
vi.mock("@/lib/observability/langfuse", () => ({
  createTracedClient: vi.fn(() => ({
    messages: { stream: (...args: unknown[]) => mockAnthropicStream(...args) },
  })),
}));

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL      = "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
});

async function loadRoute() {
  vi.resetModules();
  return await import("../route");
}

function makeReq(body: Record<string, unknown> = {}): Request {
  return new Request("https://test.icareeros.com/api/interview/session", {
    method:  "POST",
    headers: { "content-type": "application/json" },
    body:    JSON.stringify(body),
  });
}

async function drainStream(res: Response): Promise<{ chunks: string[]; events: string[] }> {
  expect(res.body).not.toBeNull();
  const reader  = res.body!.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  const events: string[] = [];
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    for (const frame of buffer.split("\n\n")) {
      const lines = frame.split("\n").filter(Boolean);
      let event = "message";
      const data: string[] = [];
      for (const line of lines) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data.push(line.slice(5).trim());
      }
      if (data.length === 0) continue;
      events.push(event);
      try {
        const parsed = JSON.parse(data.join("\n"));
        if (event === "message" && parsed?.text) chunks.push(parsed.text);
      } catch { /* ignore */ }
    }
    buffer = buffer.split("\n\n").pop() ?? "";
  }
  return { chunks, events };
}

function stubAnthropicStreamWithText(parts: string[]): void {
  mockAnthropicStream.mockImplementation(() => {
    return (async function* () {
      for (const p of parts) {
        yield { type: "content_block_delta", delta: { type: "text_delta", text: p } };
      }
    })();
  });
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("/api/interview/session — auth + validation", () => {
  it("returns 401 when there is no authenticated user", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    const { POST } = await loadRoute();
    const res = await POST(makeReq({ messages: [{ role: "user", content: "hi" }], jobTitle: "PM" }));
    expect(res.status).toBe(401);
    expect(mockAnthropicStream).not.toHaveBeenCalled();
  });

  it("returns 400 when messages array is empty", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockCheckPlanLimit.mockResolvedValue(null); // allow
    const { POST } = await loadRoute();
    const res = await POST(makeReq({ messages: [], jobTitle: "PM" }));
    expect(res.status).toBe(400);
    expect(mockAnthropicStream).not.toHaveBeenCalled();
  });
});

describe("/api/interview/session — plan gate", () => {
  beforeEach(() => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
  });

  it("surfaces checkPlanLimit's 402 response when free tier is blocked", async () => {
    mockCheckPlanLimit.mockResolvedValue(NextResponse.json({ error: "upgrade_required" }, { status: 402 }));
    const { POST } = await loadRoute();
    const res = await POST(makeReq({ messages: [{ role: "user", content: "hi" }], jobTitle: "PM" }));
    expect(res.status).toBe(402);
    expect(mockAnthropicStream).not.toHaveBeenCalled();
  });

  it("passes through when checkPlanLimit returns null (allowed)", async () => {
    mockCheckPlanLimit.mockResolvedValue(null);
    stubAnthropicStreamWithText(["Hello!", " First question."]);
    const { POST } = await loadRoute();
    const res = await POST(makeReq({
      messages: [{ role: "user", content: "Please start the interview." }],
      jobTitle: "Senior PM",
    }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const out = await drainStream(res);
    expect(out.chunks.join("")).toBe("Hello! First question.");
    expect(out.events.at(-1)).toBe("done");
  });
});

describe("/api/interview/session — graceful inputs", () => {
  beforeEach(() => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockCheckPlanLimit.mockResolvedValue(null);
  });

  it("handles empty job title gracefully (uses generic interview mode)", async () => {
    stubAnthropicStreamWithText(["k"]);
    const { POST } = await loadRoute();
    const res = await POST(makeReq({
      messages: [{ role: "user", content: "Please start." }],
      jobTitle: "",
    }));
    expect(res.status).toBe(200);
    const args = mockAnthropicStream.mock.calls[0][0] as { system: Array<{ text: string }> };
    expect(args.system[0].text).toContain("an unspecified role");
  });

  it("uses prompt caching with cache_control: ephemeral on the system block", async () => {
    stubAnthropicStreamWithText([""]);
    const { POST } = await loadRoute();
    const res = await POST(makeReq({
      messages: [{ role: "user", content: "Please start." }],
      jobTitle: "PM",
    }));
    expect(res.status).toBe(200);
    await drainStream(res);
    const args = mockAnthropicStream.mock.calls[0][0] as { system: Array<{ cache_control?: { type: string } }> };
    expect(args.system[0].cache_control).toEqual({ type: "ephemeral" });
  });

  it("emits the expected SSE event sequence: text frames then 'done'", async () => {
    stubAnthropicStreamWithText(["A", "B", "C"]);
    const { POST } = await loadRoute();
    const res = await POST(makeReq({
      messages: [{ role: "user", content: "Please start." }],
      jobTitle: "PM",
    }));
    const out = await drainStream(res);
    expect(out.chunks).toEqual(["A", "B", "C"]);
    expect(out.events.at(-1)).toBe("done");
  });
});
