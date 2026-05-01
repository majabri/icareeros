ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS work_experience  jsonb    NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS education        jsonb    NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS certifications   text[]   NOT NULL DEFAULT '{}';
