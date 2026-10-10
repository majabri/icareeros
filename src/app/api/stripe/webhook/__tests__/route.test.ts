/**
 * /api/stripe/webhook — POST tests.
 *
 * The Stripe SDK and the Supabase admin client are fully mocked. Covers:
 *  - signature verification (400 on missing/bad signature)
 *  - #447 idempotency: a duplicate event.id is a no-op, atomic seat decrement
 *  - #446 an unmapped/non-founding price never writes plan
 *  - #448 subscription events resolve the user via Stripe customer metadata
 *    when no row is keyed by stripe_customer_id yet
 *  - #449 a founding-lifetime row's plan survives every other event type
 *  - #451 invoice.payment_failed / invoice.payment_succeeded status handling
 *  - the route always returns 200 once the signature is valid
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockConstructEvent = vi.fn();
const mockRetrieveSub = vi.fn();
const mockListLineItems = vi.fn();
const mockRetrieveCustomer = vi.fn();

vi.mock("@/lib/stripe", () => ({
  getStripe: vi.fn(() => ({
    webhooks: { constructEvent: mockConstructEvent },
    subscriptions: { retrieve: mockRetrieveSub },
    checkout: { sessions: { listLineItems: mockListLineItems } },
    customers: { retrieve: mockRetrieveCustomer },
  })),
  planFromPriceId: vi.fn((id: string) => {
    if (id === "price_starter_m") return { plan: "starter", cycle: "monthly", addon: null };
    if (id === "price_pro_a")     return { plan: "pro",     cycle: "annual",  addon: null };
    if (id === "price_founding")  return { plan: "pro",     cycle: null,      addon: "founding_lifetime" };
    return null;
  }),
}));

// ── Mock Supabase admin client ──────────────────────────────────────────
// Per-table response queues for maybeSingle(); every insert/update/upsert/rpc
// call is recorded so tests can assert on it.

type Row = Record<string, unknown>;
const maybeSingleQueue: Record<string, Array<{ data: Row | null; error: unknown }>> = {};
function pushMaybeSingle(table: string, result: { data: Row | null; error?: unknown }) {
  (maybeSingleQueue[table] ??= []).push({ data: result.data, error: result.error ?? null });
}

const inserts: Array<{ table: string; payload: Row }> = [];
const upserts: Array<{ table: string; payload: Row }> = [];
const updates: Array<{ table: string; payload: Row; whereCol: string; whereVal: unknown }> = [];
const deletes: Array<{ table: string; whereCol: string; whereVal: unknown }> = [];
const rpcCalls: Array<{ fn: string; args: Row }> = [];
let rpcResult: { data: unknown; error: unknown } = { data: null, error: null };

function makeChain(table: string) {
  return {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn((payload: Row) => {
      inserts.push({ table, payload });
      // stripe_webhook_events: duplicate insert simulated via a pre-armed error.
      const armed = insertErrorQueue[table]?.shift();
      if (armed) return Promise.resolve({ data: null, error: armed });
      return Promise.resolve({ data: null, error: null });
    }),
    upsert: vi.fn((payload: Row) => {
      upserts.push({ table, payload });
      return Promise.resolve({ data: null, error: null });
    }),
    // select(...).eq(...).maybeSingle() — read path.
    eq: vi.fn(() => ({
      maybeSingle: vi.fn(() => {
        const q = maybeSingleQueue[table];
        if (!q || q.length === 0) return Promise.resolve({ data: null, error: null });
        return Promise.resolve(q.shift()!);
      }),
    })),
    // update(payload).eq(col, val) — write path, resolves immediately.
    update: vi.fn((payload: Row) => ({
      eq: vi.fn((col: string, val: unknown) => {
        updates.push({ table, payload, whereCol: col, whereVal: val });
        return Promise.resolve({ data: null, error: null });
      }),
    })),
    // delete().eq(col, val) — used to un-claim stripe_webhook_events on a
    // handler error so Stripe's retry isn't skipped as a duplicate.
    delete: vi.fn(() => ({
      eq: vi.fn((col: string, val: unknown) => {
        deletes.push({ table, whereCol: col, whereVal: val });
        const armed = deleteErrorQueue[table]?.shift();
        if (armed) return Promise.resolve({ data: null, error: armed });
        return Promise.resolve({ data: null, error: null });
      }),
    })),
  };
}

const insertErrorQueue: Record<string, Array<unknown>> = {};
const deleteErrorQueue: Record<string, Array<unknown>> = {};
const mockFrom = vi.fn((table: string) => makeChain(table));
const mockRpc = vi.fn((fn: string, args: Row) => {
  rpcCalls.push({ fn, args });
  return Promise.resolve(rpcResult);
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({ from: mockFrom, rpc: mockRpc })),
}));

beforeEach(() => {
  vi.clearAllMocks();
  Object.keys(maybeSingleQueue).forEach(k => delete maybeSingleQueue[k]);
  Object.keys(insertErrorQueue).forEach(k => delete insertErrorQueue[k]);
  Object.keys(deleteErrorQueue).forEach(k => delete deleteErrorQueue[k]);
  inserts.length = 0;
  upserts.length = 0;
  updates.length = 0;
  deletes.length = 0;
  rpcCalls.length = 0;
  rpcResult = { data: null, error: null };
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

/** Convenience: arm the founding-lifetime lookup that resolvePlanForWrite / findUserIdForCustomer read. */
function armFoundingLookup(isFounding: boolean) {
  pushMaybeSingle("user_subscriptions", { data: { is_founding_lifetime: isFounding } });
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

  // ── #447 idempotency ────────────────────────────────────────────────

  it("processes a first-time event and records it in stripe_webhook_events", async () => {
    mockConstructEvent.mockReturnValue({
      id: "evt_1",
      type: "ping.unknown",
      data: { object: {} },
    });
    const { POST } = await load();
    const res = await POST(makeReq("payload", "sig"));
    expect(res.status).toBe(200);
    expect(inserts.some(i => i.table === "stripe_webhook_events" && i.payload.event_id === "evt_1")).toBe(true);
  });

  it("skips all side effects on a duplicate event.id (23505 from the DB)", async () => {
    insertErrorQueue["stripe_webhook_events"] = [{ code: "23505", message: "duplicate key" }];
    mockConstructEvent.mockReturnValue({
      id: "evt_dup",
      type: "checkout.session.completed",
      data: { object: { id: "cs_1", client_reference_id: "u1", customer: "cus_1", mode: "subscription", subscription: "sub_1" } },
    });
    const { POST } = await load();
    const res = await POST(makeReq("payload", "sig"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.duplicate).toBe(true);
    expect(mockRetrieveSub).not.toHaveBeenCalled();
    expect(upserts).toHaveLength(0);
  });

  it("un-claims the event and returns 500 when the handler throws, so Stripe actually redelivers it", async () => {
    mockConstructEvent.mockReturnValue({
      id: "evt_fail",
      type: "checkout.session.completed",
      data: { object: { id: "cs_1", client_reference_id: "u1", customer: "cus_1", mode: "subscription", subscription: "sub_1" } },
    });
    mockRetrieveSub.mockRejectedValue(new Error("stripe api down"));
    const { POST } = await load();
    const res = await POST(makeReq("payload", "sig"));
    // 500, not 200 — Stripe only redelivers on a non-2xx response. A 200
    // here would mean the un-claim below is never actually exercised.
    expect(res.status).toBe(500);
    expect(inserts.some(i => i.table === "stripe_webhook_events" && i.payload.event_id === "evt_fail")).toBe(true);
    expect(deletes).toContainEqual({ table: "stripe_webhook_events", whereCol: "event_id", whereVal: "evt_fail" });
  });

  it("returns 200 (not 500) when the handler throws AND the un-claim delete itself fails — nothing to gain from a retry Stripe would just skip", async () => {
    mockConstructEvent.mockReturnValue({
      id: "evt_fail_2",
      type: "checkout.session.completed",
      data: { object: { id: "cs_1", client_reference_id: "u1", customer: "cus_1", mode: "subscription", subscription: "sub_1" } },
    });
    mockRetrieveSub.mockRejectedValue(new Error("stripe api down"));
    deleteErrorQueue["stripe_webhook_events"] = [{ message: "db unreachable" }];
    const { POST } = await load();
    const res = await POST(makeReq("payload", "sig"));
    expect(res.status).toBe(200);
  });

  // ── checkout.session.completed ──────────────────────────────────────

  it("checkout.session.completed (subscription) upserts user_subscriptions with the resolved plan", async () => {
    mockConstructEvent.mockReturnValue({
      id: "evt_2",
      type: "checkout.session.completed",
      data: { object: {
        id: "cs_1", client_reference_id: "u1", customer: "cus_1",
        mode: "subscription", subscription: "sub_1",
      } },
    });
    mockRetrieveSub.mockResolvedValue({ id: "sub_1", items: { data: [{ price: { id: "price_starter_m" } }] } });
    armFoundingLookup(false); // resolvePlanForWrite's read
    const { POST } = await load();
    const res = await POST(makeReq("payload", "sig"));
    expect(res.status).toBe(200);
    const persist = upserts.find(u => u.table === "user_subscriptions");
    expect(persist).toBeDefined();
    expect(persist!.payload.user_id).toBe("u1");
    expect(persist!.payload.plan).toBe("starter");
    expect(persist!.payload.stripe_customer_id).toBe("cus_1");
  });

  it("checkout.session.completed (founding lifetime) decrements the seat atomically and sets is_founding_lifetime", async () => {
    mockConstructEvent.mockReturnValue({
      id: "evt_3",
      type: "checkout.session.completed",
      data: { object: { id: "cs_F", client_reference_id: "u1", customer: "cus_F", mode: "payment", subscription: null } },
    });
    mockListLineItems.mockResolvedValue({ data: [{ price: { id: "price_founding" } }] });
    rpcResult = { data: 49, error: null }; // atomic decrement returns the new count
    armFoundingLookup(false);
    const { POST } = await load();
    const res = await POST(makeReq("payload", "sig"));
    expect(res.status).toBe(200);
    expect(rpcCalls.some(c => c.fn === "decrement_founding_seat")).toBe(true);
    const persist = upserts.find(u => u.table === "user_subscriptions");
    expect(persist!.payload.plan).toBe("pro");
    expect(persist!.payload.is_founding_lifetime).toBe(true);
  });

  it("checkout.session.completed still grants Pro when the seat counter races to 0 (logs, does not refuse)", async () => {
    mockConstructEvent.mockReturnValue({
      id: "evt_3b",
      type: "checkout.session.completed",
      data: { object: { id: "cs_F2", client_reference_id: "u2", customer: "cus_F2", mode: "payment", subscription: null } },
    });
    mockListLineItems.mockResolvedValue({ data: [{ price: { id: "price_founding" } }] });
    rpcResult = { data: null, error: null }; // sold out mid-race
    armFoundingLookup(false);
    const { POST } = await load();
    const res = await POST(makeReq("payload", "sig"));
    expect(res.status).toBe(200);
    const persist = upserts.find(u => u.table === "user_subscriptions");
    expect(persist!.payload.plan).toBe("pro");
  });

  it("#446 — an unmapped/non-founding price never writes plan (only records the customer id)", async () => {
    mockConstructEvent.mockReturnValue({
      id: "evt_4",
      type: "checkout.session.completed",
      data: { object: { id: "cs_addon", client_reference_id: "u3", customer: "cus_addon", mode: "payment", subscription: null } },
    });
    mockListLineItems.mockResolvedValue({ data: [{ price: { id: "price_unmapped" } }] });
    const { POST } = await load();
    const res = await POST(makeReq("payload", "sig"));
    expect(res.status).toBe(200);
    const persist = upserts.find(u => u.table === "user_subscriptions");
    expect(persist).toBeDefined();
    expect(persist!.payload).not.toHaveProperty("plan");
    expect(persist!.payload.stripe_customer_id).toBe("cus_addon");
  });

  // ── #448 out-of-order subscription events ───────────────────────────

  it("customer.subscription.created falls back to Stripe customer metadata when no row is keyed by stripe_customer_id yet", async () => {
    mockConstructEvent.mockReturnValue({
      id: "evt_5",
      type: "customer.subscription.created",
      data: { object: {
        id: "sub_new", customer: "cus_new", status: "active", cancel_at_period_end: false,
        items: { data: [{ price: { id: "price_starter_m" }, current_period_end: 1700000000 }] },
      } },
    });
    pushMaybeSingle("user_subscriptions", { data: null }); // findUserIdForCustomer: no row yet
    mockRetrieveCustomer.mockResolvedValue({ deleted: false, metadata: { user_id: "u4" } });
    armFoundingLookup(false); // resolvePlanForWrite's read, keyed this time by user_id
    const { POST } = await load();
    const res = await POST(makeReq("payload", "sig"));
    expect(res.status).toBe(200);
    expect(mockRetrieveCustomer).toHaveBeenCalledWith("cus_new");
    const persist = upserts.find(u => u.table === "user_subscriptions");
    expect(persist!.payload.user_id).toBe("u4");
    expect(persist!.payload.plan).toBe("starter");
  });

  it("customer.subscription.created gives up when the Stripe customer has no user_id metadata either", async () => {
    mockConstructEvent.mockReturnValue({
      id: "evt_6",
      type: "customer.subscription.created",
      data: { object: {
        id: "sub_orphan", customer: "cus_orphan", status: "active", cancel_at_period_end: false,
        items: { data: [{ price: { id: "price_starter_m" } }] },
      } },
    });
    pushMaybeSingle("user_subscriptions", { data: null });
    mockRetrieveCustomer.mockResolvedValue({ deleted: false, metadata: {} });
    const { POST } = await load();
    const res = await POST(makeReq("payload", "sig"));
    expect(res.status).toBe(200);
    expect(upserts.find(u => u.table === "user_subscriptions")).toBeUndefined();
  });

  // ── #449 founding-lifetime protection ───────────────────────────────

  it("#449 — a founding-lifetime row's plan is forced to pro on a subsequent subscription.updated, even for an unmapped price", async () => {
    mockConstructEvent.mockReturnValue({
      id: "evt_7",
      type: "customer.subscription.updated",
      data: { object: {
        id: "sub_extra", customer: "cus_found", status: "canceled", cancel_at_period_end: false,
        items: { data: [{ price: { id: "price_unmapped" } }] },
      } },
    });
    pushMaybeSingle("user_subscriptions", { data: { user_id: "u5" } }); // findUserIdForCustomer
    armFoundingLookup(true); // resolvePlanForWrite: this customer IS founding
    const { POST } = await load();
    const res = await POST(makeReq("payload", "sig"));
    expect(res.status).toBe(200);
    const persist = upserts.find(u => u.table === "user_subscriptions");
    expect(persist!.payload.plan).toBe("pro");
    expect(persist!.payload.status).toBe("active");
  });

  it("#449 — customer.subscription.deleted on a founding-lifetime customer clears the subscription id but leaves plan untouched", async () => {
    mockConstructEvent.mockReturnValue({
      id: "evt_8",
      type: "customer.subscription.deleted",
      data: { object: { id: "sub_extra", customer: "cus_found2" } },
    });
    pushMaybeSingle("user_subscriptions", { data: { user_id: "u6", is_founding_lifetime: true } });
    const { POST } = await load();
    const res = await POST(makeReq("payload", "sig"));
    expect(res.status).toBe(200);
    const u = updates.find(c => c.table === "user_subscriptions");
    expect(u).toBeDefined();
    expect(u!.payload).not.toHaveProperty("plan");
    expect((u!.payload as Record<string, unknown>).stripe_subscription_id).toBeNull();
  });

  it("customer.subscription.deleted on a NON-founding customer sets plan='free' status='canceled'", async () => {
    mockConstructEvent.mockReturnValue({
      id: "evt_9",
      type: "customer.subscription.deleted",
      data: { object: { id: "sub_X", customer: "cus_X" } },
    });
    pushMaybeSingle("user_subscriptions", { data: { user_id: "u7", is_founding_lifetime: false } });
    const { POST } = await load();
    const res = await POST(makeReq("payload", "sig"));
    expect(res.status).toBe(200);
    const u = updates.find(c => c.table === "user_subscriptions");
    expect((u!.payload as Record<string, unknown>).plan).toBe("free");
    expect((u!.payload as Record<string, unknown>).status).toBe("canceled");
  });

  // ── #451 invoice status handling ────────────────────────────────────

  it("invoice.payment_failed sets status='past_due'", async () => {
    mockConstructEvent.mockReturnValue({
      id: "evt_10",
      type: "invoice.payment_failed",
      data: { object: { customer: "cus_pd" } },
    });
    const { POST } = await load();
    const res = await POST(makeReq("payload", "sig"));
    expect(res.status).toBe(200);
    const u = updates.find(c => c.table === "user_subscriptions");
    expect((u!.payload as Record<string, unknown>).status).toBe("past_due");
  });

  it("invoice.payment_succeeded sets status='active' (#451 recovery path)", async () => {
    mockConstructEvent.mockReturnValue({
      id: "evt_11",
      type: "invoice.payment_succeeded",
      data: { object: { customer: "cus_recovered" } },
    });
    const { POST } = await load();
    const res = await POST(makeReq("payload", "sig"));
    expect(res.status).toBe(200);
    const u = updates.find(c => c.table === "user_subscriptions");
    expect((u!.payload as Record<string, unknown>).status).toBe("active");
  });

  it("unhandled event types still return 200 (no throw)", async () => {
    mockConstructEvent.mockReturnValue({ id: "evt_12", type: "ping.unknown", data: { object: {} } });
    const { POST } = await load();
    const res = await POST(makeReq("payload", "sig"));
    expect(res.status).toBe(200);
  });

  it("handler exception still returns 200 to avoid Stripe retry storms", async () => {
    mockConstructEvent.mockReturnValue({
      id: "evt_13",
      type: "checkout.session.completed",
      data: { object: { /* missing client_reference_id forces the early-return error path */ } },
    });
    const { POST } = await load();
    const res = await POST(makeReq("payload", "sig"));
    expect(res.status).toBe(200);
  });
});
