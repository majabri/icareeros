/**
 * iCareerOS — Billing Service (Subscription Management)
 * Deno Edge Function
 *
 * Handles: Free/Pro/Premium subscription lifecycle via Stripe
 * Paywall: controlled by feature_flag `monetization_enabled` (default: false)
 *
 * Actions:
 *   get_subscription      — current plan + status for authenticated user
 *   create_checkout       — Stripe Checkout session for plan upgrade
 *   cancel_subscription   — cancel at period end
 *   get_portal            — Stripe Billing Portal session
 *   handle_webhook        — Stripe webhook (subscription events)
 *   can_access_feature    — paywall gate check (respects monetization flag)
 *   health_ping
 */

import { serve } from "https://deno.land/std@0.195.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

// ── Env ────────────────────────────────────────────────────────────────────
const SUPABASE_URL              = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY         = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const STRIPE_SECRET_KEY         = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const STRIPE_WEBHOOK_SECRET     = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
const APP_URL                   = Deno.env.get("APP_URL") ?? "https://icareeros.com";

// ── Stripe Price IDs (set via env when monetization is enabled) ────────────
// These are populated after running scripts/stripe-setup.ts
const STRIPE_PRICE_PRO     = Deno.env.get("STRIPE_PRICE_PRO") ?? "";
const STRIPE_PRICE_PREMIUM = Deno.env.get("STRIPE_PRICE_PREMIUM") ?? "";

// ── Plan feature gates ─────────────────────────────────────────────────────
// Maps feature key → minimum plan required
const PLAN_GATES: Record<string, string[]> = {
  feature_ai_coach:         ["pro", "premium"],
  feature_advanced_match:   ["pro", "premium"],
  feature_unlimited_cycles: ["pro", "premium"],
};

const PLAN_ORDER = ["free", "pro", "premium"];

// ── Types ──────────────────────────────────────────────────────────────────
interface Subscription {
  id: string;
  user_id: string;
  plan: "free" | "pro" | "premium";
  status: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
}

// ── Stripe helper ──────────────────────────────────────────────────────────
async function stripeRequest(
  method: string,
  path: string,
  body?: Record<string, string | number | boolean>
): Promise<Record<string, unknown>> {
  const url = `https://api.stripe.com/v1${path}`;
  const opts: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
  };
  if (body) {
    opts.body = new URLSearchParams(
      Object.entries(body).map(([k, v]) => [k, String(v)])
    ).toString();
  }
  const res = await fetch(url, opts);
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const err = (data as any).error?.message ?? "Stripe error";
    throw new Error(err);
  }
  return data;
}

// ── Auth helper ────────────────────────────────────────────────────────────
function userIdFromAuth(authHeader: string): string | null {
  try {
    const token = authHeader.replace("Bearer ", "");
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

// ── Action handlers ────────────────────────────────────────────────────────

async function getSubscription(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<{ success: boolean; data?: Subscription; error?: string }> {
  const { data, error } = await supabase
    .from("user_subscriptions")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) return { success: false, error: error.message };

  // Auto-provision Free if somehow missing (belt-and-suspenders)
  if (!data) {
    const { data: inserted, error: insertErr } = await supabase
      .from("user_subscriptions")
      .insert({ user_id: userId, plan: "free", status: "active" })
      .select()
      .single();
    if (insertErr) return { success: false, error: insertErr.message };
    return { success: true, data: inserted as Subscription };
  }

  return { success: true, data: data as Subscription };
}

async function createCheckout(
  supabase: ReturnType<typeof createClient>,
  adminSupabase: ReturnType<typeof createClient>,
  userId: string,
  plan: "pro" | "premium"
): Promise<{ success: boolean; url?: string; error?: string }> {
  const priceId = plan === "pro" ? STRIPE_PRICE_PRO : STRIPE_PRICE_PREMIUM;
  if (!priceId) {
    return {
      success: false,
      error: `Stripe price ID for ${plan} not configured. Set STRIPE_PRICE_${plan.toUpperCase()} env var.`,
    };
  }
  if (!STRIPE_SECRET_KEY) {
    return { success: false, error: "Stripe not configured." };
  }

  // Get or create Stripe customer
  const { data: sub } = await supabase
    .from("user_subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .maybeSingle();

  let customerId = (sub as any)?.stripe_customer_id ?? null;

  if (!customerId) {
    // Fetch user email from profiles
    const { data: profile } = await supabase
      .from("profiles")
      .select("email, full_name")
      .eq("id", userId)
      .maybeSingle();

    const customer = await stripeRequest("POST", "/customers", {
      email: (profile as any)?.email ?? "",
      name:  (profile as any)?.full_name ?? "",
      metadata: { user_id: userId },
    });
    customerId = customer.id as string;

    // Save customer ID
    await adminSupabase
      .from("user_subscriptions")
      .update({ stripe_customer_id: customerId, updated_at: new Date().toISOString() })
      .eq("user_id", userId);
  }

  const session = await stripeRequest("POST", "/checkout/sessions", {
    mode:                "subscription",
    customer:            customerId,
    "line_items[0][price]":    priceId,
    "line_items[0][quantity]": 1,
    success_url: `${APP_URL}/settings/billing?upgraded=1`,
    cancel_url:  `${APP_URL}/settings/billing?canceled=1`,
    "metadata[user_id]": userId,
    "metadata[plan]":    plan,
  });

  return { success: true, url: session.url as string };
}

async function getPortal(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<{ success: boolean; url?: string; error?: string }> {
  const { data: sub } = await supabase
    .from("user_subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .maybeSingle();

  const customerId = (sub as any)?.stripe_customer_id;
  if (!customerId) {
    return { success: false, error: "No Stripe customer linked. Upgrade to a paid plan first." };
  }

  const session = await stripeRequest("POST", "/billing_portal/sessions", {
    customer:   customerId,
    return_url: `${APP_URL}/settings/billing`,
  });

  return { success: true, url: session.url as string };
}

async function cancelSubscription(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  const { data: sub } = await supabase
    .from("user_subscriptions")
    .select("stripe_subscription_id")
    .eq("user_id", userId)
    .maybeSingle();

  const subId = (sub as any)?.stripe_subscription_id;
  if (!subId) return { success: false, error: "No active subscription to cancel." };

  await stripeRequest("POST", `/subscriptions/${subId}`, {
    cancel_at_period_end: true,
  });

  await supabase
    .from("user_subscriptions")
    .update({ cancel_at_period_end: true, updated_at: new Date().toISOString() })
    .eq("user_id", userId);

  return { success: true };
}

async function handleWebhook(
  adminSupabase: ReturnType<typeof createClient>,
  stripeEventId: string,
  eventType: string,
  payload: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  // Idempotency check
  const { data: existing } = await adminSupabase
    .from("subscription_events")
    .select("id, processed")
    .eq("stripe_event_id", stripeEventId)
    .maybeSingle();

  if ((existing as any)?.processed) return { success: true }; // already handled

  // Log event
  const obj = (payload.data as any)?.object ?? {};

  // Resolve user_id from customer metadata or subscription metadata
  let userId: string | null =
    (obj.metadata as any)?.user_id ??
    (payload.metadata as any)?.user_id ?? null;

  if (!userId && obj.customer) {
    const { data: sub } = await adminSupabase
      .from("user_subscriptions")
      .select("user_id")
      .eq("stripe_customer_id", obj.customer)
      .maybeSingle();
    userId = (sub as any)?.user_id ?? null;
  }

  // Upsert event log
  await adminSupabase.from("subscription_events").upsert({
    stripe_event_id: stripeEventId,
    user_id:         userId,
    event_type:      eventType,
    payload:         payload,
    processed:       false,
  }, { onConflict: "stripe_event_id" });

  // Apply subscription state changes
  try {
    switch (eventType) {
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const plan = mapPriceIdToPlan(obj.items?.data?.[0]?.price?.id ?? "");
        if (userId && plan) {
          await adminSupabase.from("user_subscriptions").update({
            plan,
            status:                obj.status,
            stripe_subscription_id: obj.id,
            stripe_price_id:        obj.items?.data?.[0]?.price?.id ?? null,
            current_period_start:   obj.current_period_start
              ? new Date(obj.current_period_start * 1000).toISOString() : null,
            current_period_end:     obj.current_period_end
              ? new Date(obj.current_period_end * 1000).toISOString() : null,
            cancel_at_period_end:   obj.cancel_at_period_end ?? false,
            updated_at: new Date().toISOString(),
          }).eq("user_id", userId);
        }
        break;
      }

      case "customer.subscription.deleted": {
        if (userId) {
          await adminSupabase.from("user_subscriptions").update({
            plan:                   "free",
            status:                 "canceled",
            stripe_subscription_id: null,
            stripe_price_id:        null,
            cancel_at_period_end:   false,
            current_period_end:     null,
            updated_at: new Date().toISOString(),
          }).eq("user_id", userId);
        }
        break;
      }

      case "invoice.payment_failed": {
        if (userId) {
          await adminSupabase.from("user_subscriptions").update({
            status:     "past_due",
            updated_at: new Date().toISOString(),
          }).eq("user_id", userId);
        }
        break;
      }
    }

    // Mark event processed
    await adminSupabase.from("subscription_events")
      .update({ processed: true, processed_at: new Date().toISOString() })
      .eq("stripe_event_id", stripeEventId);

    return { success: true };
  } catch (err) {
    await adminSupabase.from("subscription_events")
      .update({ error: err instanceof Error ? err.message : String(err) })
      .eq("stripe_event_id", stripeEventId);
    return { success: false, error: err instanceof Error ? err.message : "Webhook processing failed" };
  }
}

async function canAccessFeature(
  adminSupabase: ReturnType<typeof createClient>,
  userId: string | null,
  featureKey: string
): Promise<{ success: boolean; allowed: boolean; reason?: string }> {
  // 1. Check master monetization flag
  const { data: flag } = await adminSupabase
    .from("feature_flags")
    .select("enabled")
    .eq("key", "monetization_enabled")
    .maybeSingle();

  if (!(flag as any)?.enabled) {
    // Monetization OFF — everyone gets full access
    return { success: true, allowed: true, reason: "monetization_disabled" };
  }

  if (!userId) return { success: true, allowed: false, reason: "unauthenticated" };

  // 2. Get user plan
  const { data: sub } = await adminSupabase
    .from("user_subscriptions")
    .select("plan, status")
    .eq("user_id", userId)
    .maybeSingle();

  const plan = (sub as any)?.plan ?? "free";
  const status = (sub as any)?.status ?? "active";
  const isActive = ["active", "trialing"].includes(status);

  // 3. Check gate
  const requiredPlans = PLAN_GATES[featureKey];
  if (!requiredPlans) {
    // Unknown feature key — default allow
    return { success: true, allowed: true, reason: "unknown_feature" };
  }

  const planIndex = PLAN_ORDER.indexOf(plan);
  const allowed = isActive && requiredPlans.some((p) => PLAN_ORDER.indexOf(p) <= planIndex);

  return {
    success: true,
    allowed,
    reason: allowed ? undefined : `requires_${requiredPlans[0]}`,
  };
}

function mapPriceIdToPlan(priceId: string): "pro" | "premium" | null {
  if (priceId === STRIPE_PRICE_PRO)     return "pro";
  if (priceId === STRIPE_PRICE_PREMIUM) return "premium";
  return null;
}

// ── Main handler ───────────────────────────────────────────────────────────
serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin":  "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const userId     = userIdFromAuth(authHeader);

  const userSupabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const adminSupabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const body = await req.json() as Record<string, unknown>;
    const action = body.action as string;

    if (action === "health_ping") {
      return json({ status: "healthy", timestamp: new Date().toISOString() });
    }

    // Webhook doesn't require user auth
    if (action === "handle_webhook") {
      const result = await handleWebhook(
        adminSupabase,
        body.stripe_event_id as string,
        body.event_type as string,
        body.payload as Record<string, unknown>
      );
      return json(result, result.success ? 200 : 500);
    }

    if (action === "can_access_feature") {
      const result = await canAccessFeature(
        adminSupabase,
        userId,
        body.feature_key as string
      );
      return json(result);
    }

    // All remaining actions require auth
    if (!userId) return json({ success: false, error: "Unauthorized" }, 401);

    switch (action) {
      case "get_subscription":
        return json(await getSubscription(userSupabase, userId));

      case "create_checkout":
        return json(await createCheckout(
          userSupabase,
          adminSupabase,
          userId,
          body.plan as "pro" | "premium"
        ));

      case "get_portal":
        return json(await getPortal(userSupabase, userId));

      case "cancel_subscription":
        return json(await cancelSubscription(userSupabase, userId));

      default:
        return json({ success: false, error: `Unknown action: ${action}` }, 400);
    }
  } catch (err) {
    console.error("billing-service error:", err);
    return json({
      success: false,
      error: err instanceof Error ? err.message : "Internal server error",
    }, 500);
  }
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
