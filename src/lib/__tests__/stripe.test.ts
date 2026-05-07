/**
 * src/lib/stripe.ts — pure unit tests
 *
 * No real Stripe SDK calls. We mock the `stripe` module entirely so this
 * suite passes without the package being installed in the local sandbox.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the `stripe` module so importing src/lib/stripe.ts doesn't require
// the package to be installed in the sandbox. The Stripe constructor here
// is a stub.
vi.mock("stripe", () => {
  function StripeStub(this: unknown) {
    (this as { _stub: boolean })._stub = true;
  }
  return { default: StripeStub as unknown };
});

// Snapshot env vars we mutate.
const ENV_KEYS = [
  "STRIPE_PRICE_STARTER_MONTHLY",
  "STRIPE_PRICE_STARTER_ANNUAL",
  "STRIPE_PRICE_STANDARD_MONTHLY",
  "STRIPE_PRICE_PRO_MONTHLY",
  "STRIPE_PRICE_PRO_ANNUAL",
  "STRIPE_PRICE_FOUNDING_LIFETIME",
  "STRIPE_PRICE_SPRINT",
];
const SNAPSHOT: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) SNAPSHOT[k] = process.env[k];
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (SNAPSHOT[k] === undefined) delete process.env[k];
    else process.env[k] = SNAPSHOT[k];
  }
});

async function loadLib() {
  vi.resetModules();
  return await import("../stripe");
}

describe("resolvePriceId", () => {
  it("returns the env var for a plan+cycle pair", async () => {
    process.env.STRIPE_PRICE_STARTER_MONTHLY = "price_starter_m";
    process.env.STRIPE_PRICE_PRO_ANNUAL      = "price_pro_a";
    const { resolvePriceId } = await loadLib();
    expect(resolvePriceId({ plan: "starter", cycle: "monthly" })).toBe("price_starter_m");
    expect(resolvePriceId({ plan: "pro",     cycle: "annual"  })).toBe("price_pro_a");
  });

  it("returns null when the env var is unset", async () => {
    delete process.env.STRIPE_PRICE_STANDARD_MONTHLY;
    const { resolvePriceId } = await loadLib();
    expect(resolvePriceId({ plan: "standard", cycle: "monthly" })).toBeNull();
  });

  it("addon resolves separately from plan/cycle", async () => {
    process.env.STRIPE_PRICE_SPRINT            = "price_sprint";
    process.env.STRIPE_PRICE_FOUNDING_LIFETIME = "price_founding";
    const { resolvePriceId } = await loadLib();
    expect(resolvePriceId({ addon: "sprint" })).toBe("price_sprint");
    expect(resolvePriceId({ addon: "founding_lifetime" })).toBe("price_founding");
  });

  it("returns null when neither plan/cycle nor addon is provided", async () => {
    const { resolvePriceId } = await loadLib();
    expect(resolvePriceId({})).toBeNull();
  });
});

describe("planFromPriceId", () => {
  it("reverse-maps starter monthly", async () => {
    process.env.STRIPE_PRICE_STARTER_MONTHLY = "price_X";
    const { planFromPriceId } = await loadLib();
    expect(planFromPriceId("price_X")).toEqual({ plan: "starter", cycle: "monthly", addon: null });
  });

  it("reverse-maps pro annual", async () => {
    process.env.STRIPE_PRICE_PRO_ANNUAL = "price_Y";
    const { planFromPriceId } = await loadLib();
    expect(planFromPriceId("price_Y")).toEqual({ plan: "pro", cycle: "annual", addon: null });
  });

  it("Founding Lifetime reverse-maps to pro/null/founding_lifetime", async () => {
    process.env.STRIPE_PRICE_FOUNDING_LIFETIME = "price_Z";
    const { planFromPriceId } = await loadLib();
    expect(planFromPriceId("price_Z")).toEqual({ plan: "pro", cycle: null, addon: "founding_lifetime" });
  });

  it("returns null for unknown price ids", async () => {
    const { planFromPriceId } = await loadLib();
    expect(planFromPriceId("price_unknown")).toBeNull();
  });
});

describe("isFoundingPriceId", () => {
  it("true when the env var matches", async () => {
    process.env.STRIPE_PRICE_FOUNDING_LIFETIME = "price_F";
    const { isFoundingPriceId } = await loadLib();
    expect(isFoundingPriceId("price_F")).toBe(true);
    expect(isFoundingPriceId("price_other")).toBe(false);
  });

  it("false when the env var is unset", async () => {
    delete process.env.STRIPE_PRICE_FOUNDING_LIFETIME;
    const { isFoundingPriceId } = await loadLib();
    expect(isFoundingPriceId("price_F")).toBe(false);
  });
});

describe("getStripe", () => {
  it("throws when STRIPE_SECRET_KEY is unset", async () => {
    const before = process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_SECRET_KEY;
    const { getStripe } = await loadLib();
    expect(() => getStripe()).toThrow(/STRIPE_SECRET_KEY/);
    if (before !== undefined) process.env.STRIPE_SECRET_KEY = before;
  });

  it("returns the same instance on subsequent calls", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test";
    const { getStripe } = await loadLib();
    const a = getStripe();
    const b = getStripe();
    expect(a).toBe(b);
  });
});
