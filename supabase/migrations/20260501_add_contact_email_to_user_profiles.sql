-- Add contact_email to user_profiles so the email shown on the profile page
-- comes from the resume parse, not from the Supabase auth account.
-- This allows the resume email (e.g. personal) to differ from the login email.
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS contact_email text;

COMMENT ON COLUMN public.user_profiles.contact_email IS
  'Email address extracted from the user''s resume. May differ from the Supabase auth account email.';
