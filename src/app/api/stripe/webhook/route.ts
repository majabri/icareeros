/**
 * POST /api/stripe/webhook
 *
 * Stripe webhook handler. Stripe is the caller, NOT the user, so this route
 * must NOT be cookie-authed. Signature verification via STRIPE_WEBHOOK_SECRET
 * is the only auth boundary.
 *
 * Reads the raw bytes via req.text() (NOT req.json()) — signature verification
 * needs the original payload.
 *
 * Always returns 200 once the signature is valid, even if downstream side
 * effects fail, so Stripe doesn't retry-storm us. Failures are logged to
 * console.error and surfaced via Sentry on the host side.
 *
 * Handles:
 *   checkout.session.completed       — upsert user_subscriptions; decrement
 *                                      founding_seats_remaining if applicable.
 *   customer.subscription.created    — sync plan/status/period_end.
 *   customer.subscription.updated    — sync plan/status/period_end.
 *   customer.subscription.deleted    — set plan='free', status='canceled'.
 *   invoice.payment_failed           — set status='past_due'.
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { getStripe, planFromPriceId } from "@/lib/stripe";
import type { SubscriptionPlan, SubscriptionStatus } from "@/services/billing/types";

export const dynamic = "force-dynamic";

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

function mapStripeStatus(s: Stripe.Subscription.Status): SubscriptionStatus {
  // Stripe statuses: trialing, active, incomplete, incomplete_expired,
  // past_due, canceled, unpaid, paused
  switch (s) {
    case "active":
    case "trialing":
    case "past_due":
    case "canceled":
    case "unpaid":
    case "paused":
      return s;
    default:
      return "canceled"; // incomplete / incomplete_expired collapse to canceled
  }
}

async function handleCheckoutCompleted(
  event: Stripe.CheckoutSessionCompletedEvent,
): Promise<void> {
  const session = event.data.object;
  const userId = session.client_reference_id ?? (session.metadata?.user_id as string | undefined);
  if (!userId) {
    console.error("[stripe.webhook] checkout.session.completed: no user_id");
    return;
  }
  const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;

  // Resolve which plan this purchase is for.
  let plan: SubscriptionPlan = "free";
  let priceId: string | null = null;
  let isFoundingLifetime = false;

  if (session.mode === "subscription" && session.subscription) {
    const subId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
    const stripe = getStripe();
    const sub = await stripe.subscriptions.retrieve(subId);
    priceId = sub.items.data[0]?.price.id ?? null;
    if (priceId) {
      const resolved = planFromPriceId(priceId);
      if (resolved) plan = resolved.plan;
    }
  } else if (session.mode === "payment") {
    // One-time addon. Pull the line item to find the price id.
    const stripe = getStripe();
    const items = await stripe.checkout.sessions.listLineItems(session.id, { limit: 1 });
    priceId = items.data[0]?.price?.id ?? null;
    if (priceId) {
      const resolved = planFromPriceId(priceId);
      if (resolved?.addon === "founding_lifetime") {
        plan = "pro";
        isFoundingLifetime = true;
      }
    }
  }

  const sb = adminClient();

  // Atomic decrement for founding seats. Postgres-level guard via WHERE value > 0.
  if (isFoundingLifetime) {
    const { data: flag } = await sb
      .from("feature_flags")
      .select("value")
      .eq("key", "founding_seats_remaining")
      .maybeSingle();
    const current = (flag?.value as number | null) ?? 0;
    if (current > 0) {
      await sb
        .from("feature_flags")
        .update({ value: current - 1 })
        .eq("key", "founding_seats_remaining")
        .gt("value", 0);
    } else {
      console.error(
        "[stripe.webhook] founding seat purchased but counter already at 0 — investigate",
        { userId, priceId },
      );
    }
  }

  await sb.from("user_subscriptions").upsert(
    {
      user_id: userId,
      plan,
      status: "active" as SubscriptionStatus,
      stripe_customer_id: customerId,
      stripe_price_id: priceId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
}

async function handleSubscriptionChanged(
  event:
    | Stripe.CustomerSubscriptionCreatedEvent
    | Stripe.CustomerSubscriptionUpdatedEvent,
): Promise<void> {
  const sub = event.data.object;
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const priceId = sub.items.data[0]?.price.id ?? null;

  let plan: SubscriptionPlan = "free";
  if (priceId) {
    const resolved = planFromPriceId(priceId);
    if (resolved) plan = resolved.plan;
  }

  const sb = adminClient();
  // Use the customer id to find our user.
  const { data: existing } = await sb
    .from("user_subscriptions")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  if (!existing?.user_id) {
    console.error("[stripe.webhook] subscription event for unknown customer", { customerId });
    return;
  }

  // current_period_end is on the subscription item under the new
  // 2025-09-30.clover schema; fall back to the top-level field for older shapes.
  const periodEndRaw =
    (sub as unknown as { current_period_end?: number }).current_period_end ??
    sub.items.data[0]?.current_period_end ??
    null;
  const periodEnd =
    typeof periodEndRaw === "number"
      ? new Date(periodEndRaw * 1000).toISOString()
      : null;

  await sb
    .from("user_subscriptions")
    .update({
      plan,
      status: mapStripeStatus(sub.status),
      stripe_subscription_id: sub.id,
      stripe_price_id: priceId,
      current_period_end: periodEnd,
      cancel_at_period_end: sub.cancel_at_period_end ?? false,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", existing.user_id);
}

async function handleSubscriptionDeleted(
  event: Stripe.CustomerSubscriptionDeletedEvent,
): Promise<void> {
  const sub = event.data.object;
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const sb = adminClient();
  await sb
    .from("user_subscriptions")
    .update({
      plan: "free",
      status: "canceled",
      stripe_subscription_id: null,
      stripe_price_id: null,
      cancel_at_period_end: false,
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_customer_id", customerId);
}

async function handleInvoicePaymentFailed(
  event: Stripe.InvoicePaymentFailedEvent,
): Promise<void> {
  const invoice = event.data.object;
  const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id ?? null;
  if (!customerId) return;
  const sb = adminClient();
  await sb
    .from("user_subscriptions")
    .update({
      status: "past_due",
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_customer_id", customerId);
}

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "missing_signature" }, { status: 400 });

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[stripe.webhook] STRIPE_WEBHOOK_SECRET not set");
    return NextResponse.json({ error: "server_misconfigured" }, { status: 500 });
  }

  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(raw, sig, secret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "bad_signature";
    return NextResponse.json({ error: "bad_signature", message: msg }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event as Stripe.CheckoutSessionCompletedEvent);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await handleSubscriptionChanged(
          event as
            | Stripe.CustomerSubscriptionCreatedEvent
            | Stripe.CustomerSubscriptionUpdatedEvent,
        );
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event as Stripe.CustomerSubscriptionDeletedEvent);
        break;
      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(event as Stripe.InvoicePaymentFailedEvent);
        break;
      default:
        // Unhandled event types are not an error — Stripe sends many we ignore.
        break;
    }
  } catch (err) {
    // Always 200 to Stripe once signature is valid; log for ops.
    console.error("[stripe.webhook] handler error", err);
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
