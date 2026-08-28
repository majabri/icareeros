ALTER TABLE user_profiles
  ADD COLUMN excluded_role_patterns text[] NOT NULL DEFAULT '{}'::text[];
