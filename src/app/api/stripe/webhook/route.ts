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
 *   customer.subscription.deleted    — set plan='free', status='canceled'
 *                                      (unless the customer is a founding-
 *                                      lifetime grantee — see #449).
 *   invoice.payment_failed           — set status='past_due'. checkPlanLimit
 *                                      treats past_due as still-active — see
 *                                      #451 — so this is a grace signal, not
 *                                      an immediate lockout.
 *   invoice.payment_succeeded        — set status='active' (recovery path
 *                                      for #451; previously unhandled, so
 *                                      recovery depended entirely on a
 *                                      subsequent subscription.updated event
 *                                      arriving).
 *
 * #447 — every event is de-duped against `stripe_webhook_events` before any
 * side effect runs. Stripe delivers at-least-once; without this, a retried
 * `checkout.session.completed` double-decrements the founding-seat counter
 * and a retried `customer.subscription.deleted` is harmless but wasteful.
 *
 * #446/#449 — `is_founding_lifetime` on `user_subscriptions` is a durable
 * flag, separate from `plan`. Once set, no handler in this file may
 * overwrite `plan` away from "pro" for that row, regardless of what any
 * other event on the same Stripe customer says. See `resolvePlanForWrite`.
 */

import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
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

// fix/platform-stripe-types-lockfile — the parameter type is `string`, not
// Stripe.Subscription.Status, because Stripe evolves that union across SDK
// versions (22.4.0 added `OtherString` — an intentional escape hatch for
// forward compat that widens the union to any string and breaks discriminated-
// union narrowing). Taking `string` here plus an explicit set-membership
// check + logged warning on the miss path makes us tolerant of any future
// status Stripe adds — the row just gets `canceled` and we get a log line
// so we notice a value we should add explicit handling for.
const KNOWN_SUBSCRIPTION_STATUSES: readonly SubscriptionStatus[] = [
  "active", "trialing", "past_due", "canceled", "unpaid", "paused",
] as const;

function isKnownSubscriptionStatus(s: string): s is SubscriptionStatus {
  return (KNOWN_SUBSCRIPTION_STATUSES as readonly string[]).includes(s);
}

function mapStripeStatus(s: string): SubscriptionStatus {
  if (isKnownSubscriptionStatus(s)) return s;
  // Unknown status — log it (so we notice + can add explicit handling later)
  // and route to "canceled" as the safest default. Historical incompletes
  // (`incomplete`, `incomplete_expired`) also fall through here.
  console.warn(
    `[stripe.webhook] unknown Stripe subscription status "${s}" — mapping to "canceled". ` +
    `Add explicit handling in KNOWN_SUBSCRIPTION_STATUSES if this is a real new state.`,
  );
  return "canceled";
}

/**
 * #447 — idempotency guard. Inserts `event.id` into `stripe_webhook_events`;
 * a unique-violation means this event was already processed (Stripe retry,
 * or a duplicate delivery), so the caller should skip all side effects and
 * return 200 immediately. Any other DB error fails open (processes the
 * event anyway) — an occasional double-process on a rare DB hiccup is a far
 * smaller risk than silently dropping a real event.
 */
async function claimEventOnce(sb: SupabaseClient, event: Stripe.Event): Promise<boolean> {
  const { error } = await sb
    .from("stripe_webhook_events")
    .insert({ event_id: event.id, event_type: event.type });
  if (!error) return true; // first time seeing this event
  // Postgres unique_violation
  if ((error as { code?: string }).code === "23505") {
    console.warn(`[stripe.webhook] duplicate event ${event.id} (${event.type}) — skipping`);
    return false;
  }
  console.error("[stripe.webhook] idempotency insert failed, processing anyway:", error.message);
  return true;
}

/**
 * #449 — read the current row's `is_founding_lifetime` flag (by user_id or
 * by stripe_customer_id — callers use whichever they already have) and
 * decide the plan value a handler is allowed to write. A founding-lifetime
 * row always writes "pro"; every other row writes whatever the caller
 * computed from the Stripe event.
 */
async function resolvePlanForWrite(
  sb: SupabaseClient,
  by: { user_id: string } | { stripe_customer_id: string },
  computedPlan: SubscriptionPlan,
): Promise<{ plan: SubscriptionPlan; isFounding: boolean }> {
  const query = sb.from("user_subscriptions").select("is_founding_lifetime");
  const { data } = "user_id" in by
    ? await query.eq("user_id", by.user_id).maybeSingle()
    : await query.eq("stripe_customer_id", by.stripe_customer_id).maybeSingle();
  const isFounding = Boolean(data?.is_founding_lifetime);
  return { plan: isFounding ? "pro" : computedPlan, isFounding };
}

/**
 * #448 — fall back to the Stripe customer's `metadata.user_id` (set at
 * customer-creation time in /api/stripe/checkout) when a subscription event
 * arrives before `checkout.session.completed` has written
 * `stripe_customer_id` onto the user's row. Without this, an out-of-order
 * `customer.subscription.created` is silently dropped.
 */
async function findUserIdForCustomer(sb: SupabaseClient, customerId: string): Promise<string | null> {
  const { data: byCustomer } = await sb
    .from("user_subscriptions")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  if (byCustomer?.user_id) return byCustomer.user_id as string;

  try {
    const stripe = getStripe();
    const customer = await stripe.customers.retrieve(customerId);
    if (customer.deleted) return null;
    const userId = (customer.metadata?.user_id as string | undefined) ?? null;
    return userId;
  } catch (err) {
    console.error("[stripe.webhook] customer lookup fallback failed:", (err as Error).message);
    return null;
  }
}

async function handleCheckoutCompleted(
  sb: SupabaseClient,
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
  let plan: SubscriptionPlan | null = null;
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
    // One-time purchase. Pull the line item to find the price id.
    const stripe = getStripe();
    const items = await stripe.checkout.sessions.listLineItems(session.id, { limit: 1 });
    priceId = items.data[0]?.price?.id ?? null;
    if (priceId) {
      const resolved = planFromPriceId(priceId);
      if (resolved?.addon === "founding_lifetime") {
        plan = "pro";
        isFoundingLifetime = true;
      }
      // #446 — any other one-time addon (sprint, etc.) is NOT a plan change.
      // `resolved` being null or a non-founding addon both fall through with
      // `plan` still null, which the guard below turns into "don't touch
      // plan" rather than defaulting to "free" and downgrading a paying
      // subscriber. Granting the addon's own benefit is out of scope here —
      // see #446's "ship without add-ons" note; checkout no longer accepts
      // these price ids (see isAddonBody in the checkout route).
    }
  }

  // #447 — atomic decrement, no prior read. Money was already taken by
  // Stripe before this webhook fired, so a sold-out race here is an ops
  // anomaly to reconcile manually, not a reason to refuse the customer's
  // Pro grant — but it must be logged loudly, and the counter itself must
  // never go negative or double-decrement, which the atomic RPC guarantees.
  if (isFoundingLifetime) {
    const { data: remaining, error } = await sb.rpc("decrement_founding_seat");
    if (error) {
      console.error("[stripe.webhook] decrement_founding_seat RPC failed:", error.message, { userId, priceId });
    } else if (remaining === null) {
      console.error(
        "[stripe.webhook] founding seat purchased but counter already at 0 — oversold, reconcile manually",
        { userId, priceId },
      );
    }
  }

  if (plan === null) {
    // Nothing resolved to a plan change (a non-founding addon, or an
    // unmapped price id). Do not touch the row at all rather than writing
    // a guessed plan — an addon purchase must never look like a downgrade.
    if (customerId) {
      // Still worth recording the customer id if this is the user's first
      // Stripe touch, so the portal/lookup path has something to find.
      await sb.from("user_subscriptions").upsert(
        { user_id: userId, stripe_customer_id: customerId, updated_at: new Date().toISOString() },
        { onConflict: "user_id", ignoreDuplicates: false },
      );
    }
    return;
  }

  const { plan: finalPlan } = await resolvePlanForWrite(sb, { user_id: userId }, plan);

  await sb.from("user_subscriptions").upsert(
    {
      user_id: userId,
      plan: finalPlan,
      status: "active" satisfies SubscriptionStatus,
      stripe_customer_id: customerId,
      stripe_price_id: priceId,
      is_founding_lifetime: isFoundingLifetime || undefined, // never explicitly unset by a non-founding write
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
}

async function handleSubscriptionChanged(
  sb: SupabaseClient,
  event:
    | Stripe.CustomerSubscriptionCreatedEvent
    | Stripe.CustomerSubscriptionUpdatedEvent,
): Promise<void> {
  const sub = event.data.object;
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const priceId = sub.items.data[0]?.price.id ?? null;

  let resolvedPlan: SubscriptionPlan | null = null;
  if (priceId) {
    const resolved = planFromPriceId(priceId);
    if (resolved) resolvedPlan = resolved.plan;
  }

  // #448 — customer id first, Stripe customer metadata.user_id as fallback
  // for the out-of-order case (this event arriving before
  // checkout.session.completed has written stripe_customer_id).
  const userId = await findUserIdForCustomer(sb, customerId);
  if (!userId) {
    console.error("[stripe.webhook] subscription event for unresolvable customer", { customerId });
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

  // #449 — a founding-lifetime row's plan is never recomputed from a
  // subscription event. If resolvedPlan is null (unmapped price) and the
  // row isn't founding, leave the existing plan alone rather than guessing.
  const { isFounding } = await resolvePlanForWrite(sb, { user_id: userId }, resolvedPlan ?? "free");
  const planToWrite = isFounding ? "pro" : (resolvedPlan ?? undefined);

  await sb
    .from("user_subscriptions")
    .upsert(
      {
        user_id: userId,
        ...(planToWrite !== undefined ? { plan: planToWrite } : {}),
        status: isFounding ? "active" : mapStripeStatus(sub.status),
        stripe_customer_id: customerId,
        stripe_subscription_id: sub.id,
        stripe_price_id: priceId,
        current_period_end: periodEnd,
        cancel_at_period_end: sub.cancel_at_period_end ?? false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
}

async function handleSubscriptionDeleted(
  sb: SupabaseClient,
  event: Stripe.CustomerSubscriptionDeletedEvent,
): Promise<void> {
  const sub = event.data.object;
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;

  const { data: existing } = await sb
    .from("user_subscriptions")
    .select("user_id, is_founding_lifetime")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  if (!existing?.user_id) {
    console.error("[stripe.webhook] subscription.deleted for unknown customer", { customerId });
    return;
  }

  // #449 — cancelling an ordinary subscription must never wipe a
  // founding-lifetime grant. The founding purchase itself has no
  // subscription id (it's a one-time payment), so any subscription.deleted
  // on a founding customer is necessarily about a DIFFERENT, ordinary
  // subscription — the founding entitlement stays exactly as it was.
  if (existing.is_founding_lifetime) {
    await sb
      .from("user_subscriptions")
      .update({
        stripe_subscription_id: null,
        stripe_price_id: null,
        cancel_at_period_end: false,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", existing.user_id);
    return;
  }

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
    .eq("user_id", existing.user_id);
}

/**
 * #451 — status='past_due' on the first failed renewal. checkPlanLimit now
 * treats past_due as still-active (Stripe's own retry schedule is the grace
 * period; see that file), so this is a signal, not an immediate lockout.
 * Matched on stripe_customer_id like the other handlers — a known
 * limitation shared with #449: an addon's own invoice failing would affect
 * the whole customer row. Out of scope while add-ons are checkout-disabled
 * (#446).
 */
async function handleInvoicePaymentFailed(
  sb: SupabaseClient,
  event: Stripe.InvoicePaymentFailedEvent,
): Promise<void> {
  const invoice = event.data.object;
  const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id ?? null;
  if (!customerId) return;
  await sb
    .from("user_subscriptions")
    .update({
      status: "past_due",
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_customer_id", customerId);
}

/**
 * #451 — recovery path. Previously unhandled, so a successful retry only
 * recovered once a subsequent customer.subscription.updated happened to
 * arrive. Sets status back to active directly on the invoice event instead
 * of depending on that.
 */
async function handleInvoicePaymentSucceeded(
  sb: SupabaseClient,
  event: Stripe.InvoicePaymentSucceededEvent,
): Promise<void> {
  const invoice = event.data.object;
  const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id ?? null;
  if (!customerId) return;
  await sb
    .from("user_subscriptions")
    .update({
      status: "active" satisfies SubscriptionStatus,
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

  const sb = adminClient();

  // #447 — de-dup before any side effect. A duplicate delivery returns 200
  // immediately with nothing else run.
  const firstTime = await claimEventOnce(sb, event);
  if (!firstTime) {
    return NextResponse.json({ received: true, duplicate: true }, { status: 200 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(sb, event as Stripe.CheckoutSessionCompletedEvent);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await handleSubscriptionChanged(
          sb,
          event as
            | Stripe.CustomerSubscriptionCreatedEvent
            | Stripe.CustomerSubscriptionUpdatedEvent,
        );
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(sb, event as Stripe.CustomerSubscriptionDeletedEvent);
        break;
      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(sb, event as Stripe.InvoicePaymentFailedEvent);
        break;
      case "invoice.payment_succeeded":
        await handleInvoicePaymentSucceeded(sb, event as Stripe.InvoicePaymentSucceededEvent);
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
