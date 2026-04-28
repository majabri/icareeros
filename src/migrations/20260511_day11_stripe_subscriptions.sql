-- ============================================================
-- Day 11: Stripe Subscription Tables + Feature Flag
-- All users start on Free; monetization is feature-flagged OFF
-- ============================================================

-- Subscription plan enum
DO $$ BEGIN
  CREATE TYPE public.subscription_plan AS ENUM ('free', 'pro', 'premium');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.subscription_status AS ENUM (
    'active', 'trialing', 'past_due', 'canceled', 'unpaid', 'paused'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- user_subscriptions: one row per user, tracks current plan
CREATE TABLE IF NOT EXISTS public.user_subscriptions (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  plan                      public.subscription_plan NOT NULL DEFAULT 'free',
  status                    public.subscription_status NOT NULL DEFAULT 'active',
  stripe_customer_id        text UNIQUE,
  stripe_subscription_id    text UNIQUE,
  stripe_price_id           text,
  current_period_start      timestamptz,
  current_period_end        timestamptz,
  cancel_at_period_end      boolean NOT NULL DEFAULT false,
  trial_end                 timestamptz,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_id     ON public.user_subscriptions (user_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_stripe_cust ON public.user_subscriptions (stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_stripe_sub  ON public.user_subscriptions (stripe_subscription_id);

ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read their own subscription"
  ON public.user_subscriptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role manages subscriptions"
  ON public.user_subscriptions FOR ALL
  USING (auth.role() = 'service_role');

-- subscription_events: full webhook event log for audit / replay
CREATE TABLE IF NOT EXISTS public.subscription_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  stripe_event_id text NOT NULL UNIQUE,
  event_type      text NOT NULL,
  payload         jsonb NOT NULL DEFAULT '{}',
  processed       boolean NOT NULL DEFAULT false,
  processed_at    timestamptz,
  error           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscription_events_user_id   ON public.subscription_events (user_id);
CREATE INDEX IF NOT EXISTS idx_subscription_events_type      ON public.subscription_events (event_type);
CREATE INDEX IF NOT EXISTS idx_subscription_events_processed ON public.subscription_events (processed);

ALTER TABLE public.subscription_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages subscription_events"
  ON public.subscription_events FOR ALL
  USING (auth.role() = 'service_role');

-- Feature flag: monetization OFF by default
INSERT INTO public.feature_flags (key, enabled, description)
VALUES (
  'monetization_enabled',
  false,
  'Master switch for Stripe paywall. When false all users get full access regardless of plan. Set true only when ready to charge.'
)
ON CONFLICT (key) DO UPDATE
  SET enabled = false,
      description = EXCLUDED.description,
      updated_at  = now();

INSERT INTO public.feature_flags (key, enabled, description) VALUES
  ('feature_ai_coach',        true,  'AI Coach. Gated to Pro+ when monetization_enabled.'),
  ('feature_advanced_match',  true,  'Advanced match score. Gated to Pro+ when monetization_enabled.'),
  ('feature_unlimited_cycles',true,  'Unlimited Career OS cycles. Gated to Pro+ when monetization_enabled.')
ON CONFLICT (key) DO NOTHING;

-- Auto-provision Free subscription on new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_subscriptions (user_id, plan, status)
  VALUES (NEW.id, 'free', 'active')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_subscription ON auth.users;
CREATE TRIGGER on_auth_user_created_subscription
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_subscription();

-- Back-fill Free subscriptions for existing users
INSERT INTO public.user_subscriptions (user_id, plan, status)
SELECT id, 'free', 'active'
FROM auth.users
WHERE id NOT IN (SELECT user_id FROM public.user_subscriptions)
ON CONFLICT (user_id) DO NOTHING;
