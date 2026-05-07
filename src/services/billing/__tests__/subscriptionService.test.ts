/**
 * subscriptionService unit tests — Phase 5 (post-Stripe activation)
 *
 * Phase 5 (2026-05-07) replaced Supabase edge-fn calls with direct fetch to
 * the new /api/stripe/* routes. We mock global.fetch and the Supabase
 * browser client; flip the NEXT_PUBLIC_MONETIZATION_ENABLED flag per test.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Supabase client mock — `getSubscription` reads directly from the table now,
// not via an edge function.
const mockMaybeSingle = vi.fn();
const mockGetUser = vi.fn();
vi.mock("@/lib/supabase", () => ({
  createClient: () => ({
    auth: { getUser: mockGetUser },
    from: (_table: string) => ({
      select: () => ({
        eq: () => ({ maybeSingle: mockMaybeSingle }),
      }),
    }),
  }),
}));

const ORIGINAL_FLAG  = process.env.NEXT_PUBLIC_MONETIZATION_ENABLED;
const ORIGINAL_FETCH = global.fetch;

beforeEach(() => {
  vi.clearAllMocks();
  mockMaybeSingle.mockReset();
  mockGetUser.mockReset();
});

afterEach(() => {
  if (ORIGINAL_FLAG === undefined) delete process.env.NEXT_PUBLIC_MONETIZATION_ENABLED;
  else                              process.env.NEXT_PUBLIC_MONETIZATION_ENABLED = ORIGINAL_FLAG;
  global.fetch = ORIGINAL_FETCH;
});

async function loadService() {
  vi.resetModules();
  return await import("../subscriptionService");
}

describe("subscriptionService — monetization disabled", () => {
  beforeEach(() => { delete process.env.NEXT_PUBLIC_MONETIZATION_ENABLED; });

  it("createCheckoutSession returns null and does NOT fetch", async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;
    const svc = await loadService();
    const url = await svc.createCheckoutSession({ plan: "starter", cycle: "monthly" });
    expect(url).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("getBillingPortalUrl returns null and does NOT fetch", async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;
    const svc = await loadService();
    const url = await svc.getBillingPortalUrl();
    expect(url).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("canAccessFeature fails-open to true", async () => {
    const svc = await loadService();
    const allowed = await svc.canAccessFeature("feature_ai_coach");
    expect(allowed).toBe(true);
  });
});

describe("subscriptionService — monetization enabled", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_MONETIZATION_ENABLED = "true";
    process.env.NEXT_PUBLIC_STRIPE_PRICE_STARTER_MONTHLY = "price_starter_m";
    process.env.NEXT_PUBLIC_BASE_URL = "https://icareeros.test";
  });

  it("createCheckoutSession POSTs to /api/stripe/checkout with the resolved price id", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ checkoutUrl: "https://stripe.test/c_123" }),
    });
    global.fetch = fetchSpy as unknown as typeof fetch;
    const svc = await loadService();
    const url = await svc.createCheckoutSession({ plan: "starter", cycle: "monthly" });
    expect(url).toBe("https://stripe.test/c_123");
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/stripe/checkout",
      expect.objectContaining({ method: "POST" }),
    );
    const call = fetchSpy.mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body.priceId).toBe("price_starter_m");
    expect(body.mode).toBe("subscription");
  });

  it("createCheckoutSession with addon switches mode to 'payment'", async () => {
    process.env.NEXT_PUBLIC_STRIPE_PRICE_FOUNDING_LIFETIME = "price_founding";
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ checkoutUrl: "https://stripe.test/p_1" }),
    });
    global.fetch = fetchSpy as unknown as typeof fetch;
    const svc = await loadService();
    const url = await svc.createCheckoutSession({ addon: "founding_lifetime" });
    expect(url).toBe("https://stripe.test/p_1");
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.mode).toBe("payment");
    expect(body.priceId).toBe("price_founding");
  });

  it("createCheckoutSession returns null when env var for the price is unset", async () => {
    delete process.env.NEXT_PUBLIC_STRIPE_PRICE_STARTER_MONTHLY;
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;
    const svc = await loadService();
    const url = await svc.createCheckoutSession({ plan: "starter", cycle: "monthly" });
    expect(url).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("getBillingPortalUrl GETs /api/stripe/portal and returns the url", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ portalUrl: "https://stripe.test/portal_42" }),
    });
    global.fetch = fetchSpy as unknown as typeof fetch;
    const svc = await loadService();
    const url = await svc.getBillingPortalUrl();
    expect(url).toBe("https://stripe.test/portal_42");
    expect(fetchSpy).toHaveBeenCalledWith("/api/stripe/portal", { method: "GET" });
  });

  it("getBillingPortalUrl returns null on non-200", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: false, status: 404, text: async () => "no_customer",
    });
    global.fetch = fetchSpy as unknown as typeof fetch;
    const svc = await loadService();
    const url = await svc.getBillingPortalUrl();
    expect(url).toBeNull();
  });
});

describe("subscriptionService — getSubscription / getCurrentPlan", () => {
  beforeEach(() => { process.env.NEXT_PUBLIC_MONETIZATION_ENABLED = "true"; });

  it("returns null when no user", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const svc = await loadService();
    const sub = await svc.getSubscription();
    expect(sub).toBeNull();
  });

  it("reads the row from user_subscriptions for the signed-in user", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mockMaybeSingle.mockResolvedValue({
      data: { user_id: "u1", plan: "starter", status: "active" },
      error: null,
    });
    const svc = await loadService();
    const sub = await svc.getSubscription();
    expect(sub).toMatchObject({ plan: "starter", status: "active" });
  });

  it("getCurrentPlan defaults to 'free' when no row", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    const svc = await loadService();
    const plan = await svc.getCurrentPlan();
    expect(plan).toBe("free");
  });
});
