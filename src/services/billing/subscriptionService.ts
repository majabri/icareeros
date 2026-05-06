import { createClient } from "@/lib/supabase";
import type {
  UserSubscription,
  SubscriptionPlan,
  FeatureKey,
} from "./types";

/**
 * Master switch — when monetization is not yet enabled, every billing-service
 * call short-circuits to a safe default. Set NEXT_PUBLIC_MONETIZATION_ENABLED
 * to "true" in Vercel when products are live.
 *
 * Why guard at the call site instead of deploying a stub edge function:
 *   - The `billing-service` edge function does not exist in the icareeros
 *     Supabase project (kuneabeiwcxavvyyfjkx). It exists in the legacy
 *     azjobs project, which is paused and reference-only per CLAUDE.md.
 *   - Without this guard, every page load that reads the user's plan
 *     (dashboard, settings/billing) generates an OPTIONS + 404 against
 *     the missing function — ~100/hour in Supabase logs as of 2026-05-06.
 *   - Guarding at the client avoids a network round-trip entirely until
 *     monetization ships, and aligns with the existing convention in
 *     BillingSettings.tsx (which already reads this same env var).
 */
function isMonetizationEnabled(): boolean {
  return process.env.NEXT_PUBLIC_MONETIZATION_ENABLED === "true";
}

/**
 * Get the current user's subscription.
 * Falls back to Free if no subscription row exists.
 */
export async function getSubscription(): Promise<UserSubscription | null> {
  if (!isMonetizationEnabled()) return null;
  const supabase = createClient();
  const { data, error } = await supabase.functions.invoke<{
    success: boolean;
    data?: UserSubscription;
    error?: string;
  }>("billing-service", { body: { action: "get_subscription" } });

  if (error || !data?.success) {
    console.error("getSubscription error:", error ?? data?.error);
    return null;
  }
  return data.data ?? null;
}

/**
 * Create a Stripe Checkout session URL for upgrading to pro or premium.
 * Returns null if monetization is not yet configured.
 */
export async function createCheckoutSession(
  plan: "premium" | "professional"
): Promise<string | null> {
  if (!isMonetizationEnabled()) return null;
  const supabase = createClient();
  const { data, error } = await supabase.functions.invoke<{
    success: boolean;
    url?: string;
    error?: string;
  }>("billing-service", { body: { action: "create_checkout", plan } });

  if (error || !data?.success) {
    console.error("createCheckoutSession error:", error ?? data?.error);
    return null;
  }
  return data.url ?? null;
}

/**
 * Open the Stripe Billing Portal for managing an existing subscription.
 */
export async function getBillingPortalUrl(): Promise<string | null> {
  if (!isMonetizationEnabled()) return null;
  const supabase = createClient();
  const { data, error } = await supabase.functions.invoke<{
    success: boolean;
    url?: string;
    error?: string;
  }>("billing-service", { body: { action: "get_portal" } });

  if (error || !data?.success) {
    console.error("getBillingPortalUrl error:", error ?? data?.error);
    return null;
  }
  return data.url ?? null;
}

/**
 * Cancel subscription at current period end.
 */
export async function cancelSubscription(): Promise<boolean> {
  if (!isMonetizationEnabled()) return false;
  const supabase = createClient();
  const { data, error } = await supabase.functions.invoke<{
    success: boolean;
    error?: string;
  }>("billing-service", { body: { action: "cancel_subscription" } });

  if (error || !data?.success) {
    console.error("cancelSubscription error:", error ?? data?.error);
    return false;
  }
  return true;
}

/**
 * Check if the current user can access a gated feature.
 * 
 * When monetization_enabled = false in feature_flags, this ALWAYS returns true.
 * This is the master switch — flip it in Supabase when ready to charge.
 */
export async function canAccessFeature(featureKey: FeatureKey): Promise<boolean> {
  if (!isMonetizationEnabled()) return true;
  const supabase = createClient();
  const { data, error } = await supabase.functions.invoke<{
    success: boolean;
    allowed: boolean;
    reason?: string;
  }>("billing-service", {
    body: { action: "can_access_feature", feature_key: featureKey },
  });

  if (error || !data?.success) {
    // Fail open — don't block users if billing service is down
    console.warn("canAccessFeature error (failing open):", error ?? (data as Record<string, unknown>)?.error);
    return true;
  }
  return data.allowed;
}

/**
 * Convenience: get current plan name for UI display.
 */
export async function getCurrentPlan(): Promise<SubscriptionPlan> {
  const sub = await getSubscription();
  return sub?.plan ?? "free";
}

/**
 * Convenience: is user on a paid plan?
 */
export async function isOnPaidPlan(): Promise<boolean> {
  const plan = await getCurrentPlan();
  return plan !== "free";
}
