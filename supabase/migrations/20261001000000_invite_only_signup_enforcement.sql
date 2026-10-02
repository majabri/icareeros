-- ============================================================
-- iCareerOS: Invite-only signup enforcement
-- Migration: 20261001000000_invite_only_signup_enforcement.sql
--
-- `public.invitations` and the `invite_only_enrollment` feature flag
-- already exist live (20260412000000_invite_only_enrollment.sql), but
-- nothing enforces them — the flag has been sitting enabled=true,
-- unconsulted by any app code. This migration is the enforcement layer.
--
-- Deliberately does NOT touch `public.referral_tree` or
-- `public.accept_invitation()` — referral_tree was never created in
-- this project (only in the legacy migration file under src/migrations/,
-- which predates the live schema split) and accept_invitation() depends
-- on it. Rebuilding the referral tree is out of scope; this migration
-- only needs to validate + claim an invite at account-creation time.
-- ============================================================

-- ===================
-- 1. ENFORCEMENT TRIGGER — BEFORE INSERT ON auth.users
-- ===================
-- Fires for every new account regardless of path (email/password signUp,
-- or OAuth — Supabase Auth inserts into auth.users during the token
-- exchange for a brand-new OAuth identity too, so this covers both).
-- Existing users signing back in never hit INSERT, so this only ever
-- gates NEW account creation.
CREATE OR REPLACE FUNCTION public.enforce_invite_only_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled     BOOLEAN;
  v_code        TEXT;
  v_invitation  RECORD;
BEGIN
  SELECT enabled INTO v_enabled
  FROM public.feature_flags
  WHERE key = 'invite_only_enrollment';

  -- Flag missing or explicitly off → open signup, unchanged behavior.
  IF v_enabled IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  v_code := UPPER(TRIM(NEW.raw_user_meta_data ->> 'invite_code'));

  IF v_code IS NULL OR v_code = '' THEN
    RAISE EXCEPTION 'invite_required'
      USING HINT = 'An invite code is required to create an account.';
  END IF;

  SELECT * INTO v_invitation
  FROM public.invitations
  WHERE invite_code = v_code
    AND invite_type = 'code'
  FOR UPDATE;

  IF v_invitation IS NULL THEN
    RAISE EXCEPTION 'invite_invalid'
      USING HINT = 'That invite code was not found.';
  END IF;

  IF v_invitation.status <> 'pending' THEN
    RAISE EXCEPTION 'invite_already_used'
      USING HINT = 'That invite code has already been used.';
  END IF;

  IF v_invitation.expires_at < now() THEN
    UPDATE public.invitations SET status = 'expired' WHERE id = v_invitation.id;
    RAISE EXCEPTION 'invite_expired'
      USING HINT = 'That invite code has expired.';
  END IF;

  -- Claim it inline (no referral_tree write — see header note).
  UPDATE public.invitations
  SET status = 'accepted',
      accepted_by = NEW.id,
      accepted_at = now()
  WHERE id = v_invitation.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_invite_only_signup_trigger ON auth.users;
CREATE TRIGGER enforce_invite_only_signup_trigger
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_invite_only_signup();

-- ===================
-- 2. RPC — validate a code before signup (client-side UX only;
--    the trigger above is the real gate, this just avoids surfacing
--    opaque GoTrue "Database error saving new user" messages for the
--    common case of a bad/used code).
-- ===================
CREATE OR REPLACE FUNCTION public.validate_invite_code(p_code TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invitation RECORD;
BEGIN
  SELECT * INTO v_invitation
  FROM public.invitations
  WHERE invite_code = UPPER(TRIM(p_code))
    AND invite_type = 'code';

  IF v_invitation IS NULL THEN
    RETURN json_build_object('valid', false, 'reason', 'not_found');
  END IF;

  IF v_invitation.status <> 'pending' THEN
    RETURN json_build_object('valid', false, 'reason', 'already_used');
  END IF;

  IF v_invitation.expires_at < now() THEN
    RETURN json_build_object('valid', false, 'reason', 'expired');
  END IF;

  RETURN json_build_object('valid', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_invite_code(TEXT) TO anon, authenticated;

-- ===================
-- 3. RPC — existing users generate a code for someone they want to invite.
--    Reuses check_and_increment_invite_limit() (live, no referral_tree
--    dependency) for the 5/day cap.
-- ===================
CREATE OR REPLACE FUNCTION public.create_invite_code()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id       UUID := auth.uid();
  v_limit_check   JSON;
  v_code          TEXT;
  v_token         TEXT;
  v_invitation_id UUID;
  v_expires_at    TIMESTAMPTZ;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  v_limit_check := public.check_and_increment_invite_limit(v_user_id);
  IF NOT (v_limit_check ->> 'allowed')::boolean THEN
    RETURN json_build_object(
      'success', false,
      'error', 'daily_limit_reached',
      'resets_at', v_limit_check ->> 'resets_at'
    );
  END IF;

  v_code  := UPPER(SUBSTR(MD5(gen_random_uuid()::text), 1, 8));
  v_token := MD5(gen_random_uuid()::text) || MD5(gen_random_uuid()::text);

  INSERT INTO public.invitations (inviter_id, invite_type, invite_code, token, status)
  VALUES (v_user_id, 'code', v_code, v_token, 'pending')
  RETURNING id, expires_at INTO v_invitation_id, v_expires_at;

  RETURN json_build_object(
    'success', true,
    'invite_code', v_code,
    'invitation_id', v_invitation_id,
    'expires_at', v_expires_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_invite_code() TO authenticated;
