import { describe, it, expect, vi, beforeEach } from "vitest";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    supabase: {
      auth: { getUser: vi.fn() },
    },
    anthropicCreate: vi.fn(),
  },
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ getAll: () => [], set: () => {} })),
}));

vi.mock("@/lib/supabase-cookie-options", () => ({
  withCrossSubdomainCookie: (o: unknown) => o,
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => mocks.supabase),
}));

vi.mock("@/lib/observability/langfuse", () => ({
  createTracedClient: vi.fn(() => ({
    messages: { create: mocks.anthropicCreate },
  })),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

import { POST } from "@/app/api/hire/design-agent/route";

describe("POST /api/hire/design-agent", () => {
  it("401 when unauthenticated", async () => {
    mocks.supabase.auth.getUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(new Request("http://x/api/hire/design-agent", {
      method: "POST",
      body: JSON.stringify({ description: "Senior Go engineer" }),
    }));
    expect(res.status).toBe(401);
  });

  it("400 when description is too short (<5 chars)", async () => {
    mocks.supabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const res = await POST(new Request("http://x/api/hire/design-agent", {
      method: "POST",
      body: JSON.stringify({ description: "hi" }),
    }));
    expect(res.status).toBe(400);
  });

  it("returns parsed JSON draft on a well-formed LLM response", async () => {
    mocks.supabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mocks.anthropicCreate.mockResolvedValue({
      content: [{
        type: "text",
        text: JSON.stringify({
          title:         "Senior Backend Engineer",
          description:   "Build payments.",
          requirements:  "Go\nPostgres",
          nice_to_haves: "AWS",
        }),
      }],
    });
    const res = await POST(new Request("http://x/api/hire/design-agent", {
      method: "POST",
      body: JSON.stringify({ description: "Senior Go engineer leading payments." }),
    }));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.title).toBe("Senior Backend Engineer");
    expect(j.requirements).toContain("Go");
  });

  it("strips ```json fences before parsing", async () => {
    mocks.supabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mocks.anthropicCreate.mockResolvedValue({
      content: [{
        type: "text",
        text: "```json\n" + JSON.stringify({
          title: "X", description: "Y", requirements: "R", nice_to_haves: "N",
        }) + "\n```",
      }],
    });
    const res = await POST(new Request("http://x/api/hire/design-agent", {
      method: "POST",
      body: JSON.stringify({ description: "describe the role" }),
    }));
    expect(res.status).toBe(200);
  });

  it("502 when the LLM returns malformed JSON", async () => {
    mocks.supabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mocks.anthropicCreate.mockResolvedValue({
      content: [{ type: "text", text: "definitely not json" }],
    });
    const res = await POST(new Request("http://x/api/hire/design-agent", {
      method: "POST",
      body: JSON.stringify({ description: "describe the role" }),
    }));
    expect(res.status).toBe(502);
  });

  it("uses claude-haiku-4-5 via createTracedClient (Langfuse tracing)", async () => {
    mocks.supabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mocks.anthropicCreate.mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify({ title:"t", description:"d", requirements:"r", nice_to_haves:"n" }) }],
    });
    await POST(new Request("http://x/api/hire/design-agent", {
      method: "POST",
      body: JSON.stringify({ description: "describe the role" }),
    }));
    expect(mocks.anthropicCreate).toHaveBeenCalledTimes(1);
    expect(mocks.anthropicCreate.mock.calls[0][0]).toMatchObject({
      model: "claude-haiku-4-5",
    });
  });
});
