-- Add linkedin_url and summary columns to user_profiles
-- Applied 2026-04-30 to kuneabeiwcxavvyyfjkx (icareeros prod)
-- These fields are auto-filled during resume import and editable by the user.

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS linkedin_url text,
  ADD COLUMN IF NOT EXISTS summary      text;

COMMENT ON COLUMN public.user_profiles.linkedin_url IS 'LinkedIn profile URL, auto-filled from resume import';
COMMENT ON COLUMN public.user_profiles.summary      IS 'Professional summary, auto-filled from resume import';
