-- ═════════════════════════════════════════════════════════════════════════
-- Heartbeat audit — pg_cron job that detects stale edge-function invocations
-- and writes its own liveness signal (watchman-of-the-watchman).
-- ═════════════════════════════════════════════════════════════════════════
--
-- Companion to the per-function heartbeat helper at
-- supabase/functions/_shared/heartbeat.ts. That helper emits
-- `invocation.start` and `invocation.complete` events from inside each
-- edge function. This migration adds the cron that scans those events
-- and raises a critical `stale_edge_invocation` if any expected function
-- hasn't reported in.
--
-- WHY THIS EXISTS (2026-08-05 -> 2026-08-13 incident):
--   `net.http_post` returns a request_id synchronously; the real HTTP
--   call happens async. `cron.job_run_details.status='succeeded'` reports
--   whether the request was queued, not whether the function actually ran.
--   Four pg_cron-called edge functions (enrich-jobs, curate-user-
--   recommendations, cleanup-dead-jobs, validate-job-urls) silently 401'd
--   for 8+ days after the `app.settings.service_role_key` GUC un-set
--   itself. `cron.job_run_details` reported success the whole time.
--   Amir noticed the ingest-wide silence via a different signal
--   (`ats_jobs.last_seen_at` frozen 6+ days) — heartbeats would have
--   raised a critical alert within one audit window.
--
-- DESIGN — dual heartbeat:
--   1. `invocation.start` on entry to each edge function -> proves the
--      function was reached, distinguishes "not invoked" from "invoked".
--   2. `invocation.complete` on exit with outcome + duration_ms -> proves
--      the function finished, distinguishes "invoked but crashing" from
--      "invoked and healthy".
--   Both events share an `invocation_id` in `payload` for pairing.
--
-- AUDIT (this migration):
--   Every 5 min, scan `infrastructure_events` for the 5 tracked edge
--   functions. For each function, check when its most recent
--   `invocation.start` occurred. If that gap > 1.5x its expected cadence,
--   raise a critical `stale_edge_invocation` event.
--
-- SELF-HEARTBEAT (watchman-of-the-watchman):
--   The audit ALSO writes its own `source='heartbeat-audit',
--   event_type='audit.ran'` info-severity event each execution. If the
--   audit itself dies silently (same failure class we're guarding
--   against), a second BetterStack rule alerts on absence of `audit.ran`
--   for >15 min. See docs/OBSERVABILITY_HEARTBEAT.md for the BetterStack
--   query wire-up.
--
-- CADENCE TABLE (inline for MVP per Amir 2026-08-13):
--   Keep expected intervals in a VALUES clause below. If we start adding
--   functions frequently, migrate to a real `edge_function_cadence`
--   table (schema commented at bottom of this file — mechanical port).

-- ─────────────────────────────────────────────────────────────────────────
-- Prerequisites
-- ─────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  secret_len integer;
BEGIN
  SELECT LENGTH(decrypted_secret) INTO secret_len
  FROM vault.decrypted_secrets WHERE name = 'service_role_key';
  IF secret_len IS NULL OR secret_len < 100 THEN
    RAISE EXCEPTION
      'Vault secret "service_role_key" is missing (%). Seed it before applying '
      'this migration (see 20260813020000_pg_cron_migrate_guc_to_vault.sql).',
      COALESCE(secret_len::text, 'NULL');
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- Audit function
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.heartbeat_audit()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $FUNC$
DECLARE
  audit_started_at timestamptz := clock_timestamp();
  stale_count      integer      := 0;
  checked_count    integer      := 0;
  fn_slug          text;
  expected_min     integer;
  grace_mult       numeric;
  last_start       timestamptz;
  gap_seconds      integer;
  threshold_sec    integer;
BEGIN
  -- Inline cadence table. Add rows here when adding new tracked functions.
  -- expected_interval_minutes := max normal gap between invocations.
  -- grace_multiplier := multiplier applied to the interval before alerting
  --                     (1.5 = 50% grace to absorb natural jitter).
  FOR fn_slug, expected_min, grace_mult IN
    SELECT * FROM (VALUES
      ('enrich-jobs',                    240, 1.5),   -- pg_cron 30 */4  = every 4h
      ('curate-user-recommendations',   1440, 1.5),   -- pg_cron 0 4     = daily
      ('cleanup-dead-jobs',             1440, 1.5),   -- pg_cron 0 5     = daily
      ('validate-job-urls',             1440, 1.5),   -- pg_cron 0 3     = daily
      ('ingest-ats-direct',              240, 1.5)    -- Vercel-cron 0 */4 = every 4h
    ) AS t(slug, expected_interval_minutes, grace_multiplier)
  LOOP
    checked_count := checked_count + 1;
    threshold_sec := (expected_min * 60 * grace_mult)::integer;

    SELECT MAX(created_at) INTO last_start
    FROM public.infrastructure_events
    WHERE source     = 'edge-fn.' || fn_slug
      AND event_type = 'invocation.start'
      AND created_at > NOW() - (expected_min || ' minutes')::interval * 3;
      -- Only look back 3x cadence — older data isn't relevant and slows the scan.

    IF last_start IS NULL THEN
      -- Never seen a heartbeat within 3x cadence. Alert.
      INSERT INTO public.infrastructure_events (source, event_type, severity, payload)
      VALUES (
        'heartbeat-audit',
        'stale_edge_invocation',
        'critical',
        jsonb_build_object(
          'function',                    fn_slug,
          'last_invocation_start',       null,
          'expected_within_minutes',     expected_min,
          'grace_multiplier',            grace_mult,
          'suspected_cause',             'Function has NEVER emitted a heartbeat in the last ' || (expected_min * 3) || ' minutes. Check function deployment + verify_jwt config + cron schedule.'
        )
      );
      stale_count := stale_count + 1;
    ELSE
      gap_seconds := EXTRACT(EPOCH FROM (NOW() - last_start))::integer;
      IF gap_seconds > threshold_sec THEN
        INSERT INTO public.infrastructure_events (source, event_type, severity, payload)
        VALUES (
          'heartbeat-audit',
          'stale_edge_invocation',
          'critical',
          jsonb_build_object(
            'function',                fn_slug,
            'last_invocation_start',   last_start,
            'gap_seconds',             gap_seconds,
            'threshold_seconds',       threshold_sec,
            'expected_within_minutes', expected_min,
            'grace_multiplier',        grace_mult,
            'suspected_cause',         'Function has not reported a heartbeat within ' || threshold_sec || ' seconds. Likely causes: (a) pg_cron/Vercel-cron scheduler stopped invoking; (b) function verify_jwt/auth config regressed after deploy (see runbook gotcha #8); (c) app.settings GUC / Vault secret dropped; (d) function crashing before heartbeat.'
          )
        );
        stale_count := stale_count + 1;
      END IF;
    END IF;
  END LOOP;

  -- Self-heartbeat: watchman-of-the-watchman. If this insert stops
  -- appearing for >15 min, a second BetterStack rule fires.
  INSERT INTO public.infrastructure_events (source, event_type, severity, payload)
  VALUES (
    'heartbeat-audit',
    'audit.ran',
    'info',
    jsonb_build_object(
      'checked_count',      checked_count,
      'stale_count',        stale_count,
      'duration_ms',        EXTRACT(EPOCH FROM (clock_timestamp() - audit_started_at))::integer * 1000
    )
  );
END;
$FUNC$;

REVOKE ALL ON FUNCTION public.heartbeat_audit() FROM public;

-- ─────────────────────────────────────────────────────────────────────────
-- Schedule the audit
-- ─────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  PERFORM cron.unschedule('heartbeat-audit-5min');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'heartbeat-audit-5min',
  '*/5 * * * *',
  $$SELECT public.heartbeat_audit();$$
);

-- ─────────────────────────────────────────────────────────────────────────
-- Post-apply verification (Platform runbook)
-- ─────────────────────────────────────────────────────────────────────────
--
-- Confirm cron scheduled:
--   SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'heartbeat-audit-5min';
--
-- Fire manually to smoke:
--   SELECT public.heartbeat_audit();
--   SELECT event_type, severity, payload FROM public.infrastructure_events
--   WHERE source = 'heartbeat-audit' AND created_at > NOW() - INTERVAL '30 seconds'
--   ORDER BY created_at DESC;
--   -- Expected: at least one `audit.ran` info row.
--   -- On FRESH deploy (before edge fns have emitted any heartbeats), expect
--   -- 5 `stale_edge_invocation` critical rows too — one per tracked function.
--   -- These will clear on the next natural cron tick of each function.
--
-- BetterStack rule wire-up: see docs/OBSERVABILITY_HEARTBEAT.md
--
-- ─────────────────────────────────────────────────────────────────────────
-- Future migration to a real cadence table (NOT applied here):
-- ─────────────────────────────────────────────────────────────────────────
-- CREATE TABLE public.edge_function_cadence (
--   function_slug              text PRIMARY KEY,
--   expected_interval_minutes  integer NOT NULL CHECK (expected_interval_minutes > 0),
--   grace_multiplier           numeric NOT NULL DEFAULT 1.5 CHECK (grace_multiplier >= 1.0),
--   notes                      text,
--   updated_at                 timestamptz NOT NULL DEFAULT NOW()
-- );
-- Rewrite heartbeat_audit() to `FOR ... IN SELECT ... FROM public.edge_function_cadence LOOP`.
-- Mechanical port; do only if functions are added frequently.
