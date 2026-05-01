-- Set user_id default to auth.uid() so inserts without explicit user_id
-- are automatically scoped to the authenticated user, satisfying RLS.
ALTER TABLE public.resume_versions
  ALTER COLUMN user_id SET DEFAULT auth.uid();
