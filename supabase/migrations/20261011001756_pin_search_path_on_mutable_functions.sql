-- Applied to prod (kuneabeiwcxavvyyfjkx) 2026-10-11 00:17:56 UTC via Supabase MCP.
-- Supabase security advisor 0011 (function_search_path_mutable): a SECURITY
-- DEFINER function without a pinned search_path can be hijacked by a caller
-- who puts a same-named object in an earlier schema.
ALTER FUNCTION public.generate_ticket_number() SET search_path = public, pg_temp;
ALTER FUNCTION public.check_registration_mode() SET search_path = public, pg_temp;
ALTER FUNCTION public.set_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_job_alert_subscriptions_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_job_offers_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_email_preferences_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_support_tickets_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.notify_support_resolver() SET search_path = public, pg_temp;
ALTER FUNCTION public.notify_support_action_runner() SET search_path = public, pg_temp;
ALTER FUNCTION public.employer_profiles_set_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.sync_job_posting_to_opportunities() SET search_path = public, pg_temp;
ALTER FUNCTION public.ats_jobs_preserve_description() SET search_path = public, pg_temp;
ALTER FUNCTION public.ats_jobs_set_needs_description() SET search_path = public, pg_temp;
