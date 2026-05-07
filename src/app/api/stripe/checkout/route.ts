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
import { cookies } from "next/headers";
import { getStripe, isFoundingPriceId } from "@/lib/stripe";

async function makeSupabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
          try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); }
          catch { /* server component context */ }
        },
      },
    },
  );
}

interface Body {
  priceId: string;
  mode: "subscription" | "payment";
  successUrl: string;
  cancelUrl: string;
}

function isValidBody(b: unknown): b is Body {
  if (!b || typeof b !== "object") return false;
  const o = b as Record<string, unknown>;
  return (
    typeof o.priceId === "string" && o.priceId.length > 0 &&
    (o.mode === "subscription" || o.mode === "payment") &&
    typeof o.successUrl === "string" && o.successUrl.length > 0 &&
    typeof o.cancelUrl  === "string" && o.cancelUrl.length  > 0
  );
}

export async function POST(req: Request) {
  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "invalid_body" }, { status: 400 }); }
  if (!isValidBody(body)) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

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
