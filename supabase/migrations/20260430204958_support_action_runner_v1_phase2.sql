-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 2: Auto-Action Loop (v1)
-- L0 (any class) → create GitHub issue. L1+ACCOUNT_ACCESS → trigger password reset.
-- L1+other → routed to human (no action). L2/L3 → always human.
-- Kill switch defaults OFF.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Add action_taken column to support_tickets so we can report on what fired.
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS action_taken text,
  ADD COLUMN IF NOT EXISTS action_outcome text
    CHECK (action_outcome IS NULL OR action_outcome IN ('pending','verified','failed','skipped','rate_limited','flag_off','no_rule'));

-- 2. Seed recovery_rules with v1 mappings (L1 only; L0 is hardcoded in the runner).
--    Use config->>'classification' + config->>'tier' for lookup.
INSERT INTO public.recovery_rules (rule_name, trigger_event, action, config, is_active, priority)
VALUES
  ('L1:ACCOUNT_ACCESS',  'support_ticket_classified', 'trigger_password_reset', '{"tier":"L1","classification":"ACCOUNT_ACCESS"}'::jsonb, true,  10),
  ('L1:STALE_DATA',      'support_ticket_classified', 'cache_flush_user',       '{"tier":"L1","classification":"STALE_DATA","v1_disabled":true}'::jsonb, false, 20),
  ('L1:EMAIL_DELIVERY',  'support_ticket_classified', 'resend_user_email',      '{"tier":"L1","classification":"EMAIL_DELIVERY","v1_disabled":true}'::jsonb, false, 30),
  ('L1:BILLING_DISPUTE', 'support_ticket_classified', 'route_to_human',         '{"tier":"L1","classification":"BILLING_DISPUTE"}'::jsonb, true,  40)
ON CONFLICT (rule_name) DO UPDATE
  SET action = EXCLUDED.action,
      config = EXCLUDED.config,
      is_active = EXCLUDED.is_active,
      priority = EXCLUDED.priority,
      updated_at = now();

-- 3. Phase 2 kill switch — defaults OFF until user explicitly flips it.
INSERT INTO public.feature_flags (key, enabled, description)
VALUES ('support_auto_action', false,
        'Phase 2: when true, L0/L1 tickets with classifier_confidence ≥ 0.85 trigger autonomous action (GitHub issue for L0, password reset for L1+ACCOUNT_ACCESS). Defaults OFF.')
ON CONFLICT (key) DO NOTHING;

-- 4. Vault placeholder for the GitHub PAT.
--    The user populates this with: SELECT vault.update_secret(<id>, '<pat>', NULL, NULL);
DO $$
DECLARE existing_id uuid;
BEGIN
  SELECT id INTO existing_id FROM vault.secrets WHERE name = 'github_pat';
  IF existing_id IS NULL THEN
    PERFORM vault.create_secret(
      'PLACEHOLDER_NOT_SET',
      'github_pat',
      'GitHub fine-grained PAT for support-action-runner. Required for L0 → create GitHub issue. Scope: Issues:write on majabri/icareeros only.'
    );
  END IF;
END $$;

-- 5. Trigger function that calls the action-runner edge function whenever
--    classification transitions from NULL to non-NULL.
CREATE OR REPLACE FUNCTION public.notify_support_action_runner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_secret    text;
  v_url_root  text;
BEGIN
  -- Only fire on classification transition (NULL → non-NULL). Skip re-classifies.
  IF NEW.classification IS NULL OR OLD.classification IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Pull config from vault. Note: we do NOT gate on the feature flag here —
  -- the runner itself does, so we always have a recovery_attempts row even
  -- when the flag is off (so you can see what *would* have happened).
  SELECT decrypted_secret INTO v_secret    FROM vault.decrypted_secrets WHERE name = 'support_resolver_secret';
  SELECT decrypted_secret INTO v_url_root  FROM vault.decrypted_secrets WHERE name = 'project_url';

  IF v_secret IS NULL OR v_url_root IS NULL THEN
    INSERT INTO public.recovery_attempts (source, source_id, status, error, notes)
    VALUES ('support_ticket', NEW.id, 'error',
            'vault secret support_resolver_secret or project_url missing',
            jsonb_build_object('trigger', 'notify_support_action_runner'));
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := v_url_root || '/functions/v1/support-action-runner',
    headers := jsonb_build_object(
      'Content-Type',       'application/json',
      'x-resolver-secret',  v_secret
    ),
    body := jsonb_build_object('ticket_id', NEW.id)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS support_tickets_invoke_action_runner ON public.support_tickets;
CREATE TRIGGER support_tickets_invoke_action_runner
  AFTER UPDATE OF classification ON public.support_tickets
  FOR EACH ROW
  WHEN (NEW.classification IS NOT NULL AND OLD.classification IS DISTINCT FROM NEW.classification)
  EXECUTE FUNCTION public.notify_support_action_runner();

NOTIFY pgrst, 'reload schema';;