/**
 * /api/stripe/webhook — POST tests.
 *
 * The Stripe SDK is fully mocked. We verify (a) signature failures return 400,
 * (b) the four happy-path event handlers walk the right Supabase table,
 * (c) founding-lifetime decrements the seat counter atomically,
 * (d) the route always returns 200 once the signature is valid.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockConstructEvent = vi.fn();
const mockRetrieveSub = vi.fn();
const mockListLineItems = vi.fn();

vi.mock("@/lib/stripe", () => ({
  getStripe: vi.fn(() => ({
    webhooks: { constructEvent: mockConstructEvent },
    subscriptions: { retrieve: mockRetrieveSub },
    checkout: { sessions: { listLineItems: mockListLineItems } },
  })),
  planFromPriceId: vi.fn((id: string) => {
    if (id === "price_starter_m") return { plan: "starter", cycle: "monthly", addon: null };
    if (id === "price_pro_a")     return { plan: "pro",     cycle: "annual",  addon: null };
    if (id === "price_founding")  return { plan: "pro",     cycle: null,      addon: "founding_lifetime" };
    return null;
  }),
}));

// Mock @supabase/supabase-js admin client.
const fromQueue: Record<string, Array<unknown>> = {};
function pushFrom(table: string, result: unknown) {
  if (!fromQueue[table]) fromQueue[table] = [];
  fromQueue[table].push(result);
}
const updateCalls: Array<{ table: string; payload: unknown; whereCol?: string; whereVal?: unknown }> = [];
const upsertCalls: Array<{ table: string; payload: unknown }> = [];
function makeChain(table: string) {
  return {
    select: vi.fn().mockReturnThis(),
    upsert: vi.fn((payload: unknown) => {
      upsertCalls.push({ table, payload });
      return Promise.resolve({ data: null, error: null });
    }),
    update: vi.fn((payload: unknown) => {
      const obj: Record<string, unknown> = {
        eq: vi.fn((col: string, val: unknown) => {
          updateCalls.push({ table, payload, whereCol: col, whereVal: val });
          return Promise.resolve({ data: null, error: null });
        }),
        gt: vi.fn(() => {
          // founding decrement uses .update().eq().gt() — chain
          updateCalls.push({ table, payload });
          return Promise.resolve({ data: null, error: null });
        }),
      };
      // Permit .eq().gt() chain: eq returns same shape with gt
      obj.eq = vi.fn((col: string, val: unknown) => {
        updateCalls.push({ table, payload, whereCol: col, whereVal: val });
        return {
          gt: vi.fn(() => Promise.resolve({ data: null, error: null })),
          then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(resolve),
        };
      });
      return obj;
    }),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(() => {
      const q = fromQueue[table];
      if (!q || q.length === 0) return Promise.resolve({ data: null, error: null });
      return Promise.resolve(q.shift()!);
    }),
  };
}
const mockFrom = vi.fn((table: string) => makeChain(table));
vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({ from: mockFrom })),
}));

beforeEach(() => {
  vi.clearAllMocks();
  Object.keys(fromQueue).forEach(k => delete fromQueue[k]);
  updateCalls.length = 0;
  upsertCalls.length = 0;
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
});

async function load() {
  vi.resetModules();
  return await import("../route");
}

function makeReq(body: string, sig?: string): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (sig !== undefined) headers["stripe-signature"] = sig;
  return new Request("https://x/api/stripe/webhook", { method: "POST", headers, body });
}

describe("POST /api/stripe/webhook", () => {
  it("400 when stripe-signature header is missing", async () => {
    const { POST } = await load();
    const res = await POST(makeReq("payload"));
    expect(res.status).toBe(400);
  });

  it("400 when signature verification fails", async () => {
    mockConstructEvent.mockImplementation(() => { throw new Error("bad sig"); });
    const { POST } = await load();
    const res = await POST(makeReq("payload", "sig"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("bad_signature");
  });

  it("checkout.session.completed (subscription) upserts user_subscriptions with the resolved plan", async () => {
    mockConstructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: { object: {
        id: "cs_1",
        client_reference_id: "u1",
        customer: "cus_1",
        mode: "subscription",
        subscription: "sub_1",
      } },
    });
    mockRetrieveSub.mockResolvedValue({
      id: "sub_1",
      items: { data: [{ price: { id: "price_starter_m" } }] },
    });
    const { POST } = await load();
    const res = await POST(makeReq("payload", "sig"));
    expect(res.status).toBe(200);
    expect(upsertCalls).toHaveLength(1);
    expect(upsertCalls[0].table).toBe("user_subscriptions");
    const payload = upsertCalls[0].payload as Record<string, unknown>;
    expect(payload.user_id).toBe("u1");
    expect(payload.plan).toBe("starter");
    expect(payload.stripe_customer_id).toBe("cus_1");
  });

  it("checkout.session.completed (founding lifetime) decrements founding_seats_remaining", async () => {
    mockConstructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: { object: {
        id: "cs_F",
        client_reference_id: "u1",
        customer: "cus_F",
        mode: "payment",
        subscription: null,
      } },
    });
    mockListLineItems.mockResolvedValue({
      data: [{ price: { id: "price_founding" } }],
    });
    pushFrom("feature_flags", { data: { value: 50 }, error: null });
    const { POST } = await load();
    const res = await POST(makeReq("payload", "sig"));
    expect(res.status).toBe(200);
    const seatUpdate = updateCalls.find((c) => c.table === "feature_flags");
    expect(seatUpdate).toBeDefined();
    expect((seatUpdate!.payload as { value: number }).value).toBe(49);
    // pro plan persisted
    const persist = upsertCalls.find((c) => c.table === "user_subscriptions");
    expect(persist).toBeDefined();
    expect((persist!.payload as { plan: string }).plan).toBe("pro");
  });

  it("customer.subscription.deleted sets plan='free' status='canceled'", async () => {
    mockConstructEvent.mockReturnValue({
      type: "customer.subscription.deleted",
      data: { object: {
        id: "sub_X",
        customer: "cus_X",
        items: { data: [{ price: { id: "price_pro_a" } }] },
      } },
    });
    const { POST } = await load();
    const res = await POST(makeReq("payload", "sig"));
    expect(res.status).toBe(200);
    const u = updateCalls.find((c) => c.table === "user_subscriptions");
    expect(u).toBeDefined();
    expect((u!.payload as { plan: string }).plan).toBe("free");
    expect((u!.payload as { status: string }).status).toBe("canceled");
  });

  it("invoice.payment_failed sets status='past_due'", async () => {
    mockConstructEvent.mockReturnValue({
      type: "invoice.payment_failed",
      data: { object: { customer: "cus_pd" } },
    });
    const { POST } = await load();
    const res = await POST(makeReq("payload", "sig"));
    expect(res.status).toBe(200);
    const u = updateCalls.find((c) => c.table === "user_subscriptions");
    expect(u).toBeDefined();
    expect((u!.payload as { status: string }).status).toBe("past_due");
  });

  it("unhandled event types still return 200 (no throw)", async () => {
    mockConstructEvent.mockReturnValue({
      type: "ping.unknown",
      data: { object: {} },
    });
    const { POST } = await load();
    const res = await POST(makeReq("payload", "sig"));
    expect(res.status).toBe(200);
  });

  it("handler exception still returns 200 to avoid Stripe retry storms", async () => {
    mockConstructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: { object: { /* missing client_reference_id forces error path */ } },
    });
    const { POST } = await load();
    const res = await POST(makeReq("payload", "sig"));
    expect(res.status).toBe(200);
  });
});
