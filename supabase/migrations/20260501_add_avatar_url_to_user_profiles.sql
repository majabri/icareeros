-- Profile photo URL (stored in the public 'avatars' storage bucket)
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS avatar_url text;

COMMENT ON COLUMN public.user_profiles.avatar_url IS
  'Public URL of the user profile photo, stored in storage bucket avatars/{user_id}/avatar.*';

-- Storage RLS policies for the avatars bucket
-- (applied directly via execute_sql on 2026-05-01 — recorded here for auditability)
-- CREATE POLICY "Users can upload own avatar"  ON storage.objects FOR INSERT TO authenticated
--   WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
-- CREATE POLICY "Users can update own avatar"  ON storage.objects FOR UPDATE TO authenticated
--   USING  (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
-- CREATE POLICY "Users can delete own avatar"  ON storage.objects FOR DELETE TO authenticated
--   USING  (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
-- CREATE POLICY "Public avatar read"           ON storage.objects FOR SELECT TO public
--   USING  (bucket_id = 'avatars');
