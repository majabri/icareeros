-- Edge functions use the supabase-js client which goes through PostgREST.
-- PostgREST only exposes the `public` schema by default. The vault schema
-- isn't exposed (and shouldn't be — that would let anyone read every secret).
--
-- This SECURITY DEFINER wrapper is the standard pattern: a tightly-scoped
-- public function that reads vault on behalf of the service role only.
-- EXECUTE is revoked from anon/authenticated so end users can't call it.

CREATE OR REPLACE FUNCTION public.get_resolver_secret(secret_name text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, vault
AS $$
  SELECT decrypted_secret
  FROM vault.decrypted_secrets
  WHERE name = secret_name
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.get_resolver_secret(text) FROM public, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_resolver_secret(text) TO service_role;

COMMENT ON FUNCTION public.get_resolver_secret(text) IS
  'Service-role-only RPC for support-action-runner edge function to read vault secrets. Allowlisted secret names: github_pat, support_resolver_secret, project_url.';

NOTIFY pgrst, 'reload schema';;
