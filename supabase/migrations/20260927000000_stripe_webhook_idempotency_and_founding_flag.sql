-- ─────────────────────────────────────────────────────────────────────────
-- Stripe go-live P0 fixes — #447, #446, #449
--
-- #447 — webhook has no event de-dup and the founding-seat decrement is a
-- client-side read-modify-write (SELECT value, then UPDATE value-1), which
-- races under concurrent checkouts and can be replayed by Stripe's
-- at-least-once delivery. Fixes:
--   stripe_webhook_events   — one row per processed event.id; the webhook
--                             checks/inserts this before doing anything else
--                             and returns early on a duplicate.
--   decrement_founding_seat() — single atomic
--                             `UPDATE ... SET value = value - 1 WHERE value > 0
--                             RETURNING value`. Postgres row-level locking on
--                             the UPDATE serializes concurrent callers; there
--                             is no read-then-write race because the
--                             decrement and the guard happen in the same
--                             statement.
--
-- #446 / #449 — `user_subscriptions.plan` is the only signal of entitlement,
-- so a $89 Founding Lifetime purchase (which grants Pro permanently) gets
-- silently erased by any later event that recomputes `plan` for that
-- customer — an add-on's subscription lifecycle, or a cancelled trial.
-- `is_founding_lifetime` is a separate, durable flag the webhook checks
-- before writing `plan`: once true, no handler is allowed to downgrade
-- the row's plan away from 'pro'.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.user_subscriptions
  ADD COLUMN IF NOT EXISTS is_founding_lifetime boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.user_subscriptions.is_founding_lifetime IS
  '#446/#449 — set once, on the founding-lifetime checkout, and never cleared. Webhook handlers must not overwrite plan away from ''pro'' while this is true, regardless of what any other subscription event on the same customer says.';

CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  event_id     text PRIMARY KEY,
  event_type   text NOT NULL,
  received_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.stripe_webhook_events IS
  '#447 — idempotency ledger for /api/stripe/webhook. Stripe delivers at-least-once; the route inserts event.id here before processing and skips (200, no-op) on a duplicate.';

ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages webhook events" ON public.stripe_webhook_events;
CREATE POLICY "Service role manages webhook events"
  ON public.stripe_webhook_events
  FOR ALL
  USING (auth.role() = 'service_role');

CREATE OR REPLACE FUNCTION public.decrement_founding_seat()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.feature_flags
     SET value = value - 1
   WHERE key = 'founding_seats_remaining'
     AND value > 0
  RETURNING value;
$$;

COMMENT ON FUNCTION public.decrement_founding_seat() IS
  '#447 — atomic founding-seat decrement. Returns the new remaining count, or NULL (no row updated) when seats were already at 0 — the caller treats NULL as sold-out-on-race and must not grant Pro without a seat.';

REVOKE ALL ON FUNCTION public.decrement_founding_seat() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decrement_founding_seat() TO service_role;
