-- ─────────────────────────────────────────────────────────────────────────────
-- support-resolver v1 — CLASSIFY-ONLY mode
-- Builds the audit trail and classifier loop. No live actions yet.
-- See docs/Audit_Support_Autonomous_Loop_2026-04-30.md.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Extend support_tickets with classifier output columns
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS classification           text,
  ADD COLUMN IF NOT EXISTS classifier_confidence    numeric(4,3),
  ADD COLUMN IF NOT EXISTS resolver_run_id          uuid,
  ADD COLUMN IF NOT EXISTS auto_resolved            boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS suggested_response       text;

-- 2. Audit table: every resolver invocation, success or failure
CREATE TABLE IF NOT EXISTS public.recovery_attempts (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source             text NOT NULL CHECK (source IN ('support_ticket','health_check','manual')),
  source_id          uuid,
  classification     text,
  classifier_conf    numeric(4,3),
  action             text NOT NULL DEFAULT 'classify_only',
  status             text NOT NULL CHECK (status IN ('started','classified','action_taken','no_action','error')),
  prompt_tokens      integer,
  completion_tokens  integer,
  cost_usd           numeric(8,6),
  error              text,
  notes              jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at         timestamptz NOT NULL DEFAULT now(),
  finished_at        timestamptz
);

CREATE INDEX IF NOT EXISTS idx_recovery_attempts_source
  ON public.recovery_attempts (source, source_id);
CREATE INDEX IF NOT EXISTS idx_recovery_attempts_started
  ON public.recovery_attempts (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_recovery_attempts_status
  ON public.recovery_attempts (status);

ALTER TABLE public.recovery_attempts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role manages recovery_attempts" ON public.recovery_attempts;
CREATE POLICY "Service role manages recovery_attempts"
  ON public.recovery_attempts FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
DROP POLICY IF EXISTS "Admin reads recovery_attempts" ON public.recovery_attempts;
CREATE POLICY "Admin reads recovery_attempts"
  ON public.recovery_attempts FOR SELECT
  USING (auth.jwt() ->> 'email' = 'majabri714@gmail.com');

-- 3. Kill switch in feature_flags (defaults to TRUE for classify-only since
--    it never takes user-facing action — we want the audit data flowing).
INSERT INTO public.feature_flags (key, enabled, description)
VALUES ('support_auto_resolve', true,
        'CLASSIFY-ONLY v1: AI classifies new tickets + drafts a response into admin_notes. No live user-facing actions.')
ON CONFLICT (key) DO NOTHING;

-- 4. Generate + store the shared secret the trigger uses to authenticate to the edge function.
--    The same UUID is hardcoded in supabase/functions/support-resolver/index.ts.
DO $$
DECLARE existing_id uuid;
BEGIN
  SELECT id INTO existing_id FROM vault.secrets WHERE name = 'support_resolver_secret';
  IF existing_id IS NULL THEN
    PERFORM vault.create_secret(
      gen_random_uuid()::text,
      'support_resolver_secret',
      'Shared secret between notify_support_resolver() trigger and the support-resolver edge function.'
    );
  END IF;
END $$;

-- 5. Project URL secret (the edge function endpoint root)
DO $$
DECLARE existing_id uuid;
BEGIN
  SELECT id INTO existing_id FROM vault.secrets WHERE name = 'project_url';
  IF existing_id IS NULL THEN
    PERFORM vault.create_secret(
      'https://kuneabeiwcxavvyyfjkx.supabase.co',
      'project_url',
      'Base URL of this Supabase project, used for pg_net calls into edge functions.'
    );
  END IF;
END $$;

-- 6. Trigger function: invokes the resolver asynchronously via pg_net.
--    Never blocks the user's INSERT — pg_net is fire-and-forget.
CREATE OR REPLACE FUNCTION public.notify_support_resolver()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_secret    text;
  v_url_root  text;
  v_enabled   boolean;
BEGIN
  -- Honor the kill switch
  SELECT enabled INTO v_enabled FROM public.feature_flags WHERE key = 'support_auto_resolve';
  IF v_enabled IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  -- Pull config from vault. If missing, log + bail (don't break user inserts).
  SELECT decrypted_secret INTO v_secret    FROM vault.decrypted_secrets WHERE name = 'support_resolver_secret';
  SELECT decrypted_secret INTO v_url_root  FROM vault.decrypted_secrets WHERE name = 'project_url';

  IF v_secret IS NULL OR v_url_root IS NULL THEN
    INSERT INTO public.recovery_attempts (source, source_id, status, error, notes)
    VALUES ('support_ticket', NEW.id, 'error',
            'vault secret support_resolver_secret or project_url missing',
            jsonb_build_object('trigger', 'notify_support_resolver'));
    RETURN NEW;
  END IF;

  -- Fire the async HTTP call. pg_net returns a request id immediately.
  PERFORM net.http_post(
    url := v_url_root || '/functions/v1/support-resolver',
    headers := jsonb_build_object(
      'Content-Type',       'application/json',
      'x-resolver-secret',  v_secret
    ),
    body := jsonb_build_object('ticket_id', NEW.id)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS support_tickets_invoke_resolver ON public.support_tickets;
CREATE TRIGGER support_tickets_invoke_resolver
  AFTER INSERT ON public.support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_support_resolver();

-- 7. Allow the edge function (running as service_role) to read its own settings.
GRANT USAGE ON SCHEMA vault TO service_role;
GRANT SELECT ON vault.decrypted_secrets TO service_role;;