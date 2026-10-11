-- Applied to prod (kuneabeiwcxavvyyfjkx) 2026-10-11 00:18:29 UTC via Supabase MCP.
--
-- Supabase security advisors 0028/0029: SECURITY DEFINER functions reachable
-- at /rest/v1/rpc/<name> by the anon role. The anon key ships in the browser
-- bundle, so these were callable by anyone visiting the site.
--
-- IMPORTANT: Postgres grants EXECUTE to PUBLIC by default on every function.
-- anon and authenticated INHERIT that grant, so
--   REVOKE EXECUTE ... FROM anon, authenticated;
-- is a silent no-op -- it reports success and changes nothing. The revoke must
-- target PUBLIC, with explicit grants back to the roles that genuinely call
-- each function. (Verified with has_function_privilege() before and after.)

-- Dead at the time of writing; see the follow-up migration for the two that
-- turned out to belong to an in-flight feature.
REVOKE EXECUTE ON FUNCTION public.create_invite_code()        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_invite_code(text)  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_registration_mode()   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.resolve_admin_email(text)   FROM PUBLIC, anon, authenticated;

-- Called only by service_role edge functions (cleanup-dead-jobs) / pg_cron.
REVOKE EXECUTE ON FUNCTION public.cleanup_orphaned_recommendations() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.cleanup_orphaned_recommendations() TO service_role;
REVOKE EXECUTE ON FUNCTION public.heartbeat_audit() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.heartbeat_audit() TO service_role;

-- Trigger functions: fired by the table owner; callers never need EXECUTE.
REVOKE EXECUTE ON FUNCTION public.handle_new_user()                   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_role()              FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_subscription()      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_invite_only_signup()        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_support_resolver()           FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_support_action_runner()      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_job_posting_to_opportunities() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_user_curation_refresh()     FROM PUBLIC, anon, authenticated;

-- Called server-side with the user's own session (accept-offer route), so
-- authenticated keeps EXECUTE. anon must not have it: the function takes
-- p_user_id, making anon access a horizontal privilege escalation.
REVOKE EXECUTE ON FUNCTION public.complete_cycle_and_start_next(uuid, uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.complete_cycle_and_start_next(uuid, uuid, text) TO authenticated, service_role;

-- NOTE: public.has_role(uuid, app_role) is deliberately untouched. RLS policies
-- (e.g. the feature_flags admin-write policy) call it during policy evaluation;
-- revoking EXECUTE from authenticated would break those policies.
