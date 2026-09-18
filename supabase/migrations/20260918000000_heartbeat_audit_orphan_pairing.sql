-- ═════════════════════════════════════════════════════════════════════════
-- heartbeat_audit() — close the start/complete pairing blind spot
-- ═════════════════════════════════════════════════════════════════════════
--
-- WHAT WAS WRONG
--   20260813040000_heartbeat_audit_pgcron.sql set up a dual heartbeat:
--   `invocation.start` on entry, `invocation.complete` on exit, sharing an
--   `invocation_id` so the two can be paired. Its own header says that
--   pairing is the point — start distinguishes "not invoked" from
--   "invoked", complete distinguishes "invoked but crashing" from "invoked
--   and healthy".
--
--   The audit only ever implemented the first half. It selects
--     MAX(created_at) ... WHERE event_type = 'invocation.start'
--   and alerts when the gap since that start exceeds the cadence threshold.
--   It never looks at `invocation.complete` at all. The `invocation_id`
--   that exists specifically to pair the two events is never read.
--
--   So a function that starts exactly on schedule and then dies every single
--   time looks perfectly healthy. That is not hypothetical: ingest-ats-direct
--   ran that way for WEEKS before v23 — a start every 4h, zero completes —
--   while this audit reported 72/72 runs and ZERO stale alerts the whole
--   time. "0 stale alerts" only ever meant "something started recently".
--   The monitoring could not see the outage it was built to catch.
--
-- WHAT THIS CHANGES
--   Adds a second, independent check per function: take the most recent
--   `invocation.start`, and if it is older than the orphan grace window and
--   has no `invocation.complete` carrying the same `invocation_id`, raise a
--   critical `stale_edge_invocation`.
--
--   Check 1 (unchanged) answers "did it start?". Check 2 answers "did it
--   finish?". Both are needed; neither implies the other.
--
-- WHY 600 SECONDS OF GRACE
--   Long enough that a still-running invocation is never mistaken for a dead
--   one, short enough to catch a failure inside one 4h cadence. Observed
--   per-link durations are 16-72s for enrich-jobs and roughly 100-130s for
--   ingest-ats-direct, so 600s is ~5x the slowest link seen and ~1/24th of
--   the shortest cadence. Chained functions log one start/complete pair per
--   link, so this measures a single link, not the whole chain.
--
-- WHY IT ALERTS ONCE PER ORPHAN, NOT ONCE PER AUDIT
--   The audit runs every 5 minutes and an orphan persists until the next
--   scheduled start, so a naive implementation would emit ~48 identical
--   criticals over a 4h window. The insert is guarded on whether an alert
--   already names that `invocation_id`, so each orphaned invocation produces
--   exactly one row and the alert count stays meaningful.
--
-- VALIDATED AGAINST PRODUCTION DATA (read-only, 2026-09-18)
--   False positives — the Check-2 predicate evaluated against the current
--   latest start of all five functions: 0 alerts. Every one is pairable and
--   has its matching complete, including cleanup-dead-jobs at 19.7h since
--   its last start, which is healthy for a daily job and must stay quiet.
--
--   True positives — back-testing the predicate over 14 days found 46
--   orphaned starts, every one of them ingest-ats-direct:
--     2026-09-09 04:00 ... 2026-09-14 16:00   43 orphans, often 2 per 4h
--                                             slot, i.e. EVERY run failing
--     (v23 deployed 2026-09-14 ~19:14Z)
--     2026-09-16 20:00                        1 orphan, isolated
--   Across that entire window the audit reported 72/72 healthy runs and
--   raised zero alerts, because every one of those failing runs did start.
--   The new check would have fired on 2026-09-09, not weeks later via an
--   unrelated signal. This is the blind spot, measured.
--
-- COMPATIBILITY
--   Payload changes are additive only. Existing keys keep their names and
--   meanings, so anything already reading these events — BetterStack rules
--   included — keeps working. New keys: `check` on every
--   `stale_edge_invocation` (either 'stale_start' or 'orphaned_start'),
--   `orphaned_invocation_id` on the new alert, and `orphan_alerts_raised`
--   on `audit.ran`.
--
--   The cron schedule, the function's name, signature, security context and
--   search_path are all unchanged. This is a body replacement only.
-- ═════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.heartbeat_audit()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  audit_started_at     timestamptz := clock_timestamp();
  stale_count          integer     := 0;
  orphan_alerts_raised integer     := 0;
  checked_count        integer     := 0;
  fn_slug              text;
  expected_min         integer;
  grace_mult           numeric;
  last_start           timestamptz;
  gap_seconds          integer;
  threshold_sec        integer;

  -- Check 2 state. Deliberately separate from `last_start`: check 1 looks
  -- only inside a bounded recency window, check 2 needs the latest start
  -- whenever it happened.
  latest_start         timestamptz;
  latest_inv_id        text;
  orphan_age_sec       integer;
  orphan_grace_sec     constant integer := 600;
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

    -- ── Check 1: did it start recently enough? (unchanged behaviour) ──────
    SELECT MAX(created_at) INTO last_start
    FROM public.infrastructure_events
    WHERE source     = 'edge-fn.' || fn_slug
      AND event_type = 'invocation.start'
      AND created_at > NOW() - (expected_min || ' minutes')::interval * 3;

    IF last_start IS NULL THEN
      INSERT INTO public.infrastructure_events (source, event_type, severity, payload)
      VALUES ('heartbeat-audit', 'stale_edge_invocation', 'critical',
        jsonb_build_object(
          'check', 'stale_start',
          'function', fn_slug,
          'last_invocation_start', null,
          'expected_within_minutes', expected_min,
          'grace_multiplier', grace_mult,
          'suspected_cause', 'Function has NEVER emitted a heartbeat in the last ' || (expected_min * 3) || ' minutes. Check function deployment + verify_jwt config + cron schedule.'
        ));
      stale_count := stale_count + 1;
    ELSE
      gap_seconds := EXTRACT(EPOCH FROM (NOW() - last_start))::integer;
      IF gap_seconds > threshold_sec THEN
        INSERT INTO public.infrastructure_events (source, event_type, severity, payload)
        VALUES ('heartbeat-audit', 'stale_edge_invocation', 'critical',
          jsonb_build_object(
            'check', 'stale_start',
            'function', fn_slug,
            'last_invocation_start', last_start,
            'gap_seconds', gap_seconds,
            'threshold_seconds', threshold_sec,
            'expected_within_minutes', expected_min,
            'grace_multiplier', grace_mult,
            'suspected_cause', 'Function has not reported a heartbeat within ' || threshold_sec || ' seconds. Likely causes: (a) pg_cron/Vercel-cron scheduler stopped invoking; (b) function verify_jwt/auth config regressed after deploy (see runbook gotcha #8); (c) app.settings GUC / Vault secret dropped; (d) function crashing before heartbeat.'
          ));
        stale_count := stale_count + 1;
      END IF;
    END IF;

    -- ── Check 2 (NEW): did the most recent start ever finish? ─────────────
    SELECT created_at, payload->>'invocation_id'
      INTO latest_start, latest_inv_id
    FROM public.infrastructure_events
    WHERE source     = 'edge-fn.' || fn_slug
      AND event_type = 'invocation.start'
    ORDER BY created_at DESC
    LIMIT 1;

    -- Rows predating the invocation_id convention cannot be paired; skip
    -- them rather than reporting an orphan we cannot actually substantiate.
    IF latest_inv_id IS NOT NULL THEN
      orphan_age_sec := EXTRACT(EPOCH FROM (NOW() - latest_start))::integer;

      IF orphan_age_sec > orphan_grace_sec
         AND NOT EXISTS (
           SELECT 1 FROM public.infrastructure_events
           WHERE source     = 'edge-fn.' || fn_slug
             AND event_type = 'invocation.complete'
             AND payload->>'invocation_id' = latest_inv_id
         )
         -- One alert per orphaned invocation, not one per 5-minute audit.
         AND NOT EXISTS (
           SELECT 1 FROM public.infrastructure_events
           WHERE source     = 'heartbeat-audit'
             AND event_type = 'stale_edge_invocation'
             AND payload->>'orphaned_invocation_id' = latest_inv_id
         )
      THEN
        INSERT INTO public.infrastructure_events (source, event_type, severity, payload)
        VALUES ('heartbeat-audit', 'stale_edge_invocation', 'critical',
          jsonb_build_object(
            'check', 'orphaned_start',
            'function', fn_slug,
            'orphaned_invocation_id', latest_inv_id,
            'last_invocation_start', latest_start,
            'orphan_age_seconds', orphan_age_sec,
            'orphan_grace_seconds', orphan_grace_sec,
            'suspected_cause', 'Function STARTED but never emitted invocation.complete for this invocation_id after ' || orphan_age_sec || ' seconds. The scheduler and auth are fine — the function itself is failing mid-run. Likely causes: (a) unhandled exception after the start heartbeat; (b) wall-clock or memory limit hit mid-run; (c) an awaited call hanging until the runtime killed it. Check the edge function logs for this invocation_id.'
          ));
        orphan_alerts_raised := orphan_alerts_raised + 1;
      END IF;
    END IF;
  END LOOP;

  -- Self-heartbeat (watchman-of-the-watchman)
  INSERT INTO public.infrastructure_events (source, event_type, severity, payload)
  VALUES ('heartbeat-audit', 'audit.ran', 'info',
    jsonb_build_object(
      'checked_count', checked_count,
      'stale_count',   stale_count,
      'orphan_alerts_raised', orphan_alerts_raised,
      'duration_ms',   EXTRACT(EPOCH FROM (clock_timestamp() - audit_started_at))::integer * 1000
    ));
END;
$function$;
