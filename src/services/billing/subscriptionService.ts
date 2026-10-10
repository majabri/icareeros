import { createClient } from "@/lib/supabase";
import type {
  UserSubscription,
  SubscriptionPlan,
  SubscriptionStatus,
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

  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL ??
    (typeof window !== "undefined" ? window.location.origin : "");
  const successUrl = opts.successUrl ?? `${baseUrl}/settings/billing?status=success`;
  const cancelUrl  = opts.cancelUrl  ?? `${baseUrl}/settings/billing?status=canceled`;

  // 2026-05-14 — price resolution moved server-side so we don't need a
  // duplicate NEXT_PUBLIC_STRIPE_PRICE_* env var per tier in Vercel. The
  // server reads STRIPE_PRICE_<TIER>_<CYCLE> / STRIPE_PRICE_<ADDON> from
  // its env and looks them up via resolvePriceId() in src/lib/stripe.ts.
  // Client just sends the semantic intent.
  const payload: Record<string, unknown> = { successUrl, cancelUrl };
  if (opts.addon) {
    payload.addon = opts.addon;
  } else if (opts.plan && opts.cycle) {
    payload.plan  = opts.plan;
    payload.cycle = opts.cycle;
  } else {
    return null;
  }

  const res = await fetch("/api/stripe/checkout", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(payload),
  });
  if (!res.ok) {
    console.error("createCheckoutSession error:", res.status, await res.text());
    return null;
  }
  const json = (await res.json()) as { checkoutUrl?: string };
  return json.checkoutUrl ?? null;
}

/**
 * Static lookup table for plan+cycle price IDs.
 *
 * IMPORTANT: Next.js only inlines `NEXT_PUBLIC_*` env vars at build time when
 * they are referenced as DIRECT property accesses (`process.env.NEXT_PUBLIC_X`).
 * Dynamic computed-property access (`process.env[key]`) silently returns
 * `undefined` in the client bundle even when the env var is set in Vercel —
 * because the static analyzer doesn't see the literal var name and never
 * substitutes the value.
 *
 * This map enumerates every combination so each access is direct, which is
 * what Next.js needs.
 */


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

// #451/#450 — statuses the client treats as "still has their plan's access".
// Mirrors checkPlanLimit's activeStatuses on the server: past_due is a grace
// signal (Stripe's own retry schedule), not a downgrade, so the UI must not
// show a paid user as Free the moment one renewal attempt fails while the
// server is still granting them access. Only canceled/unpaid/paused mean the
// subscription has actually ended.
const CLIENT_ACTIVE_STATUSES: ReadonlySet<SubscriptionStatus> = new Set(["active", "trialing", "past_due"]);

function isEffectivelyPaid(sub: UserSubscription | null): boolean {
  if (!sub || sub.plan === "free") return false;
  return CLIENT_ACTIVE_STATUSES.has(sub.status);
}

/**
 * Returns whether the current user can access a gated feature. Computed
 * client-side from PLAN_LIMITS; the route handlers do their own server-side
 * enforcement via checkPlanLimit. This is advisory only (a 402 from the
 * server is still possible) — see #450 for the fuller gap between what
 * PLAN_LIMITS declares and what routes actually enforce.
 */
export async function canAccessFeature(_featureKey: FeatureKey): Promise<boolean> {
  if (!isMonetizationEnabled()) return true;
  const sub = await getSubscription();
  return isEffectivelyPaid(sub);
}

export async function getCurrentPlan(): Promise<SubscriptionPlan> {
  const sub = await getSubscription();
  // #451 — a canceled/unpaid row's `plan` column can still say "starter" or
  // "pro" between the terminal Stripe event landing and this read; treat it
  // as free for display once status says the subscription has ended.
  if (sub && !CLIENT_ACTIVE_STATUSES.has(sub.status)) return "free";
  return sub?.plan ?? "free";
}

export async function isOnPaidPlan(): Promise<boolean> {
  const sub = await getSubscription();
  return isEffectivelyPaid(sub);
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
