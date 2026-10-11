-- Applied to prod (kuneabeiwcxavvyyfjkx) 2026-10-11 00:26:22 UTC via Supabase MCP.
--
-- CORRECTION to 20261011001829.
--
-- That migration revoked EXECUTE on the invite RPCs after a code audit found
-- zero references to them. The audit ran against main@29ed616, which predates
-- migration 20261010201152 (invite_only_signup_rpcs, applied 2026-10-10 20:11
-- UTC) -- the database half of an in-flight invite-only signup feature whose
-- application code is not merged yet. The functions are live and intentionally
-- reachable; they were not dead code.
--
-- Lesson for future audits: "no references in the repo" is not sufficient
-- evidence that a database object is unused. Check schema_migrations for
-- recent DDL that application code has not caught up to yet.
--
-- This restores exactly the two grants 20261010201152 declared, and no more.
-- create_invite_code is NOT re-granted to anon: it self-guards on auth.uid()
-- and returns not_authenticated, so anon access was never meaningful.

GRANT EXECUTE ON FUNCTION public.validate_invite_code(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_invite_code() TO authenticated;
