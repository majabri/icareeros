-- ═════════════════════════════════════════════════════════════════════════
-- Applied to prod (kuneabeiwcxavvyyfjkx) via Supabase mgmt API on
-- 2026-08-13 by Platform Cowork. Bookkeeping PR — do NOT re-apply the
-- rescheduling in a fresh environment before the Vault secret is seeded
-- (see prerequisite guard below).
-- ═════════════════════════════════════════════════════════════════════════
--
-- Migrate 4 pg_cron jobs from the fragile `app.settings.service_role_key`
-- GUC to Supabase Vault-backed auth.
--
-- ─────────────────────────────────────────────────────────────────────────
-- Why
-- ─────────────────────────────────────────────────────────────────────────
--
-- On 2026-08-05 the `app.settings.service_role_key` GUC silently un-set
-- itself (likely a Supabase-side infrastructure event; hosted `postgres`
-- lacks superuser and can't `ALTER DATABASE SET` on it either). The four
-- pg_cron jobs below use `net.http_post` with an Authorization header
-- built from `current_setting('app.settings.service_role_key', true)`
-- which returned NULL after the GUC dropped. Every scheduled invocation
-- since then hit the edge-function gateway with an empty Bearer token
-- and got HTTP 401 UNAUTHORIZED_NO_AUTH_HEADER.
--
-- The failure was silent because `net.http_post` returns a `request_id`
-- immediately, so `cron.job_run_details` marked every run "succeeded"
-- (the returned row is the request handle, not the HTTP outcome). Four
-- jobs failed for 6+ days without any alert.
--
-- Supabase Vault stores secrets encrypted at rest; `vault.decrypted_secrets`
-- reads them back in-session. Unlike `app.settings.*` GUCs, Vault entries
-- are user-created rows in a normal table — they don't get cleared by
-- Supabase infrastructure changes.
--
-- ─────────────────────────────────────────────────────────────────────────
-- Prerequisite (one-time, manual — DO NOT put secrets in this file)
-- ─────────────────────────────────────────────────────────────────────────
--
-- Before running this migration in any environment, seed the Vault
-- secret via SQL Editor (paste-only, never through git):
--
--     SELECT vault.create_secret(
--       '<service_role_JWT>',
--       'service_role_key',
--       'Service role JWT for pg_cron -> edge function auth.'
--     );
--
-- Verify the seed:
--
--     SELECT LENGTH(decrypted_secret) FROM vault.decrypted_secrets
--     WHERE name = 'service_role_key';
--     -- Expected: 200+ (service role JWTs are ~220 chars)
--
-- The migration below aborts if the secret is missing.

-- ─────────────────────────────────────────────────────────────────────────
-- Guard: refuse to reschedule with an unresolvable secret name
-- ─────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  secret_len integer;
BEGIN
  SELECT LENGTH(decrypted_secret) INTO secret_len
  FROM vault.decrypted_secrets WHERE name = 'service_role_key';

  IF secret_len IS NULL OR secret_len < 100 THEN
    RAISE EXCEPTION
      'Vault secret "service_role_key" is missing or too short (%). '
      'Seed it via SQL Editor before applying this migration '
      '(see prerequisite comment above).', COALESCE(secret_len::text, 'NULL');
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- Rewrite the 4 pg_cron jobs — idempotent via unschedule + schedule
-- ─────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  PERFORM cron.unschedule('enrich-jobs-4h');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'enrich-jobs-4h',
  '30 */4 * * *',
  $CRON$
  SELECT net.http_post(
    url := 'https://kuneabeiwcxavvyyfjkx.supabase.co/functions/v1/enrich-jobs',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $CRON$
);

DO $$ BEGIN
  PERFORM cron.unschedule('curate-user-recommendations-daily');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'curate-user-recommendations-daily',
  '0 4 * * *',
  $CRON$
  SELECT net.http_post(
    url := 'https://kuneabeiwcxavvyyfjkx.supabase.co/functions/v1/curate-user-recommendations',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $CRON$
);

DO $$ BEGIN
  PERFORM cron.unschedule('cleanup-dead-jobs-daily');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'cleanup-dead-jobs-daily',
  '0 5 * * *',
  $CRON$
  SELECT net.http_post(
    url := 'https://kuneabeiwcxavvyyfjkx.supabase.co/functions/v1/cleanup-dead-jobs',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $CRON$
);

DO $$ BEGIN
  PERFORM cron.unschedule('validate-job-urls-daily');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'validate-job-urls-daily',
  '0 3 * * *',
  $CRON$
  SELECT net.http_post(
    url := 'https://kuneabeiwcxavvyyfjkx.supabase.co/functions/v1/validate-job-urls',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $CRON$
);

-- ─────────────────────────────────────────────────────────────────────────
-- Post-apply verification (Platform runbook)
-- ─────────────────────────────────────────────────────────────────────────
--
-- Confirm all 4 jobs now reference Vault:
--
--   SELECT jobname, schedule, active,
--          command LIKE '%vault.decrypted_secrets%' AS uses_vault,
--          command LIKE '%app.settings.service_role_key%' AS still_uses_guc
--   FROM cron.job
--   WHERE jobname IN ('enrich-jobs-4h','curate-user-recommendations-daily',
--                     'cleanup-dead-jobs-daily','validate-job-urls-daily')
--   ORDER BY jobname;
--
-- Expected: 4 rows, all uses_vault=true, all still_uses_guc=false.
--
-- End-to-end fire test (creates a temporary one-shot):
--
--   SELECT cron.schedule('enrich-vault-smoke', '* * * * *',
--     $$SELECT net.http_post(
--         url := 'https://kuneabeiwcxavvyyfjkx.supabase.co/functions/v1/enrich-jobs',
--         headers := jsonb_build_object('Content-Type','application/json',
--           'Authorization','Bearer '||(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='service_role_key')),
--         body := '{}'::jsonb, timeout_milliseconds := 60000);$$);
--   -- Wait ~90 seconds
--   SELECT cron.unschedule('enrich-vault-smoke');
--   SELECT id, status_code, LEFT(content,150) FROM net._http_response
--   WHERE created > NOW() - INTERVAL '3 minutes' ORDER BY id DESC LIMIT 3;
--   -- Expected: status_code = 200 (was 401 pre-fix).
