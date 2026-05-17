/**
 * POST /api/stripe/checkout
 *
 * Creates a Stripe Checkout session for a subscription tier or one-time addon.
 * Server-side only. STRIPE_SECRET_KEY never reaches the client.
 *
 * Body:
 *   { priceId: string,
 *     mode: "subscription" | "payment",
 *     successUrl: string,
 *     cancelUrl: string }
 *
 * Responses:
 *   200 { checkoutUrl }
 *   401 { error: "unauthorized" }
 *   400 { error: "invalid_body" }
 *   410 { error: "sold_out" }   -- founding_lifetime: seats remaining = 0
 *   500 { error: "stripe_error", message }
 */

import { NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { withCrossSubdomainCookie } from "@/lib/supabase-cookie-options";
import { cookies } from "next/headers";
import { getStripe, isFoundingPriceId, resolvePriceId } from "@/lib/stripe";
import { RECURRING_ADDONS } from "@/services/billing/types";
import type { SubscriptionPlan, BillingCycle, AddonKey } from "@/services/billing/types";

async function makeSupabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
          try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, withCrossSubdomainCookie(options))); }
          catch { /* server component context */ }
        },
      },
    },
  );
}

/**
 * The client previously sent a fully-resolved `priceId`. That required the
 * NEXT_PUBLIC_STRIPE_PRICE_* env vars to be duplicated alongside the
 * server-side STRIPE_PRICE_* ones — easy to forget when wiring Vercel.
 *
 * The route now accepts EITHER shape:
 *   • Legacy: `{ priceId, mode, successUrl, cancelUrl }` (still works for any
 *     server-side caller that already has a priceId in hand).
 *   • Plan:   `{ plan: "starter" | "standard" | "pro", cycle: "monthly" | "annual",
 *               successUrl, cancelUrl }` — server resolves to the matching
 *     STRIPE_PRICE_<TIER>_<CYCLE> env var. mode is always 'subscription'.
 *   • Addon:  `{ addon: "sprint" | "interview_pack" | "negotiation_pack" |
 *                       "founding_lifetime",
 *               successUrl, cancelUrl }` — server resolves to STRIPE_PRICE_<NAME>
 *     and infers mode (subscription for RECURRING_ADDONS, payment otherwise).
 */
interface Body {
  priceId:     string;
  mode:        "subscription" | "payment";
  successUrl:  string;
  cancelUrl:   string;
}

interface PlanBody {
  plan:        Exclude<SubscriptionPlan, "free">;
  cycle:       BillingCycle;
  successUrl:  string;
  cancelUrl:   string;
}

interface AddonBody {
  addon:       AddonKey;
  successUrl:  string;
  cancelUrl:   string;
}

function hasUrlsRaw(o: Record<string, unknown>): boolean {
  return typeof o.successUrl === "string" && o.successUrl.length > 0 &&
         typeof o.cancelUrl  === "string" && o.cancelUrl.length  > 0;
}

function isPriceIdBody(b: Record<string, unknown>): b is Body & Record<string, unknown> {
  return typeof b.priceId === "string" && b.priceId.length > 0 &&
         (b.mode === "subscription" || b.mode === "payment") &&
         hasUrlsRaw(b);
}

function isPlanBody(b: Record<string, unknown>): b is PlanBody & Record<string, unknown> {
  if (typeof b.plan !== "string" || typeof b.cycle !== "string") return false;
  const planOk  = b.plan === "starter" || b.plan === "standard" || b.plan === "pro";
  const cycleOk = b.cycle === "monthly" || b.cycle === "annual";
  return planOk && cycleOk && hasUrlsRaw(b);
}

function isAddonBody(b: Record<string, unknown>): b is AddonBody & Record<string, unknown> {
  if (typeof b.addon !== "string") return false;
  const ok = b.addon === "sprint" || b.addon === "interview_pack" ||
             b.addon === "negotiation_pack" || b.addon === "founding_lifetime";
  return ok && hasUrlsRaw(b);
}

/**
 * Normalise any of the three accepted body shapes into the trio the route
 * needs: a fully-resolved priceId + mode + the two redirect URLs. Returns
 * a 400-style error string if the body is malformed OR if the requested
 * plan/addon's price env var isn't set on the server.
 */
function resolveCheckoutInputs(
  raw: unknown,
): { priceId: string; mode: "subscription" | "payment"; successUrl: string; cancelUrl: string }
  | { error: string; status: 400 | 422 } {
  if (!raw || typeof raw !== "object") return { error: "invalid_body", status: 400 };
  const b = raw as Record<string, unknown>;

  if (isPriceIdBody(b)) {
    return {
      priceId:    b.priceId,
      mode:       b.mode,
      successUrl: b.successUrl,
      cancelUrl:  b.cancelUrl,
    };
  }

  if (isPlanBody(b)) {
    const priceId = resolvePriceId({ plan: b.plan, cycle: b.cycle });
    if (!priceId) return { error: "price_not_configured", status: 422 };
    return { priceId, mode: "subscription", successUrl: b.successUrl, cancelUrl: b.cancelUrl };
  }

  if (isAddonBody(b)) {
    const priceId = resolvePriceId({ addon: b.addon });
    if (!priceId) return { error: "price_not_configured", status: 422 };
    const mode: "subscription" | "payment" =
      RECURRING_ADDONS.has(b.addon) ? "subscription" : "payment";
    return { priceId, mode, successUrl: b.successUrl, cancelUrl: b.cancelUrl };
  }

  return { error: "invalid_body", status: 400 };
}

export async function POST(req: Request) {
  let raw: unknown;
  try { raw = await req.json(); }
  catch { return NextResponse.json({ error: "invalid_body" }, { status: 400 }); }

  const resolved = resolveCheckoutInputs(raw);
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  // From here on, `body` is the fully-resolved priceId/mode shape used below.
  const body = resolved;

  const supabase = await makeSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Founding Lifetime pre-flight: hard 410 if seats sold out.
  if (isFoundingPriceId(body.priceId)) {
    const { data: flag } = await supabase
      .from("feature_flags")
      .select("value, enabled")
      .eq("key", "founding_seats_remaining")
      .maybeSingle();
    const seats = (flag?.value as number | null) ?? 0;
    if (!flag?.enabled || seats <= 0) {
      return NextResponse.json({ error: "sold_out" }, { status: 410 });
    }
  }

  // Reuse or create the user's Stripe customer and persist the id.
  const { data: existing } = await supabase
    .from("user_subscriptions")
    .select("stripe_customer_id, plan, status")
    .eq("user_id", user.id)
    .maybeSingle();

  const stripe = getStripe();

  let customerId = existing?.stripe_customer_id ?? null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      metadata: { user_id: user.id },
    });
    customerId = customer.id;
    // Upsert the subscription row so we have somewhere to store the customer id.
    await supabase.from("user_subscriptions").upsert(
      {
        user_id: user.id,
        plan: existing?.plan ?? "free",
        status: existing?.status ?? "active",
        stripe_customer_id: customerId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: body.mode,
      customer: customerId,
      client_reference_id: user.id,
      line_items: [{ price: body.priceId, quantity: 1 }],
      success_url: body.successUrl,
      cancel_url:  body.cancelUrl,
      metadata: {
        user_id:  user.id,
        price_id: body.priceId,
      },
      // Subscription-specific knobs are no-ops in payment mode.
      allow_promotion_codes: true,
    });
    return NextResponse.json({ checkoutUrl: session.url }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "stripe_error";
    return NextResponse.json(
      { error: "stripe_error", message },
      { status: 500 },
    );
  }
}
