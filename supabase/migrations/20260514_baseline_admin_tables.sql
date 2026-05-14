-- Sprint 4 housekeeping (2026-05-14) — baseline-capture four admin tables
-- that were created ad-hoc via Supabase MCP during earlier sprints but were
-- never committed to the migrations tree. Without this file a fresh
-- environment (CI, staging, replication test) cannot rebuild prod.
--
-- Tables captured (in dependency-safe order):
--   • feature_flags         — feature flags + production-marked subset
--   • service_health        — per-service liveness + circuit breaker state
--   • deployment_history    — Vercel deploy webhook landing zone
--   • recovery_rules        — Phase 2 ADR-005 auto-remediation policy
--
-- Each block uses CREATE TABLE IF NOT EXISTS + idempotent index/policy
-- creation so re-running this on prod is a safe no-op. The DML at the
-- bottom is also idempotent (ON CONFLICT … DO NOTHING) — seeds are only
-- written if the row doesn't exist yet, so we don't clobber any value
-- that has already been edited live (e.g. founding_seats_remaining).
--
-- Pre-existing dependencies referenced by RLS that we do NOT recreate:
--   • app_role enum + has_role(user_id, app_role) fn  (created earlier)
--   • user_role enum                                  (created earlier)
--   • public.profiles                                 (existing table)
--   • auth.users                                      (Supabase auth)


-- ─────────────────────────────────────────────────────────────────────────
-- 1. feature_flags
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.feature_flags (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key           text NOT NULL UNIQUE,
  enabled       boolean NOT NULL DEFAULT true,
  description   text DEFAULT '',
  updated_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  value         integer,
  is_production boolean NOT NULL DEFAULT false
);

ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage feature flags"        ON public.feature_flags;
DROP POLICY IF EXISTS "Anon users can read feature flags"      ON public.feature_flags;
DROP POLICY IF EXISTS "Anyone authenticated can read feature flags" ON public.feature_flags;

CREATE POLICY "Admins can manage feature flags"
  ON public.feature_flags FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anon users can read feature flags"
  ON public.feature_flags FOR SELECT TO anon
  USING (true);

CREATE POLICY "Anyone authenticated can read feature flags"
  ON public.feature_flags FOR SELECT TO authenticated
  USING (true);


-- ─────────────────────────────────────────────────────────────────────────
-- 2. service_health
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.service_health (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name         text NOT NULL UNIQUE,
  status               text NOT NULL DEFAULT 'healthy',
  last_check           timestamptz NOT NULL DEFAULT now(),
  error_count          integer NOT NULL DEFAULT 0,
  circuit_breaker_open boolean NOT NULL DEFAULT false,
  last_error           text,
  updated_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.service_health ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone authenticated can read service health" ON public.service_health;
DROP POLICY IF EXISTS "Service role can manage service health"       ON public.service_health;

CREATE POLICY "Anyone authenticated can read service health"
  ON public.service_health FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Service role can manage service health"
  ON public.service_health FOR ALL TO service_role
  USING (true) WITH CHECK (true);


-- ─────────────────────────────────────────────────────────────────────────
-- 3. deployment_history (Sprint 2 W2-C — Vercel deploy webhook landing zone)
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.deployment_history (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vercel_deployment_id     text NOT NULL UNIQUE,
  vercel_url               text NOT NULL,
  environment              text NOT NULL,
  branch                   text,
  commit_sha               text NOT NULL,
  commit_message           text,
  state                    text NOT NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  ready_at                 timestamptz,
  build_duration_ms        integer,
  post_deploy_error_count  integer DEFAULT 0,
  post_deploy_5xx_count    integer DEFAULT 0,
  gate_decision            text,
  gate_decision_at         timestamptz,
  gate_rationale           text,
  rolled_back_at           timestamptz,
  rolled_back_to_id        text,
  metadata                 jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS deployment_history_commit_idx
  ON public.deployment_history (commit_sha);
CREATE INDEX IF NOT EXISTS deployment_history_created_at_idx
  ON public.deployment_history (created_at DESC);
CREATE INDEX IF NOT EXISTS deployment_history_env_idx
  ON public.deployment_history (environment, created_at DESC);
CREATE INDEX IF NOT EXISTS deployment_history_state_idx
  ON public.deployment_history (state);

ALTER TABLE public.deployment_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admins_read_deployments     ON public.deployment_history;
DROP POLICY IF EXISTS service_writes_deployments  ON public.deployment_history;

-- Read: admins (joined via public.profiles where role='admin'::user_role).
-- Backward-compat note: the new 5-tier admin_role column (Sprint 4 W1) is
-- a superset of this — anyone with admin_role IS NOT NULL also has the
-- effective legacy role='admin' via the requirePermission() fallback, so
-- this policy continues to gate correctly. Server-rendered admin pages
-- read via service_role and bypass RLS anyway.
CREATE POLICY admins_read_deployments
  ON public.deployment_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.user_id = auth.uid()
        AND profiles.role = 'admin'::user_role
    )
  );

-- Write: service_role only (Vercel webhook posts via the service-role key).
CREATE POLICY service_writes_deployments
  ON public.deployment_history FOR ALL TO service_role
  USING (true) WITH CHECK (true);


-- ─────────────────────────────────────────────────────────────────────────
-- 4. recovery_rules (ADR-005 Phase 2 auto-remediation policy)
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.recovery_rules (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_name     text NOT NULL UNIQUE,
  trigger_event text NOT NULL,
  action        text NOT NULL,
  config        jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active     boolean NOT NULL DEFAULT true,
  priority      integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.recovery_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages recovery_rules" ON public.recovery_rules;

CREATE POLICY "Service role manages recovery_rules"
  ON public.recovery_rules FOR ALL
  USING (auth.role() = 'service_role'::text);


-- ─────────────────────────────────────────────────────────────────────────
-- Seed data — idempotent. ON CONFLICT DO NOTHING preserves any live-edited
-- values (e.g. enabled=true after manual toggle, founding_seats_remaining
-- after Stripe-driven decrements).
-- ─────────────────────────────────────────────────────────────────────────

-- feature_flags — 26 keys captured from prod at sprint close (2026-05-14)
INSERT INTO public.feature_flags (key, enabled, description, value, is_production) VALUES
  ('ai_search',              false, 'Enable AI-powered web search via Firecrawl API',                                                                                                                                  NULL, false),
  ('auto_apply',             true,  'Enable auto-apply job feature',                                                                                                                                                    NULL, false),
  ('autopilot_mode',         false, 'Enable fully automated job search + apply',                                                                                                                                        NULL, true),
  ('bug_inbox_cron',         true,  'ADR-005 Phase 2: enables the /api/cron/check-bugs-inbox IMAP triage cron. Toggle OFF in /admin/system to silence the cron without redeploying.',                                   NULL, false),
  ('career_path',            true,  'Enable career path planning',                                                                                                                                                       NULL, false),
  ('contracts',              false, 'Enable contract lifecycle management',                                                                                                                                              NULL, false),
  ('discover_perplexity_cron', true,'Sprint 2 W5-C: enables /api/cron/discover-perplexity (1 sonar-pro query per day, behind 4-stage verification gate). Default ON.',                                                   NULL, false),
  ('discover_rss_cron',      true,  'Sprint 2 W5-B: enables /api/cron/discover-rss (WeWorkRemotely + Remotive + HN Who-is-Hiring ingest). Default ON.',                                                                  NULL, false),
  ('discovery_agent',        true,  'Master switch for Discovery Agent',                                                                                                                                                 NULL, false),
  ('feature_advanced_match', true,  'Advanced match score details. Gated to Pro+ when monetization_enabled.',                                                                                                            NULL, false),
  ('feature_ai_coach',       true,  'AI Coach (Act/Coach stages). Gated to Pro+ when monetization_enabled.',                                                                                                             NULL, false),
  ('feature_unlimited_cycles', true,'Unlimited Career OS cycles. Gated to Pro+ when monetization_enabled.',                                                                                                              NULL, false),
  ('founding_seats_remaining', true,'Phase 5 — number of Founding Lifetime ($89) seats still available. Decremented atomically by /api/stripe/webhook on founding purchase. Offer is hidden when value reaches 0.',      100,  false),
  ('gig_marketplace',        false, 'Enable gig/freelance marketplace',                                                                                                                                                  NULL, false),
  ('invite_only_enrollment', true,  'Require invite code to register',                                                                                                                                                   NULL, true),
  ('job_search',             true,  'Enable job search',                                                                                                                                                                 NULL, false),
  ('learning',               true,  'Enable learning recommendations',                                                                                                                                                   NULL, false),
  ('localization',           true,  'Enable multi-language support',                                                                                                                                                     NULL, false),
  ('maintenance_mode',       false, 'Sprint 4 W3-A: when true, serve a maintenance page on non-admin routes.',                                                                                                           NULL, true),
  ('matching',               true,  'Enable job matching/scoring',                                                                                                                                                       NULL, false),
  ('monetization_enabled',   true,  'Master switch for Stripe paywall. When false all users get full access regardless of plan. Set true only when ready to charge.',                                                    NULL, true),
  ('notifications',          true,  'Enable notification system',                                                                                                                                                        NULL, false),
  ('proposal_system',        false, 'Enable project proposal and bidding system',                                                                                                                                        NULL, false),
  ('service_catalog',        false, 'Enable Fiverr-style talent service catalog',                                                                                                                                        NULL, false),
  ('support_auto_action',    false, 'Phase 2: when true, L0/L1 tickets with classifier_confidence ≥ 0.85 trigger autonomous action (GitHub issue for L0, password reset for L1+ACCOUNT_ACCESS). Defaults OFF.',          NULL, true),
  ('support_auto_resolve',   true,  'CLASSIFY-ONLY v1: AI classifies new tickets + drafts a response into admin_notes. No live user-facing actions.',                                                                    NULL, false)
ON CONFLICT (key) DO NOTHING;

-- service_health — 10 services
INSERT INTO public.service_health (service_name, status) VALUES
  ('admin',        'healthy'),
  ('auth',         'healthy'),
  ('auto-apply',   'healthy'),
  ('billing',      'healthy'),
  ('career-path',  'healthy'),
  ('learning',     'healthy'),
  ('matching',     'healthy'),
  ('notification', 'healthy'),
  ('profile',      'healthy'),
  ('search',       'healthy')
ON CONFLICT (service_name) DO NOTHING;

-- recovery_rules — 4 ADR-005 rules. L1:STALE_DATA + L1:EMAIL_DELIVERY are
-- v1_disabled (config-flagged off) and only L1:ACCOUNT_ACCESS + L1:BILLING_DISPUTE
-- are active.
INSERT INTO public.recovery_rules (rule_name, trigger_event, action, priority, is_active, config) VALUES
  ('L1:ACCOUNT_ACCESS',  'support_ticket_classified', 'trigger_password_reset', 10, true,  '{"tier":"L1","classification":"ACCOUNT_ACCESS"}'::jsonb),
  ('L1:STALE_DATA',      'support_ticket_classified', 'cache_flush_user',       20, false, '{"tier":"L1","v1_disabled":true,"classification":"STALE_DATA"}'::jsonb),
  ('L1:EMAIL_DELIVERY',  'support_ticket_classified', 'resend_user_email',      30, false, '{"tier":"L1","v1_disabled":true,"classification":"EMAIL_DELIVERY"}'::jsonb),
  ('L1:BILLING_DISPUTE', 'support_ticket_classified', 'route_to_human',         40, true,  '{"tier":"L1","classification":"BILLING_DISPUTE"}'::jsonb)
ON CONFLICT (rule_name) DO NOTHING;
