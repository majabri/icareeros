-- Add phone column to user_profiles (applied 2026-04-30 to kuneabeiwcxavvyyfjkx)
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS phone text;
