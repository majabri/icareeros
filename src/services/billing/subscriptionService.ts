import { createClient } from "@/lib/supabase";
import type {
  UserSubscription,
  SubscriptionPlan,
  BillingCycle,
  AddonKey,
  FeatureKey,
} from "./types";

/**
 * Master switch — when monetization is not yet enabled, every billing-service
 * call short-circuits to a safe default. Set NEXT_PUBLIC_MONETIZATION_ENABLED
 * to "true" in Vercel when products are live.
 *
 * Phase 5 (2026-05-07) — replaced the legacy `billing-service` Supabase edge
 * function (which never existed in `kuneabeiwcxavvyyfjkx`) with direct fetch
 * to the new Next.js routes under /api/stripe/*. The edge function lived in
 * the paused legacy azjobs project, which is reference-only per CLAUDE.md.
 */
function isMonetizationEnabled(): boolean {
  return process.env.NEXT_PUBLIC_MONETIZATION_ENABLED === "true";
}

/**
 * Get the current user's subscription. Reads directly from Supabase via the
 * client — no edge function, no extra round trip.
 */
export async function getSubscription(): Promise<UserSubscription | null> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from("user_subscriptions")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) {
    console.error("getSubscription error:", error);
    return null;
  }
  return (data as UserSubscription | null) ?? null;
}

export interface CreateCheckoutOpts {
  plan?:  Exclude<SubscriptionPlan, "free">;
  cycle?: BillingCycle;
  addon?: AddonKey;
  successUrl?: string;
  cancelUrl?:  string;
}

/**
 * Resolve a price id and create a Stripe Checkout session. The price id is
 * computed client-side via the env-var convention so we don't have to ship a
 * server roundtrip just to look up a string.
 */
export async function createCheckoutSession(
  opts: CreateCheckoutOpts,
): Promise<string | null> {
  if (!isMonetizationEnabled()) return null;

  // Read NEXT_PUBLIC_-prefixed price ids; only public ones can be exposed
  // to the browser. STRIPE_PRICE_* (no NEXT_PUBLIC_) are server-only.
  const priceId = resolvePublicPriceId(opts);
  if (!priceId) return null;

  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL ??
    (typeof window !== "undefined" ? window.location.origin : "");
  const successUrl = opts.successUrl ?? `${baseUrl}/settings/billing?status=success`;
  const cancelUrl  = opts.cancelUrl  ?? `${baseUrl}/settings/billing?status=canceled`;
  const mode: "subscription" | "payment" = opts.addon ? "payment" : "subscription";

  const res = await fetch("/api/stripe/checkout", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ priceId, mode, successUrl, cancelUrl }),
  });
  if (!res.ok) {
    console.error("createCheckoutSession error:", res.status, await res.text());
    return null;
  }
  const json = (await res.json()) as { checkoutUrl?: string };
  return json.checkoutUrl ?? null;
}

function resolvePublicPriceId(opts: CreateCheckoutOpts): string | null {
  if (opts.addon) {
    const map: Record<AddonKey, string | undefined> = {
      sprint:            process.env.NEXT_PUBLIC_STRIPE_PRICE_SPRINT,
      interview_week:    process.env.NEXT_PUBLIC_STRIPE_PRICE_INTERVIEW_WEEK,
      negotiation_pack:  process.env.NEXT_PUBLIC_STRIPE_PRICE_NEGOTIATION_PACK,
      founding_lifetime: process.env.NEXT_PUBLIC_STRIPE_PRICE_FOUNDING_LIFETIME,
    };
    return map[opts.addon] ?? null;
  }
  if (opts.plan && opts.cycle) {
    const key = `NEXT_PUBLIC_STRIPE_PRICE_${opts.plan.toUpperCase()}_${opts.cycle.toUpperCase()}`;
    return process.env[key] ?? null;
  }
  return null;
}

/**
 * Open the Stripe Customer Portal.
 */
export async function getBillingPortalUrl(): Promise<string | null> {
  if (!isMonetizationEnabled()) return null;
  const res = await fetch("/api/stripe/portal", { method: "GET" });
  if (!res.ok) {
    console.error("getBillingPortalUrl error:", res.status, await res.text());
    return null;
  }
  const json = (await res.json()) as { portalUrl?: string };
  return json.portalUrl ?? null;
}

/**
 * Cancel the current subscription. Goes via the Customer Portal so we don't
 * own cancel-at-period-end logic ourselves.
 */
export async function cancelSubscription(): Promise<boolean> {
  // Direct cancellation is portal-driven now. Return true to mean
  // "the portal exists and cancel can be initiated there"; the actual cancel
  // happens after the user clicks through.
  const url = await getBillingPortalUrl();
  if (url) {
    if (typeof window !== "undefined") window.location.href = url;
    return true;
  }
  return false;
}

/**
 * Returns whether the current user can access a gated feature. Computed
 * client-side from PLAN_LIMITS; the route handlers do their own server-side
 * enforcement via checkPlanLimit.
 */
export async function canAccessFeature(_featureKey: FeatureKey): Promise<boolean> {
  if (!isMonetizationEnabled()) return true;
  const sub = await getSubscription();
  return sub?.plan != null && sub.plan !== "free";
}

export async function getCurrentPlan(): Promise<SubscriptionPlan> {
  const sub = await getSubscription();
  return sub?.plan ?? "free";
}

export async function isOnPaidPlan(): Promise<boolean> {
  const plan = await getCurrentPlan();
  return plan !== "free";
}

/**
 * Read the founding-lifetime seat counter for marketing UI.
 */
export async function getFoundingStatus(): Promise<{ available: boolean; seatsRemaining: number }> {
  try {
    const res = await fetch("/api/stripe/founding-status");
    if (!res.ok) return { available: false, seatsRemaining: 0 };
    return (await res.json()) as { available: boolean; seatsRemaining: number };
  } catch {
    return { available: false, seatsRemaining: 0 };
  }
}
