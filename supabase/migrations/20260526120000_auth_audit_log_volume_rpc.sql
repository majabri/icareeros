-- T-018 (Sprint 3, 2026-05-26) — RPC support for the auth-silence health probe.
--
-- The health-check cron in src/app/api/cron/health-check/route.ts needs to
-- read auth.audit_log_entries to detect the "auth pipeline is silent on a
-- live site" failure mode that defined the 2026-05-24 lockout. PostgREST
-- only exposes the `public` schema by default, so we publish a tight
-- SECURITY DEFINER wrapper.
--
-- Returns a JSON blob with the two counts the cron needs:
--   { recent_count, lifetime_count, last_event_at }
--
-- "Recent" defaults to 2 hours, "lifetime" to 7 days. The probe fires a
-- critical alert when recent_count = 0 AND lifetime_count > 0 — meaning
-- the project has historically had traffic but is silent right now,
-- which is the signature of the rate-limit cascade.
--
-- See ADR-005 + memory `incident_2026-05-24_auth_lockout_root_cause`.

create or replace function public.auth_audit_log_volume(
  p_recent_interval   interval default interval '2 hours',
  p_lifetime_interval interval default interval '7 days'
)
returns jsonb
language sql
security definer
set search_path = public, auth
as $$
  select jsonb_build_object(
    'recent_count',   (
      select count(*) from auth.audit_log_entries
      where created_at > now() - p_recent_interval
    ),
    'lifetime_count', (
      select count(*) from auth.audit_log_entries
      where created_at > now() - p_lifetime_interval
    ),
    'last_event_at',  (
      select max(created_at) from auth.audit_log_entries
      where created_at > now() - p_lifetime_interval
    ),
    'recent_interval',   p_recent_interval,
    'lifetime_interval', p_lifetime_interval
  );
$$;

revoke execute on function public.auth_audit_log_volume(interval, interval) from public, anon, authenticated;
grant  execute on function public.auth_audit_log_volume(interval, interval) to service_role;

comment on function public.auth_audit_log_volume(interval, interval) is
  'T-018 health-cron support: SECURITY DEFINER wrapper that returns auth.audit_log_entries volume counts. Service-role only (RLS would not apply but PostgREST does not expose auth schema). See incident_2026-05-24_auth_lockout_root_cause.';

notify pgrst, 'reload schema';
