/**
 * /api/stripe/checkout — POST tests.
 *
 * Stripe SDK is mocked entirely so this suite passes without `stripe` being
 * installed in the local sandbox. CI/Vercel install the real package.
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
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    upsert: vi.fn(() => Promise.resolve({ data: null, error: null })),
    update: vi.fn(() => Promise.resolve({ data: null, error: null })),
    insert: vi.fn().mockReturnThis(),
    eq:     vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(() => {
      const q = fromQueue[table];
      if (!q || q.length === 0) return Promise.resolve({ data: null, error: null });
      return Promise.resolve(q.shift()!);
    }),
  };
  return chain;
}
const mockFrom = vi.fn((table: string) => makeChain(table));

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  })),
}));

const mockCreateCustomer = vi.fn();
const mockCreateCheckout = vi.fn();
vi.mock("@/lib/stripe", () => ({
  getStripe: vi.fn(() => ({
    customers: { create: mockCreateCustomer },
    checkout:  { sessions: { create: mockCreateCheckout } },
  })),
  isFoundingPriceId: vi.fn((id: string) => id === "price_founding"),
}));

beforeEach(() => {
  vi.clearAllMocks();
  Object.keys(fromQueue).forEach(k => delete fromQueue[k]);
});

async function load() {
  vi.resetModules();
  return await import("../route");
}

function makeReq(body: unknown): Request {
  return new Request("https://test.icareeros.com/api/stripe/checkout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validBody = {
  priceId: "price_starter_m",
  mode: "subscription",
  successUrl: "https://x/success",
  cancelUrl:  "https://x/cancel",
};

describe("POST /api/stripe/checkout", () => {
  it("401 when no authenticated user", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const { POST } = await load();
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(401);
  });

  it("400 when body is not valid JSON", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1", email: "u@x" } } });
    const { POST } = await load();
    const bad = new Request("https://x/api/stripe/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not-json",
    });
    const res = await POST(bad);
    expect(res.status).toBe(400);
  });

  it("400 when required fields are missing", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1", email: "u@x" } } });
    const { POST } = await load();
    const res = await POST(makeReq({ priceId: "", mode: "subscription" }));
    expect(res.status).toBe(400);
  });

  it("410 sold_out when founding seats remaining = 0", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1", email: "u@x" } } });
    pushFrom("feature_flags", { data: { value: 0, enabled: true }, error: null });
    const { POST } = await load();
    const res = await POST(makeReq({ ...validBody, priceId: "price_founding", mode: "payment" }));
    expect(res.status).toBe(410);
  });

  it("410 sold_out when founding flag is disabled even with seats > 0", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1", email: "u@x" } } });
    pushFrom("feature_flags", { data: { value: 50, enabled: false }, error: null });
    const { POST } = await load();
    const res = await POST(makeReq({ ...validBody, priceId: "price_founding", mode: "payment" }));
    expect(res.status).toBe(410);
  });

  it("200 happy path: creates customer + checkout session, returns checkoutUrl", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1", email: "u@x" } } });
    pushFrom("user_subscriptions", { data: null, error: null });   // no existing customer
    mockCreateCustomer.mockResolvedValue({ id: "cus_123" });
    mockCreateCheckout.mockResolvedValue({ url: "https://stripe.test/c_42" });
    const { POST } = await load();
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.checkoutUrl).toBe("https://stripe.test/c_42");
    expect(mockCreateCustomer).toHaveBeenCalledTimes(1);
    expect(mockCreateCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "subscription",
        customer: "cus_123",
        line_items: [{ price: "price_starter_m", quantity: 1 }],
        client_reference_id: "u1",
      }),
    );
  });

  it("reuses an existing stripe_customer_id when present", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1", email: "u@x" } } });
    pushFrom("user_subscriptions", { data: { stripe_customer_id: "cus_existing", plan: "starter", status: "active" }, error: null });
    mockCreateCheckout.mockResolvedValue({ url: "https://stripe.test/c_99" });
    const { POST } = await load();
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(200);
    expect(mockCreateCustomer).not.toHaveBeenCalled();
    expect(mockCreateCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_existing" }),
    );
  });

  it("500 when Stripe SDK throws", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1", email: "u@x" } } });
    pushFrom("user_subscriptions", { data: { stripe_customer_id: "cus_existing" }, error: null });
    mockCreateCheckout.mockRejectedValue(new Error("stripe down"));
    const { POST } = await load();
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("stripe_error");
  });
});
