-- Fix heartbeat_audit source lookup drift and resolve recent false positives.
--
-- Observed 2026-08-27: prod heartbeat-audit emitted stale_edge_invocation
-- criticals with payload.last_invocation_start = null even while matching
-- invocation.start rows existed for sources like `edge-fn.enrich-jobs`.
-- The checked-in 20260813040000 migration already documents the canonical
-- `edge-fn.<slug>` source format, but prod behavior shows the deployed lookup
-- drifted or historical rows are mixed. Make the audit tolerant of both the
-- canonical `edge-fn.<slug>` namespace and bare `<slug>` rows, then auto-
-- resolve the recent null-start false positives that had a live heartbeat
-- in-window.

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
  FOR fn_slug, expected_min, grace_mult IN
    SELECT * FROM (VALUES
      ('enrich-jobs',                    240, 1.5),
      ('curate-user-recommendations',   1440, 1.5),
      ('cleanup-dead-jobs',             1440, 1.5),
      ('validate-job-urls',             1440, 1.5),
      ('ingest-ats-direct',              240, 1.5)
    ) AS t(slug, expected_interval_minutes, grace_multiplier)
  LOOP
    checked_count := checked_count + 1;
    threshold_sec := (expected_min * 60 * grace_mult)::integer;

    SELECT MAX(created_at) INTO last_start
    FROM public.infrastructure_events
    WHERE source = ANY (ARRAY['edge-fn.' || fn_slug, fn_slug])
      AND event_type = 'invocation.start'
      AND created_at > NOW() - (expected_min || ' minutes')::interval * 3;

    IF last_start IS NULL THEN
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

  INSERT INTO public.infrastructure_events (source, event_type, severity, payload)
  VALUES (
    'heartbeat-audit',
    'audit.ran',
    'info',
    jsonb_build_object(
      'checked_count',      checked_count,
      'stale_count',        stale_count,
     'duration_ms',        (EXTRACT(EPOCH FROM (clock_timestamp() - audit_started_at)) * 1000)::integer
    )
  );
END;
$FUNC$;

WITH tracked_functions(function_slug, expected_interval_minutes) AS (
  VALUES
    ('enrich-jobs', 240),
    ('curate-user-recommendations', 1440),
    ('cleanup-dead-jobs', 1440),
    ('validate-job-urls', 1440),
    ('ingest-ats-direct', 240)
),
false_positives AS (
  SELECT ie.id
  FROM public.infrastructure_events ie
  JOIN tracked_functions tf
    ON ie.payload->>'function' = tf.function_slug
  WHERE ie.source = 'heartbeat-audit'
    AND ie.event_type = 'stale_edge_invocation'
    AND ie.severity = 'critical'
    AND ie.resolved_at IS NULL
    AND ie.created_at >= NOW() - INTERVAL '72 hours'
    AND COALESCE(ie.payload->>'last_invocation_start', '') = ''
    AND EXISTS (
      SELECT 1
      FROM public.infrastructure_events hb
      WHERE hb.source = ANY (ARRAY['edge-fn.' || tf.function_slug, tf.function_slug])
        AND hb.event_type = 'invocation.start'
        AND hb.created_at <= ie.created_at
        AND hb.created_at > ie.created_at - (tf.expected_interval_minutes || ' minutes')::interval * 3
    )
)
UPDATE public.infrastructure_events ie
SET resolved_at = NOW(),
    payload = COALESCE(ie.payload, '{}'::jsonb) || jsonb_build_object(
      'auto_resolved_reason',
      '20260827213000_heartbeat_audit_source_lookup_fix.sql resolved a false positive caused by heartbeat source lookup drift.'
    )
WHERE ie.id IN (SELECT id FROM false_positives);

-- Post-apply verification:
--   SELECT public.heartbeat_audit();
--   SELECT COUNT(*)
--   FROM public.infrastructure_events
--   WHERE source = 'heartbeat-audit'
--     AND event_type = 'stale_edge_invocation'
--     AND severity = 'critical'
--     AND created_at > NOW() - INTERVAL '15 minutes';
--   -- Expected after healthy deploy + one audit window: 0
