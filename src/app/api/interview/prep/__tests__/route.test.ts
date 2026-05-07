/**
 * /api/interview/prep route tests — Phase 4 Item 1 rebuild.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({
    getAll: vi.fn().mockReturnValue([]),
    get: vi.fn(), set: vi.fn(), delete: vi.fn(),
  }),
}));

const mockGetUser = vi.fn();
vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({ auth: { getUser: mockGetUser }, from: vi.fn() })),
}));

const mockCheckPlanLimit = vi.fn();
vi.mock("@/lib/billing/checkPlanLimit", () => ({
  checkPlanLimit: (...args: unknown[]) => mockCheckPlanLimit(...args),
}));

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
  return new Request("https://test.icareeros.com/api/interview/prep", {
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

describe("/api/interview/prep", () => {
  it("returns 401 when unauthenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    const { POST } = await loadRoute();
    const res = await POST(makeReq({ jobTitle: "PM" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when both jobTitle and jobDescription are missing", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockCheckPlanLimit.mockResolvedValue(null);
    const { POST } = await loadRoute();
    const res = await POST(makeReq({}));
    expect(res.status).toBe(400);
  });

  it("returns 402 when plan gate denies", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockCheckPlanLimit.mockResolvedValue(NextResponse.json({ error: "upgrade_required" }, { status: 402 }));
    const { POST } = await loadRoute();
    const res = await POST(makeReq({ jobTitle: "PM" }));
    expect(res.status).toBe(402);
    expect(mockAnthropicStream).not.toHaveBeenCalled();
  });

  it("streams a prep guide with jobTitle alone (no jobDescription)", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockCheckPlanLimit.mockResolvedValue(null);
    stubAnthropicStreamWithText(["## Likely behavioural questions\n", "- Tell me about..."]);
    const { POST } = await loadRoute();
    const res = await POST(makeReq({ jobTitle: "Senior Backend Engineer" }));
    expect(res.status).toBe(200);
    const out = await drainStream(res);
    expect(out.chunks.join("")).toContain("Likely behavioural questions");
    expect(out.events.at(-1)).toBe("done");
  });
});
