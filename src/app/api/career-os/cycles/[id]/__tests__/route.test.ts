/**
 * DELETE /api/career-os/cycles/[id] route tests.
 *
 * Mocks: next/headers (Next 15 cookies request scope) and @supabase/ssr
 * — the createServerClient factory returns a stub auth getter and a
 * minimal Postgrest builder. Tests focus on the auth gate; happy-path
 * behaviour is exercised end-to-end by the dashboard's UI flow.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── next/headers ───────────────────────────────────────────────────────────
vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({
    getAll: vi.fn().mockReturnValue([]),
    get:    vi.fn(),
    set:    vi.fn(),
    delete: vi.fn(),
  }),
}));

// ── Programmable supabase mock ─────────────────────────────────────────────
const mockGetUser = vi.fn();

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getUser: mockGetUser },
    from: () => {
      const chain: Record<string, unknown> = {};
      const methods = ["select", "delete", "eq"];
      methods.forEach((m) => { chain[m] = vi.fn(() => chain); });
      // Terminal — no cycle found
      (chain as { maybeSingle: () => Promise<unknown> }).maybeSingle =
        () => Promise.resolve({ data: null, error: null });
      // Awaitable for the delete call
      (chain as { then: (fn: (v: unknown) => unknown) => Promise<unknown> }).then =
        (resolve) => Promise.resolve({ data: null, error: null }).then(resolve);
      return chain;
    },
  }),
}));

vi.mock("@/lib/supabase-cookie-options", () => ({
  withCrossSubdomainCookie: (opts: unknown) => opts,
}));

// Stub env that the route reads at module init
process.env.NEXT_PUBLIC_SUPABASE_URL      = "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-test";

const { DELETE } = await import("../route");

describe("DELETE /api/career-os/cycles/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 for an unauthenticated request", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: "No session" },
    });

    const res = await DELETE(
      new Request("https://example.com/api/career-os/cycles/abc-123", { method: "DELETE" }),
      { params: Promise.resolve({ id: "abc-123" }) },
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/unauthorized/i);
  });

  it("returns 404 when the cycle does not exist (or isn't owned by caller)", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: "user-1" } },
      error: null,
    });

    const res = await DELETE(
      new Request("https://example.com/api/career-os/cycles/abc-123", { method: "DELETE" }),
      { params: Promise.resolve({ id: "abc-123" }) },
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/not found/i);
  });
});
