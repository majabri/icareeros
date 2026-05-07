// ── Stripe SDK singleton + price-ID resolver ──────────────────────────────
//
// Phase 5 — Stripe activation. Per CLAUDE.md, the Stripe products and prices
// are created in the Stripe dashboard by Amir, not programmatically. This
// module reads the resulting price IDs from environment variables.
//
// Required env vars (set in Vercel + .env.local):
//   STRIPE_SECRET_KEY                          sk_...
//   STRIPE_WEBHOOK_SECRET                      whsec_...
//   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY         pk_... (currently unused; reserved)
//   STRIPE_PRICE_STARTER_MONTHLY               price_...
//   STRIPE_PRICE_STARTER_ANNUAL                price_...
//   STRIPE_PRICE_STANDARD_MONTHLY              price_...
//   STRIPE_PRICE_STANDARD_ANNUAL               price_...
//   STRIPE_PRICE_PRO_MONTHLY                   price_...
//   STRIPE_PRICE_PRO_ANNUAL                    price_...
//   STRIPE_PRICE_SPRINT                        price_... (one-time $29)
//   STRIPE_PRICE_INTERVIEW_WEEK                price_... (one-time $19)
//   STRIPE_PRICE_NEGOTIATION_PACK              price_... (one-time $19)
//   STRIPE_PRICE_FOUNDING_LIFETIME             price_... (one-time $89, capped)

import Stripe from "stripe";
import type { SubscriptionPlan, BillingCycle, AddonKey } from "@/services/billing/types";

let _client: Stripe | null = null;

/**
 * Lazily-initialised Stripe client. Throws if STRIPE_SECRET_KEY is missing.
 * Routes call this only when monetization is enabled, so the module can be
 * imported even before keys are wired.
 */
export function getStripe(): Stripe {
  if (_client) return _client;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  _client = new Stripe(key, {
    apiVersion: "2025-09-30.clover",
    typescript: true,
  });
  return _client;
}

interface ResolveOpts {
  plan?: Exclude<SubscriptionPlan, "free">;
  cycle?: BillingCycle;
  addon?: AddonKey;
}

/**
 * Resolves a Stripe price ID from a plan+cycle pair OR an addon key.
 * Returns null when the corresponding env var is unset (e.g. Stripe is
 * provisioned but a particular price hasn't been created yet).
 */
export function resolvePriceId(opts: ResolveOpts): string | null {
  if (opts.addon) {
    const map: Record<AddonKey, string | undefined> = {
      sprint:            process.env.STRIPE_PRICE_SPRINT,
      interview_week:    process.env.STRIPE_PRICE_INTERVIEW_WEEK,
      negotiation_pack:  process.env.STRIPE_PRICE_NEGOTIATION_PACK,
      founding_lifetime: process.env.STRIPE_PRICE_FOUNDING_LIFETIME,
    };
    return map[opts.addon] ?? null;
  }
  if (opts.plan && opts.cycle) {
    const key = `STRIPE_PRICE_${opts.plan.toUpperCase()}_${opts.cycle.toUpperCase()}`;
    return process.env[key] ?? null;
  }
  return null;
}

/**
 * Reverse-lookup: given a price ID, return the plan tier the user just
 * purchased. Used by the webhook to populate user_subscriptions.plan.
 * Founding Lifetime maps to 'pro' (it's pro-for-life).
 */
export function planFromPriceId(priceId: string): {
  plan: SubscriptionPlan;
  cycle: BillingCycle | null;
  addon: AddonKey | null;
} | null {
  const map: Array<[string | undefined, SubscriptionPlan, BillingCycle | null, AddonKey | null]> = [
    [process.env.STRIPE_PRICE_STARTER_MONTHLY,    "starter",  "monthly", null],
    [process.env.STRIPE_PRICE_STARTER_ANNUAL,     "starter",  "annual",  null],
    [process.env.STRIPE_PRICE_STANDARD_MONTHLY,   "standard", "monthly", null],
    [process.env.STRIPE_PRICE_STANDARD_ANNUAL,    "standard", "annual",  null],
    [process.env.STRIPE_PRICE_PRO_MONTHLY,        "pro",      "monthly", null],
    [process.env.STRIPE_PRICE_PRO_ANNUAL,         "pro",      "annual",  null],
    [process.env.STRIPE_PRICE_FOUNDING_LIFETIME,  "pro",      null,      "founding_lifetime"],
  ];
  for (const [envVal, plan, cycle, addon] of map) {
    if (envVal && envVal === priceId) return { plan, cycle, addon };
  }
  return null;
}

/**
 * Detect the current 'founding_seats_remaining' value. Returns 0 when the
 * row is missing (treated as sold-out fail-closed).
 */
export function isFoundingPriceId(priceId: string): boolean {
  const founding = process.env.STRIPE_PRICE_FOUNDING_LIFETIME;
  return Boolean(founding && founding === priceId);
}
