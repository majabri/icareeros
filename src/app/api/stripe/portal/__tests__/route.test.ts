/**
 * /api/stripe/portal — GET tests.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({
    getAll: vi.fn().mockReturnValue([]),
    get: vi.fn(), set: vi.fn(), delete: vi.fn(),
  }),
}));

const mockGetUser = vi.fn();
const fromQueue: Record<string, Array<unknown>> = {};
function pushFrom(table: string, result: unknown) {
  if (!fromQueue[table]) fromQueue[table] = [];
  fromQueue[table].push(result);
}
function makeChain(table: string) {
  return {
    select: vi.fn().mockReturnThis(),
    eq:     vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(() => {
      const q = fromQueue[table];
      if (!q || q.length === 0) return Promise.resolve({ data: null, error: null });
      return Promise.resolve(q.shift()!);
    }),
  };
}
const mockFrom = vi.fn((table: string) => makeChain(table));

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  })),
}));

const mockCreatePortal = vi.fn();
vi.mock("@/lib/stripe", () => ({
  getStripe: vi.fn(() => ({
    billingPortal: { sessions: { create: mockCreatePortal } },
  })),
}));

beforeEach(() => {
  vi.clearAllMocks();
  Object.keys(fromQueue).forEach(k => delete fromQueue[k]);
});

async function load() {
  vi.resetModules();
  return await import("../route");
}

describe("GET /api/stripe/portal", () => {
  it("401 when no authenticated user", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const { GET } = await load();
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("404 when user has no stripe_customer_id", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    pushFrom("user_subscriptions", { data: null, error: null });
    const { GET } = await load();
    const res = await GET();
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("no_customer");
  });

  it("200 returns portalUrl on happy path", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    pushFrom("user_subscriptions", { data: { stripe_customer_id: "cus_42" }, error: null });
    mockCreatePortal.mockResolvedValue({ url: "https://stripe.test/portal_x" });
    const { GET } = await load();
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.portalUrl).toBe("https://stripe.test/portal_x");
    expect(mockCreatePortal).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_42" }),
    );
  });

  it("500 on Stripe SDK failure", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    pushFrom("user_subscriptions", { data: { stripe_customer_id: "cus_42" }, error: null });
    mockCreatePortal.mockRejectedValue(new Error("oops"));
    const { GET } = await load();
    const res = await GET();
    expect(res.status).toBe(500);
  });
});
