ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS work_mode        text[]   NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS job_type         text[]   NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS salary_min       integer,
  ADD COLUMN IF NOT EXISTS salary_max       integer,
  ADD COLUMN IF NOT EXISTS min_fit_score    integer  NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS search_mode      text     NOT NULL DEFAULT 'balanced',
  ADD COLUMN IF NOT EXISTS location_country text,
  ADD COLUMN IF NOT EXISTS location_state   text,
  ADD COLUMN IF NOT EXISTS location_city    text,
  ADD COLUMN IF NOT EXISTS career_levels    text[]   NOT NULL DEFAULT '{}';
