-- Day 10: Schema parity with azjobs (86 migrations consolidated)
-- All tables use IF NOT EXISTS guards. pg_cron calls removed.

-- ========================================
-- Source: 20260326235351_7ca7a681-fa61-4faf-9641-20e660557974.sql
-- ========================================
ALTER TABLE public.job_seeker_profiles ADD COLUMN IF NOT EXISTS linkedin_url text;

-- ========================================
-- Source: 20260330143936_6e816dae-72e0-43b6-8fbc-9d5f892dc718.sql
-- ========================================
CREATE TABLE public.ignored_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  job_title text NOT NULL DEFAULT '',
  company text NOT NULL DEFAULT '',
  job_url text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.ignored_opportunities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own ignored jobs"
  ON public.ignored_opportunities FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_ignored_opportunities_user_id ON public.ignored_opportunities (user_id);

-- ========================================
-- Source: 20260331000000_admin_control_center.sql
-- ========================================
-- Admin Control Center: user roles, admin settings, and admin-level read policies

-- 1. user_roles table
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'job_seeker' CHECK (role IN ('admin', 'job_seeker', 'recruiter')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Users can read their own role
CREATE POLICY "Users can read own role"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Admins can read all roles
CREATE POLICY "Admins can read all roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    )
  );

-- Admins can update roles
CREATE POLICY "Admins can update roles"
  ON public.user_roles FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    )
  );

-- Admins can insert roles
CREATE POLICY "Admins can insert roles"
  ON public.user_roles FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    )
  );

-- Auto-create role entry on user signup (triggers new row with default 'job_seeker')
CREATE OR REPLACE FUNCTION public.handle_new_user_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'job_seeker')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created_role
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_role();

-- 2. admin_settings table (platform-wide feature flags and config)
CREATE TABLE public.admin_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value jsonb NOT NULL DEFAULT 'null'::jsonb,
  description text,
  updated_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;

-- Only admins can read/write settings
CREATE POLICY "Admins can manage settings"
  ON public.admin_settings FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    )
  );

-- Seed default admin settings
INSERT INTO public.admin_settings (key, value, description) VALUES
  ('auto_apply_enabled', 'true'::jsonb, 'Allow users to use auto-apply feature'),
  ('max_daily_applications', '50'::jsonb, 'Platform-wide daily application cap per user'),
  ('default_match_threshold', '70'::jsonb, 'Default match threshold for new users'),
  ('job_discovery_enabled', 'true'::jsonb, 'Enable job discovery agent'),
  ('ai_model', '"gpt-4o-mini"'::jsonb, 'AI model used for analysis'),
  ('maintenance_mode', 'false'::jsonb, 'Put platform in maintenance mode'),
  ('new_user_registration', 'true'::jsonb, 'Allow new user registrations'),
  ('max_resume_versions', '10'::jsonb, 'Maximum resume versions per user')
ON CONFLICT (key) DO NOTHING;

-- 3. Admin read policies for existing tables

-- job_seeker_profiles: admins can read all
CREATE POLICY "Admins can read all profiles"
  ON public.job_seeker_profiles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    )
  );

-- agent_runs: admins can read all
CREATE POLICY "Admins can read all agent runs"
  ON public.agent_runs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    )
  );

-- analysis_history: admins can read all
CREATE POLICY "Admins can read all analysis history"
  ON public.analysis_history FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    )
  );

-- job_applications: admins can read all
CREATE POLICY "Admins can read all applications"
  ON public.job_applications FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    )
  );

-- scraped_jobs: admins can read all (already has service_role policy)
CREATE POLICY "Admins can read all scraped jobs"
  ON public.scraped_jobs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    )
  );

-- Index for fast role lookups
CREATE INDEX idx_user_roles_user_id ON public.user_roles (user_id);
CREATE INDEX idx_user_roles_role ON public.user_roles (role);
CREATE INDEX idx_admin_settings_key ON public.admin_settings (key);

-- ========================================
-- Source: 20260331000100_admin_hiring_manager_policies.sql
-- ========================================
-- Admin read policies for hiring manager tables

-- job_postings: admins can read all
CREATE POLICY "Admins can read all job postings"
  ON public.job_postings FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    )
  );

-- interview_schedules: admins can read all
CREATE POLICY "Admins can read all interview schedules"
  ON public.interview_schedules FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    )
  );

-- ========================================
-- Source: 20260331033821_97b9c360-25c8-49dd-b8c5-d7a7248c1617.sql
-- ========================================
-- Create app_role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

-- Enable RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Users can read their own roles
CREATE POLICY "Users can read own roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Admins can manage all roles
CREATE POLICY "Admins can manage roles"
  ON public.user_roles FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles viewable by owner"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', '')
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Auto-assign admin role to admin@amirjabri.com
CREATE OR REPLACE FUNCTION public.handle_first_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_email TEXT;
BEGIN
  SELECT email INTO user_email FROM auth.users WHERE id = NEW.user_id;
  IF user_email = 'admin@amirjabri.com' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.user_id, 'admin')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_first_admin_assignment
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_first_admin();

-- ========================================
-- Source: 20260331035217_add_username_admin_user_management.sql
-- ========================================
-- Add username and email columns to profiles for username-based login
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username text UNIQUE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;
CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles (username);

-- Allow admins to read all profiles (for username lookup during login and user listing)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND policyname = 'Admins can read all profiles'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Admins can read all profiles"
        ON public.profiles FOR SELECT
        TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
          )
        )
    $policy$;
  END IF;
END
$$;

-- Allow admins to delete user roles (needed when removing a user)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_roles'
      AND policyname = 'Admins can delete roles'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Admins can delete roles"
        ON public.user_roles FOR DELETE
        TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
          )
        )
    $policy$;
  END IF;
END
$$;

-- Allow admins to delete job_seeker_profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'job_seeker_profiles'
      AND policyname = 'Admins can delete profiles'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Admins can delete profiles"
        ON public.job_seeker_profiles FOR DELETE
        TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
          )
        )
    $policy$;
  END IF;
END
$$;

-- Allow lookup of profile by username for unauthenticated login resolution
-- (needed so the login page can look up email by username before signing in)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND policyname = 'Allow username lookup for login'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Allow username lookup for login"
        ON public.profiles FOR SELECT
        TO anon
        USING (username IS NOT NULL)
    $policy$;
  END IF;
END
$$;

-- ========================================
-- Source: 20260331050000_phone_column_and_admin_username_merge.sql
-- ========================================
-- Add phone column to profiles for user contact info
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone text;

-- Update handle_first_admin trigger function to also set username='admin'
-- for admin@amirjabri.com so both the email and username resolve to the same user
CREATE OR REPLACE FUNCTION public.handle_first_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_email TEXT;
BEGIN
  SELECT email INTO user_email FROM auth.users WHERE id = NEW.user_id;
  IF user_email = 'admin@amirjabri.com' THEN
    -- Assign admin role
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.user_id, 'admin')
    ON CONFLICT DO NOTHING;

    -- Merge: set username='admin' so logging in with either
    -- username "admin" or email "admin@amirjabri.com" resolves to the same account.
    -- Only set if no other profile already claims the "admin" username.
    UPDATE public.profiles
    SET username = 'admin', email = 'admin@amirjabri.com'
    WHERE user_id = NEW.user_id
      AND NOT EXISTS (
        SELECT 1 FROM public.profiles p2
        WHERE p2.username = 'admin' AND p2.user_id != NEW.user_id
      );
  END IF;
  RETURN NEW;
END;
$$;

-- Backfill: set username='admin' for any existing admin@amirjabri.com profile
-- that does not yet have a username, as long as no other user owns 'admin'.
UPDATE public.profiles p
SET username = 'admin', email = 'admin@amirjabri.com'
FROM auth.users u
WHERE u.id = p.user_id
  AND u.email = 'admin@amirjabri.com'
  AND (p.username IS NULL OR p.username = '')
  AND NOT EXISTS (
    SELECT 1 FROM public.profiles p2
    WHERE p2.username = 'admin' AND p2.user_id != p.user_id
  );

-- ========================================
-- Source: 20260331051206_b708a951-9550-42af-a7b3-f610050a1288.sql
-- ========================================
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone text;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_unique ON public.profiles (username) WHERE username IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_user_id_unique ON public.profiles (user_id);

-- ========================================
-- Source: 20260331062000_fix_admin_login_and_self_delete.sql
-- ========================================
-- Fix admin login issues and prepare for self-delete feature

-- 1. Update handle_new_user trigger to populate the email field from auth.users.
--    Previously it only set full_name and avatar_url, leaving email NULL which
--    caused username-based login to fail ("No account found for that username").
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, avatar_url, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', ''),
    NEW.email
  );
  RETURN NEW;
END;
$$;

-- 2. Backfill email for all existing profiles that currently have a NULL email.
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE u.id = p.user_id
  AND (p.email IS NULL OR p.email = '');

-- 3. Fix handle_first_admin trigger to use UPSERT so that the admin role is
--    properly set even when handle_new_user_role already inserted 'job_seeker'.
CREATE OR REPLACE FUNCTION public.handle_first_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_email TEXT;
BEGIN
  SELECT email INTO user_email FROM auth.users WHERE id = NEW.user_id;
  IF user_email = 'admin@amirjabri.com' THEN
    -- Upsert admin role, overriding any previously assigned default role.
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.user_id, 'admin')
    ON CONFLICT (user_id) DO UPDATE SET role = 'admin';

    -- Set username and email so admin can log in with either credential.
    UPDATE public.profiles
    SET username = 'admin', email = 'admin@amirjabri.com'
    WHERE user_id = NEW.user_id
      AND NOT EXISTS (
        SELECT 1 FROM public.profiles p2
        WHERE p2.username = 'admin' AND p2.user_id != NEW.user_id
      );
  END IF;
  RETURN NEW;
END;
$$;

-- 4. Backfill: ensure existing admin@amirjabri.com user has the correct role
--    and profile fields (idempotent).
DO $$
DECLARE
  admin_id uuid;
BEGIN
  SELECT id INTO admin_id FROM auth.users WHERE email = 'admin@amirjabri.com';
  IF admin_id IS NOT NULL THEN
    -- Ensure admin role is set.
    INSERT INTO public.user_roles (user_id, role)
    VALUES (admin_id, 'admin')
    ON CONFLICT (user_id) DO UPDATE SET role = 'admin';

    -- Ensure profile has username='admin' and email populated.
    UPDATE public.profiles
    SET username = 'admin',
        email    = 'admin@amirjabri.com'
    WHERE user_id = admin_id
      AND NOT EXISTS (
        SELECT 1 FROM public.profiles p2
        WHERE p2.username = 'admin' AND p2.user_id != admin_id
      );
  END IF;
END;
$$;

-- 5. Allow users to delete their own profile row (needed for self-delete flow
--    where the auth.users delete cascades, but also ensures the profile row is
--    removable by the service-role edge function without a policy conflict).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'profiles'
      AND policyname = 'Users can delete own profile'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Users can delete own profile"
        ON public.profiles FOR DELETE
        TO authenticated
        USING (auth.uid() = user_id)
    $policy$;
  END IF;
END
$$;

-- ========================================
-- Source: 20260331070000_merge_admin_accounts.sql
-- ========================================
-- Merge admin accounts: ensure username='admin' and email='admin@amirjabri.com'
-- belong to the same auth.users account.
--
-- Root cause: the previous backfill had a NOT EXISTS guard that prevented
-- setting username='admin' on admin@amirjabri.com when another profile already
-- held that username. This migration resolves the conflict by:
--   1. Stripping username='admin' from any profile NOT owned by admin@amirjabri.com.
--   2. Setting username='admin' and email='admin@amirjabri.com' on the correct profile.
--   3. Ensuring the admin role is upserted for the correct user.
--   4. Updating handle_first_admin so future sign-ups never hit the same conflict.

DO $$
DECLARE
  admin_id  uuid;
  conflict_id uuid;
BEGIN
  -- Find the auth.users row for admin@amirjabri.com
  SELECT id INTO admin_id FROM auth.users WHERE email = 'admin@amirjabri.com';

  IF admin_id IS NULL THEN
    RAISE NOTICE 'admin@amirjabri.com not found in auth.users – skipping merge.';
    RETURN;
  END IF;

  -- Remove username='admin' from any OTHER profile that might be holding it,
  -- and log each affected row for audit purposes.
  FOR conflict_id IN
    SELECT user_id FROM public.profiles
    WHERE username = 'admin' AND user_id != admin_id
  LOOP
    RAISE NOTICE 'Clearing username=''admin'' from conflicting profile user_id=%', conflict_id;
    UPDATE public.profiles SET username = NULL WHERE user_id = conflict_id;
  END LOOP;

  -- Set the correct profile fields
  UPDATE public.profiles
  SET username = 'admin',
      email    = 'admin@amirjabri.com'
  WHERE user_id = admin_id;

  -- Upsert admin role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (admin_id, 'admin')
  ON CONFLICT (user_id) DO UPDATE SET role = 'admin';

  RAISE NOTICE 'Admin account merged successfully for user_id=%', admin_id;
END;
$$;

-- Update handle_first_admin to forcefully claim username='admin' on new sign-ups
-- by first clearing it from any conflicting profile.
CREATE OR REPLACE FUNCTION public.handle_first_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_email  TEXT;
  conflict_id uuid;
BEGIN
  SELECT email INTO user_email FROM auth.users WHERE id = NEW.user_id;

  IF user_email = 'admin@amirjabri.com' THEN
    -- Upsert admin role, overriding any previously assigned default role.
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.user_id, 'admin')
    ON CONFLICT (user_id) DO UPDATE SET role = 'admin';

    -- Clear username='admin' from any other profile so the UNIQUE constraint
    -- won't block the assignment below, and log each affected row.
    FOR conflict_id IN
      SELECT user_id FROM public.profiles
      WHERE username = 'admin' AND user_id != NEW.user_id
    LOOP
      RAISE NOTICE 'handle_first_admin: clearing username=''admin'' from conflicting profile user_id=%', conflict_id;
      UPDATE public.profiles SET username = NULL WHERE user_id = conflict_id;
    END LOOP;

    -- Claim username='admin' for this account.
    UPDATE public.profiles
    SET username = 'admin',
        email    = 'admin@amirjabri.com'
    WHERE user_id = NEW.user_id;
  END IF;

  RETURN NEW;
END;
$$;

-- ========================================
-- Source: 20260331174518_ee0d3008-e332-4765-8d34-3af85c8ac0b0.sql
-- ========================================
CREATE OR REPLACE FUNCTION public.resolve_admin_email(_username text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.email
  FROM public.profiles p
  INNER JOIN public.user_roles r ON r.user_id = p.user_id AND r.role = 'admin'
  WHERE p.username ILIKE _username
  LIMIT 1
$$;

-- ========================================
-- Source: 20260331175719_ff431263-e3e9-41f7-909f-0ca30c9ee37b.sql
-- ========================================
-- Allow admins to view all profiles
CREATE POLICY "Admins can view all profiles"
ON public.profiles FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Allow admins to view all job_seeker_profiles
CREATE POLICY "Admins can view all job seeker profiles"
ON public.job_seeker_profiles FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Allow admins to view all job_applications
CREATE POLICY "Admins can view all applications"
ON public.job_applications FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Allow admins to view all analysis_history
CREATE POLICY "Admins can view all analyses"
ON public.analysis_history FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Allow admins to view all job_postings
CREATE POLICY "Admins can view all job postings"
ON public.job_postings FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Allow admins to view all interview_schedules
CREATE POLICY "Admins can view all interview schedules"
ON public.interview_schedules FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- ========================================
-- Source: 20260331200000_admin_control_center_v2.sql
-- ========================================
-- Admin Control Center v2: logs, queue, command audit trail

-- 1. admin_logs table for structured log streaming
CREATE TABLE IF NOT EXISTS public.admin_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp timestamptz NOT NULL DEFAULT now(),
  level text NOT NULL DEFAULT 'info' CHECK (level IN ('info', 'warn', 'error')),
  message text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  agent_id text,
  run_id uuid,
  status text CHECK (status IN ('success', 'failed', NULL)),
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can read logs
CREATE POLICY "Admins can read logs"
  ON public.admin_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    )
  );

-- System (service role) can insert logs
CREATE POLICY "Service role can insert logs"
  ON public.admin_logs FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE INDEX idx_admin_logs_timestamp ON public.admin_logs (timestamp DESC);
CREATE INDEX idx_admin_logs_level ON public.admin_logs (level);
CREATE INDEX idx_admin_logs_user_id ON public.admin_logs (user_id);
CREATE INDEX idx_admin_logs_run_id ON public.admin_logs (run_id);
CREATE INDEX idx_admin_logs_status ON public.admin_logs (status);

-- 2. job_queue table for queue visibility
CREATE TABLE IF NOT EXISTS public.job_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id text NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  type text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'failed', 'completed', 'cancelled')),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  payload jsonb DEFAULT '{}',
  result jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz
);

ALTER TABLE public.job_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage queue"
  ON public.job_queue FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    )
  );

CREATE INDEX idx_job_queue_status ON public.job_queue (status);
CREATE INDEX idx_job_queue_created_at ON public.job_queue (created_at DESC);

-- 3. admin_command_log for audit trail of console commands
CREATE TABLE IF NOT EXISTS public.admin_command_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  command text NOT NULL,
  args jsonb DEFAULT '{}',
  result jsonb,
  success boolean NOT NULL DEFAULT true,
  executed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_command_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read command log"
  ON public.admin_command_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    )
  );

CREATE POLICY "Admins can insert command log"
  ON public.admin_command_log FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    )
  );

CREATE INDEX idx_admin_command_log_admin_id ON public.admin_command_log (admin_id);
CREATE INDEX idx_admin_command_log_executed_at ON public.admin_command_log (executed_at DESC);

-- 4. Seed some sample logs from existing agent_runs (if table exists)
-- This populates logs with historical data
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'agent_runs') THEN
    INSERT INTO public.admin_logs (timestamp, level, message, user_id, run_id, status, metadata)
    SELECT
      COALESCE(started_at, created_at, now()),
      CASE
        WHEN status = 'failed' THEN 'error'
        WHEN status = 'completed_with_errors' THEN 'warn'
        ELSE 'info'
      END,
      CASE
        WHEN status = 'failed' THEN 'Agent run failed'
        WHEN status = 'completed_with_errors' THEN 'Agent run completed with errors'
        WHEN status = 'completed' THEN 'Agent run completed successfully'
        ELSE 'Agent run ' || status
      END,
      user_id,
      id,
      CASE WHEN status = 'failed' THEN 'failed' ELSE 'success' END,
      jsonb_build_object(
        'jobs_found', COALESCE(jobs_found, 0),
        'jobs_matched', COALESCE(jobs_matched, 0),
        'applications_sent', COALESCE(applications_sent, 0),
        'errors', COALESCE(errors, '[]'::text[])
      )
    FROM public.agent_runs
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- ========================================
-- Source: 20260401000000_admin_control_center_v3_audit.sql
-- ========================================
-- Admin Control Center v3: unified audit log table

-- Create a unified audit_log table that tracks user changes, admin actions, and command executions
CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL CHECK (category IN ('user_change', 'admin_action', 'command', 'agent_run', 'system')),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_label text,
  action text NOT NULL,
  target_id text,
  target_label text,
  details jsonb DEFAULT '{}',
  success boolean NOT NULL DEFAULT true,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Only admins can read audit log
CREATE POLICY "Admins can read audit log"
  ON public.audit_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    )
  );

-- Admins and service role can insert audit log entries
CREATE POLICY "Admins can insert audit log"
  ON public.audit_log FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    )
  );

CREATE POLICY "Service role can insert audit log"
  ON public.audit_log FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE INDEX idx_audit_log_created_at ON public.audit_log (created_at DESC);
CREATE INDEX idx_audit_log_category ON public.audit_log (category);
CREATE INDEX idx_audit_log_actor_id ON public.audit_log (actor_id);
CREATE INDEX idx_audit_log_action ON public.audit_log (action);

-- ========================================
-- Source: 20260401000100_fix_cascade_delete_job_seeker.sql
-- ========================================
-- Fix: add ON DELETE CASCADE foreign key constraint to job_seeker_profiles so
-- that deleting a user from auth.users automatically removes their profile row.
-- Without this, the profile row survived user deletion and the job seeker
-- continued to appear in the Admin Control Center even after being removed.

-- Step 1: Remove any orphaned rows whose auth user no longer exists.
DELETE FROM public.job_seeker_profiles
WHERE user_id NOT IN (SELECT id FROM auth.users);

-- Step 2: Add the FK constraint (idempotent – skipped if it already exists).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'job_seeker_profiles_user_id_fkey'
      AND conrelid = 'public.job_seeker_profiles'::regclass
  ) THEN
    ALTER TABLE public.job_seeker_profiles
      ADD CONSTRAINT job_seeker_profiles_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END
$$;

-- Step 3: Fix admin_settings.updated_by to use ON DELETE SET NULL so that
-- deleting an admin user doesn't violate the FK constraint.
ALTER TABLE public.admin_settings
  DROP CONSTRAINT IF EXISTS admin_settings_updated_by_fkey;

ALTER TABLE public.admin_settings
  ADD CONSTRAINT admin_settings_updated_by_fkey
  FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- ========================================
-- Source: 20260401043109_ea3cce92-8868-4d85-8f45-c1739a8add16.sql
-- ========================================
-- 1. admin_logs: structured log entries for the admin log viewer
CREATE TABLE public.admin_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  level TEXT NOT NULL DEFAULT 'info',
  message TEXT NOT NULL DEFAULT '',
  user_id UUID,
  agent_id TEXT,
  run_id UUID,
  status TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all logs"
  ON public.admin_logs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role can manage logs"
  ON public.admin_logs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Index for common filters
CREATE INDEX idx_admin_logs_timestamp ON public.admin_logs (timestamp DESC);
CREATE INDEX idx_admin_logs_level ON public.admin_logs (level);
CREATE INDEX idx_admin_logs_run_id ON public.admin_logs (run_id);

-- 2. admin_command_log: audit trail for admin console commands
CREATE TABLE public.admin_command_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id UUID NOT NULL,
  command TEXT NOT NULL,
  args JSONB DEFAULT '{}'::jsonb,
  result JSONB DEFAULT '{}'::jsonb,
  success BOOLEAN NOT NULL DEFAULT false,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_command_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view command log"
  ON public.admin_command_log FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role can manage command log"
  ON public.admin_command_log FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_admin_command_log_executed_at ON public.admin_command_log (executed_at DESC);

-- 3. job_queue: job processing queue for agent system
CREATE TABLE public.job_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'default',
  status TEXT NOT NULL DEFAULT 'pending',
  user_id UUID,
  payload JSONB DEFAULT '{}'::jsonb,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

ALTER TABLE public.job_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage job queue"
  ON public.job_queue FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role can manage job queue"
  ON public.job_queue FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_job_queue_status ON public.job_queue (status);
CREATE INDEX idx_job_queue_created_at ON public.job_queue (created_at DESC);

-- ========================================
-- Source: 20260402012608_713ffc6d-70d2-433a-a61d-bc9b12bf5fc4.sql
-- ========================================
CREATE TABLE IF NOT EXISTS public.processing_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'processing',
  progress integer NOT NULL DEFAULT 0,
  query jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.processing_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own processing jobs"
  ON public.processing_jobs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own processing jobs"
  ON public.processing_jobs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role can manage processing jobs"
  ON public.processing_jobs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_processing_jobs_user_status ON public.processing_jobs (user_id, status);

CREATE OR REPLACE FUNCTION public.cleanup_old_processing_jobs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  DELETE FROM public.processing_jobs
  WHERE created_at < now() - interval '1 hour'
    AND status IN ('completed', 'failed');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_cleanup_processing_jobs
  AFTER INSERT ON public.processing_jobs
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.cleanup_old_processing_jobs();

-- ========================================
-- Source: 20260402015531_c93372d5-4989-4d12-9506-01b508c13bda.sql
-- ========================================
-- Support tickets table
CREATE TABLE public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  ticket_number text NOT NULL DEFAULT ('TKT-' || substr(gen_random_uuid()::text, 1, 8)),
  request_type text NOT NULL DEFAULT 'general_feedback',
  title text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  priority text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'open',
  email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own tickets"
  ON public.support_tickets FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own tickets"
  ON public.support_tickets FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own tickets"
  ON public.support_tickets FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all tickets"
  ON public.support_tickets FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role can manage tickets"
  ON public.support_tickets FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_support_tickets_user ON public.support_tickets (user_id, status);
CREATE INDEX idx_support_tickets_status ON public.support_tickets (status, created_at);

-- FAQ table for knowledge base
CREATE TABLE public.support_faq (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL DEFAULT 'getting_started',
  question text NOT NULL DEFAULT '',
  answer text NOT NULL DEFAULT '',
  display_order integer NOT NULL DEFAULT 0,
  is_published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.support_faq ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view published FAQs"
  ON public.support_faq FOR SELECT
  TO authenticated
  USING (is_published = true);

CREATE POLICY "Admins can manage FAQs"
  ON public.support_faq FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role can manage FAQs"
  ON public.support_faq FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Seed initial FAQ entries
INSERT INTO public.support_faq (category, question, answer, display_order) VALUES
  ('getting_started', 'How do I create my profile?', 'Navigate to the Profile section from the sidebar and fill in your professional details including work experience, skills, and career preferences.', 1),
  ('getting_started', 'How does the iCareerOS analysis work?', 'Paste a job description and your resume on the Analyze Job page. Our AI compares them and provides a fit score with actionable improvement suggestions.', 2),
  ('job_search', 'How do I search for jobs?', 'Go to Find Jobs, enter your desired job title and location, then click Search. Results are matched against your profile for relevance.', 3),
  ('job_search', 'Can I save opportunities for later?', 'Yes! Click the save button on any job listing to add it to your Applications tracker.', 4),
  ('account', 'How do I update my email preferences?', 'Visit your Profile page and scroll to the Email Preferences section to manage notifications and alerts.', 5),
  ('account', 'How do I delete my account?', 'Go to Profile settings and use the Delete Account option at the bottom of the page. This action is permanent.', 6);

-- ========================================
-- Source: 20260402020432_bb3e52bc-e281-48bf-babb-16a8c5c9a50c.sql
-- ========================================
-- Ticket responses / conversation thread
CREATE TABLE public.ticket_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  author_id uuid NOT NULL,
  message text NOT NULL DEFAULT '',
  is_admin_response boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ticket_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ticket owners can view responses"
  ON public.ticket_responses FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.support_tickets
      WHERE id = ticket_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage all responses"
  ON public.ticket_responses FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role can manage responses"
  ON public.ticket_responses FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_ticket_responses_ticket ON public.ticket_responses (ticket_id, created_at);

-- Add assignment column to support_tickets
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS assigned_to uuid;

-- ========================================
-- Source: 20260403000000_kb_role_based_audiences.sql
-- ========================================
-- Knowledge Base: role-based audiences for support_faq
-- Adds audience column, updates RLS, and seeds comprehensive FAQ content.

-- ─── 1. Add audience column ────────────────────────────────────────────────

ALTER TABLE public.support_faq
  ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT 'all'
  CONSTRAINT support_faq_audience_check
    CHECK (audience IN ('all', 'job_seeker', 'recruiter', 'admin'));

-- ─── 2. Update existing seed rows to audience='all' (already the default) ──
-- No-op: new default handles existing rows automatically.

-- ─── 3. Replace SELECT policy with role-based one ─────────────────────────

DROP POLICY IF EXISTS "Anyone can view published FAQs" ON public.support_faq;

-- Role-based visibility:
--   • audience='all'          → any authenticated user
--   • audience='job_seeker'   → users whose role is job_seeker
--   • audience='recruiter'    → users whose role is recruiter
--   • audience='admin'        → admins only
-- Cast role::text so the query works whether user_roles.role is text or an enum.
CREATE POLICY "Role-based FAQ visibility"
  ON public.support_faq FOR SELECT
  TO authenticated
  USING (
    is_published = true
    AND (
      audience = 'all'
      OR EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid()
          AND ur.role::text = audience
      )
      OR EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid()
          AND ur.role::text = 'admin'
      )
    )
  );

-- ─── 4. Seed comprehensive Knowledge Base content ─────────────────────────
-- Existing 6 rows keep audience='all' (default).
-- New rows below are tagged by audience and grouped into functional categories.

INSERT INTO public.support_faq (category, question, answer, display_order, audience) VALUES

-- ══════════════════════════════════════════════════════════════════════════
-- ALL USERS
-- ══════════════════════════════════════════════════════════════════════════

  ('getting_started', 'What is iCareerOS?',
   'iCareerOS is an AI-powered career platform that helps job seekers find, apply, and prepare for opportunities — and helps hiring managers source, screen, and interview candidates. Use the sidebar to navigate between features.',
   10, 'all'),

  ('getting_started', 'How do I switch between Job Seeker and Hiring Manager modes?',
   'Click your profile avatar in the top-right corner and select "Switch Mode". Your sidebar navigation will update to show the tools relevant to your selected mode.',
   11, 'all'),

  ('account', 'How do I reset my password?',
   'Click "Forgot Password" on the login page. An email will be sent to your registered address with a secure reset link valid for 60 minutes.',
   12, 'all'),

  ('account', 'How do I update my profile information?',
   'Navigate to Profile in the sidebar. You can update your personal details, contact information, and preferences. Changes are saved automatically.',
   13, 'all'),

  ('account', 'How do I delete my account?',
   'Go to Profile → Settings → Delete Account. This action is permanent and removes all your data including applications, tickets, and saved jobs.',
   14, 'all'),

-- ══════════════════════════════════════════════════════════════════════════
-- JOB SEEKER
-- ══════════════════════════════════════════════════════════════════════════

  -- Dashboard
  ('seeker_dashboard', 'What does the Job Seeker Dashboard show?',
   'Your dashboard gives you a real-time overview of your job search activity: recent job matches, pending applications, upcoming interviews, and AI recommendations based on your profile.',
   100, 'job_seeker'),

  ('seeker_dashboard', 'Why are my dashboard metrics not updating?',
   'Dashboard data refreshes automatically every few minutes. If metrics appear stale, try refreshing the page. If the issue persists, submit a support ticket.',
   101, 'job_seeker'),

  -- Analyze Job
  ('seeker_analyze_job', 'How do I analyze a job posting?',
   'Go to "Analyze Job" in the sidebar. Paste the job description into the text box and click Analyze. The AI will compare it against your profile and produce a match score, matched skills, skill gaps, and tailored improvement tips.',
   110, 'job_seeker'),

  ('seeker_analyze_job', 'What does the fit score mean?',
   'The fit score (0–100) shows how well your profile aligns with the job requirements. Scores above 70 indicate a strong match. The breakdown highlights matched skills and gaps so you can prioritize improvements.',
   111, 'job_seeker'),

  ('seeker_analyze_job', 'Can I analyze multiple opportunities at once?',
   'You can analyze one job at a time. After each analysis, results are saved in your Applications tracker so you can compare across opportunities later.',
   112, 'job_seeker'),

  -- Find Jobs
  ('seeker_find_jobs', 'How do I search for jobs?',
   'Go to "Find Jobs", enter a job title and optionally a location or remote preference, then click Search. Results are ranked by relevance to your profile.',
   120, 'job_seeker'),

  ('seeker_find_jobs', 'How do I filter job results?',
   'Use the filter panel on the left to narrow by location, job type (full-time/part-time/contract), salary range, experience level, and date posted.',
   121, 'job_seeker'),

  ('seeker_find_jobs', 'Can I save opportunities to apply later?',
   'Yes. Click the bookmark icon on any job card to save it. Saved opportunities appear in your Applications tracker with status "Saved".',
   122, 'job_seeker'),

  ('seeker_find_jobs', 'Why am I not seeing opportunities in my area?',
   'Make sure your location is set correctly in your Profile. You can also check the "Remote" filter to include remote positions. Try broadening your search terms if results are sparse.',
   123, 'job_seeker'),

  -- Applications
  ('seeker_applications', 'How do I track my applications?',
   'Go to "Applications" in the sidebar to see all your saved and applied jobs. Each entry shows current status (Saved, Applied, Interviewing, Offered, Rejected).',
   130, 'job_seeker'),

  ('seeker_applications', 'How do I update the status of an application?',
   'Open an application card and use the Status dropdown to change it. You can also add notes and expected follow-up dates to stay organised.',
   131, 'job_seeker'),

  ('seeker_applications', 'Can I add applications I submitted outside of iCareerOS?',
   'Yes. Click "Add Application" in the Applications page, enter the job title, company, and any details you want to track.',
   132, 'job_seeker'),

  -- Offers
  ('seeker_offers', 'Where do I manage job offers?',
   'Go to "Offers" in the sidebar. Any offer extended through the platform appears here. You can review compensation details, deadlines, and accept or decline.',
   140, 'job_seeker'),

  ('seeker_offers', 'How does the AI salary negotiation advice work?',
   'On an offer detail page, click "Negotiation Strategy". The AI analyses market data and your experience to suggest a counter-offer range and talking points.',
   141, 'job_seeker'),

  -- Career
  ('seeker_career', 'What is the Career section?',
   'Career provides AI-powered long-term planning tools: career path projections, skill gap analysis, salary trajectory forecasting, and learning recommendations tailored to your goals.',
   150, 'job_seeker'),

  ('seeker_career', 'How do I explore career paths?',
   'In Career → Career Path Analysis, enter your current role and target role. The AI maps out intermediate steps, required skills, and estimated timelines.',
   151, 'job_seeker'),

  ('seeker_career', 'How does salary projection work?',
   'Salary Projection in the Career section models your earning potential based on your skills, experience, industry trends, and location. Results update as you add skills to your profile.',
   152, 'job_seeker'),

  -- Interview Prep
  ('seeker_interview_prep', 'How do I prepare for an interview using iCareerOS?',
   'Go to "Interview Prep" and select the job you are interviewing for. The AI generates likely interview questions based on the job description and your profile, plus model answers and coaching tips.',
   160, 'job_seeker'),

  ('seeker_interview_prep', 'What is the Mock Interview feature?',
   'Mock Interview simulates a live interview session. The AI asks questions, listens to your text or voice responses, and provides real-time feedback on content, clarity, and confidence.',
   161, 'job_seeker'),

  ('seeker_interview_prep', 'Can I practice for technical interviews?',
   'Yes. When generating interview prep, select "Technical" as the interview type. The AI will include role-specific technical and behavioural questions.',
   162, 'job_seeker'),

  -- Auto Apply
  ('seeker_auto_apply', 'What is Auto Apply?',
   'Auto Apply is an AI agent that automatically finds and applies to opportunities matching your profile and preferences. It runs on a schedule you configure and reports results on your dashboard.',
   170, 'job_seeker'),

  ('seeker_auto_apply', 'How do I configure Auto Apply?',
   'Go to "Auto Apply" → Settings. Set your target job titles, preferred locations, salary range, and maximum applications per day. The agent will only apply to opportunities that meet your criteria.',
   171, 'job_seeker'),

  ('seeker_auto_apply', 'How do I pause or stop Auto Apply?',
   'In "Auto Apply" → Settings, toggle the "Active" switch off. Ongoing applications in progress will complete, but no new ones will start.',
   172, 'job_seeker'),

  ('seeker_auto_apply', 'Can I review applications before they are submitted?',
   'Yes. Set the automation mode to "Review Before Apply" in settings. The agent will queue applications for your approval before submitting.',
   173, 'job_seeker'),

  -- Profile
  ('seeker_profile', 'How do I build my job seeker profile?',
   'Go to Profile in the sidebar. Complete all sections: Personal Info, Work Experience, Education, Skills, and Career Preferences. A complete profile improves your match scores and Auto Apply results.',
   180, 'job_seeker'),

  ('seeker_profile', 'How do I import my resume into my profile?',
   'In Profile → Resume, click "Upload Resume". The AI will parse your resume and auto-fill your work experience, education, and skills. Review and correct any errors.',
   181, 'job_seeker'),

  ('seeker_profile', 'How do I generate a cover letter?',
   'From any job listing or the Analyze Job page, click "Generate Cover Letter". The AI drafts a tailored cover letter based on the job description and your profile. You can edit it before using it.',
   182, 'job_seeker'),

-- ══════════════════════════════════════════════════════════════════════════
-- HIRING MANAGER / RECRUITER
-- ══════════════════════════════════════════════════════════════════════════

  -- Candidate Screener
  ('recruiter_screener', 'What is the Candidate Screener?',
   'The Candidate Screener uses AI to evaluate incoming applicants against your job requirements. It scores each candidate on skills match, experience, and culture indicators — so you focus on the strongest fits.',
   200, 'recruiter'),

  ('recruiter_screener', 'How do I set screening criteria?',
   'Open a job posting and go to the Screening tab. Define required skills, minimum years of experience, must-have qualifications, and any knockout questions. The AI applies these to all applicants automatically.',
   201, 'recruiter'),

  ('recruiter_screener', 'Can I bulk-review candidates?',
   'Yes. In the Screener list view, select multiple candidates and use bulk actions to advance, reject, or tag them. Bulk decisions are logged for compliance.',
   202, 'recruiter'),

  -- Candidates Database
  ('recruiter_candidates', 'What is the Candidates Database?',
   'The Candidates Database is your searchable repository of all candidates who have applied to your postings or been sourced through the platform. Use filters to find candidates by skill, location, status, or score.',
   210, 'recruiter'),

  ('recruiter_candidates', 'How do I search for candidates?',
   'Use the search bar at the top of Candidates Database and add filters (skills, location, experience, status). Boolean search is supported (e.g., "Python AND Django NOT PHP").',
   211, 'recruiter'),

  ('recruiter_candidates', 'How do I add notes to a candidate profile?',
   'Open a candidate profile and click "Add Note". Notes are visible to all team members in your organization and are timestamped.',
   212, 'recruiter'),

  ('recruiter_candidates', 'Can I export candidate data?',
   'Yes. Select candidates using checkboxes then click Export → CSV or PDF. Exported data respects your organization''s data-use agreements.',
   213, 'recruiter'),

  -- Job Postings
  ('recruiter_job_postings', 'How do I create a job posting?',
   'Go to "Job Postings" → Create New. Fill in the job title, description, requirements, location, and compensation range. The AI can assist with writing and optimising the description for search visibility.',
   220, 'recruiter'),

  ('recruiter_job_postings', 'How do I publish or unpublish a job posting?',
   'In Job Postings, open the posting and toggle the "Published" switch. Published opportunities are visible to job seekers; unpublished opportunities are draft-only and not searchable.',
   221, 'recruiter'),

  ('recruiter_job_postings', 'How do I track applicants for a specific posting?',
   'Open a job posting and click the "Applicants" tab. You will see a pipeline view of all applicants grouped by stage (Applied, Screened, Interview, Offer, Hired, Rejected).',
   222, 'recruiter'),

  ('recruiter_job_postings', 'Can I duplicate an existing job posting?',
   'Yes. In the job posting list, click the ⋯ menu on any posting and select Duplicate. This creates a draft copy you can edit before publishing.',
   223, 'recruiter'),

  -- Interview Scheduling
  ('recruiter_interview_scheduling', 'How do I schedule an interview?',
   'Open a candidate''s profile or their application, click "Schedule Interview", choose the interview type (phone, video, on-site), select available time slots, and send the invite. The candidate receives an email with calendar options.',
   230, 'recruiter'),

  ('recruiter_interview_scheduling', 'Can I set up an interview panel?',
   'Yes. When creating an interview, add multiple interviewers from your team. The system will find overlapping availability and suggest shared time slots.',
   231, 'recruiter'),

  ('recruiter_interview_scheduling', 'How do I send interview reminders?',
   'Reminders are sent automatically 24 hours and 1 hour before each scheduled interview. You can configure additional reminder times in Settings → Interview Preferences.',
   232, 'recruiter'),

  ('recruiter_interview_scheduling', 'Where do I see the interview scorecard after the session?',
   'After an interview, each interviewer is prompted to complete a scorecard. Results are aggregated in the candidate''s profile under the "Interviews" tab.',
   233, 'recruiter'),

-- ══════════════════════════════════════════════════════════════════════════
-- ADMIN
-- ══════════════════════════════════════════════════════════════════════════

  -- Support Tickets (admin)
  ('admin_support_tickets', 'How do I manage support tickets as an admin?',
   'Go to Admin → Support Tickets. You can view all open, in-progress, and resolved tickets. Use the filter bar to sort by priority, status, or date. Click a ticket to open the conversation thread and respond.',
   300, 'admin'),

  ('admin_support_tickets', 'How do I resolve or close a ticket?',
   'Open the ticket, add a final response if needed, then change the status to Resolved or Closed using the status dropdown at the top of the ticket detail.',
   301, 'admin'),

  -- System Health (admin)
  ('admin_system_health', 'How do I monitor system health?',
   'Go to Admin → System Health. The dashboard shows real-time status of all platform services (API, database, AI agents, email). Any degraded or failing services are highlighted in red.',
   310, 'admin'),

  ('admin_system_health', 'How do I view agent run history?',
   'Go to Admin → Agent Runs. You can filter by status (completed, failed, running) and date range. Click any run to see detailed logs and output.',
   311, 'admin'),

  ('admin_system_health', 'What do I do if the job queue is backed up?',
   'Go to Admin → Queue. You can see queued, running, failed, and cancelled jobs. Failed opportunities can be retried individually or in bulk from the queue view.',
   312, 'admin'),

  -- Users / Roles (admin)
  ('admin_users_roles', 'How do I manage user roles?',
   'Go to Admin → Users. Use the role selector on each user row to change their role (job_seeker, recruiter, admin). Role changes take effect immediately.',
   320, 'admin'),

  ('admin_users_roles', 'How do I create a new user account?',
   'In Admin → Users, click "Create User". Enter the email, full name, initial password, and role. The user will receive a welcome email with login instructions.',
   321, 'admin'),

  ('admin_users_roles', 'How do I disable or delete a user account?',
   'In Admin → Users, click the ⋯ menu next to the user and choose Disable or Delete. Disabled accounts cannot log in but data is preserved. Deletion is permanent.',
   322, 'admin'),

  ('admin_users_roles', 'How do I view the audit log?',
   'Go to Admin → Audit Log to see a full history of administrative actions including role changes, account deletions, and console commands, with timestamps and actor IDs.',
   323, 'admin');

-- ========================================
-- Source: 20260403143427_52877c90-9f83-4a60-a40e-852e6c8364c1.sql
-- ========================================
-- Fix 1: Remove anon SELECT policy that exposes PII on job_seeker_profiles
DROP POLICY IF EXISTS "Anyone can view public profiles" ON public.job_seeker_profiles;

-- Fix 2: Prevent privilege escalation on user_roles by adding explicit deny for non-admin inserts
CREATE POLICY "Only admins can insert roles"
  ON public.user_roles
  FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only admins can update roles"
  ON public.user_roles
  FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only admins can delete roles"
  ON public.user_roles
  FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- ========================================
-- Source: 20260403150923_579c2189-ccaa-4c95-ac60-c56ca48bb9a8.sql
-- ========================================
-- Phase 1A: Drop anon SELECT on analysis_history (exposes PII)
DROP POLICY IF EXISTS "Anyone can view score reports" ON public.analysis_history;

-- Phase 3F: Benefits catalog (master reference)
CREATE TABLE public.benefits_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  label text NOT NULL,
  keywords text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.benefits_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read benefits catalog"
  ON public.benefits_catalog FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role can manage benefits catalog"
  ON public.benefits_catalog FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Phase 3F: Job benefits junction table
CREATE TABLE public.job_benefits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.scraped_jobs(id) ON DELETE CASCADE,
  benefit_id uuid NOT NULL REFERENCES public.benefits_catalog(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, benefit_id)
);

ALTER TABLE public.job_benefits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read job benefits"
  ON public.job_benefits FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role can manage job benefits"
  ON public.job_benefits FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ========================================
-- Source: 20260403153451_a21c26cd-1df5-4350-8d91-21942ccd5681.sql
-- ========================================
-- Fix 1: Add INSERT policy on ticket_responses so authenticated users can only respond to their own tickets
CREATE POLICY "Users can insert responses on own tickets"
ON public.ticket_responses
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = author_id
  AND EXISTS (
    SELECT 1 FROM public.support_tickets
    WHERE id = ticket_responses.ticket_id
    AND user_id = auth.uid()
  )
);

-- Fix 2: Replace anon SELECT on user_portfolio_items with authenticated-only
DROP POLICY IF EXISTS "Anyone can view portfolio items" ON public.user_portfolio_items;
CREATE POLICY "Authenticated users can view portfolio items"
ON public.user_portfolio_items
FOR SELECT
TO authenticated
USING (true);

-- ========================================
-- Source: 20260403170753_2b53eafa-5008-4b1b-964c-b8723168ec76.sql
-- ========================================
-- Customer feedback survey responses table
CREATE TABLE public.customer_surveys (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('job_seeker', 'hiring_manager', 'both')),
  email TEXT,
  phone TEXT,
  wants_callback BOOLEAN NOT NULL DEFAULT false,
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.customer_surveys ENABLE ROW LEVEL SECURITY;

-- Anyone (including anonymous) can submit a survey
CREATE POLICY "Anyone can insert surveys"
ON public.customer_surveys
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Only admins can read surveys
CREATE POLICY "Admins can view all surveys"
ON public.customer_surveys
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Only admins can delete surveys
CREATE POLICY "Admins can delete surveys"
ON public.customer_surveys
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- ========================================
-- Source: 20260403191342_409dffde-e58b-4700-abe4-daad5a0269f2.sql
-- ========================================
ALTER TABLE public.job_seeker_profiles ADD COLUMN IF NOT EXISTS search_mode text DEFAULT 'balanced';

CREATE TABLE IF NOT EXISTS public.search_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL DEFAULT '',
  criteria jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.search_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own presets" ON public.search_presets
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ========================================
-- Source: 20260405014621_3b714c8c-31ad-43d8-811f-b9b6f73788ce.sql
-- ========================================
-- Add is_public flag to portfolio items (default true to preserve existing public profile behavior)
ALTER TABLE public.user_portfolio_items ADD COLUMN is_public boolean NOT NULL DEFAULT true;

-- Drop the overly permissive SELECT policy
DROP POLICY "Authenticated users can view portfolio items" ON public.user_portfolio_items;

-- New policy: users can view their own items OR items marked as public
CREATE POLICY "Users can view own or public portfolio items"
ON public.user_portfolio_items FOR SELECT TO authenticated
USING (auth.uid() = user_id OR is_public = true);

-- Allow anonymous users to view public items (for the public profile page)
CREATE POLICY "Anyone can view public portfolio items"
ON public.user_portfolio_items FOR SELECT TO anon
USING (is_public = true);

-- ========================================
-- Source: 20260406040757_90db2b44-2870-4a9c-bcbf-ac6e543dc87d.sql
-- ========================================
-- Feature Flags table for admin service controls
CREATE TABLE public.feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  description text DEFAULT '',
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read feature flags"
  ON public.feature_flags FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can manage feature flags"
  ON public.feature_flags FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Service Events table for event-driven architecture
CREATE TABLE public.service_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  emitted_by text NOT NULL DEFAULT '',
  processed boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.service_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view service events"
  ON public.service_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role can manage service events"
  ON public.service_events FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated can insert events"
  ON public.service_events FOR INSERT TO authenticated
  WITH CHECK (true);

-- Service Health table for monitoring + circuit breaker
CREATE TABLE public.service_health (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name text UNIQUE NOT NULL,
  status text NOT NULL DEFAULT 'healthy',
  last_check timestamp with time zone NOT NULL DEFAULT now(),
  error_count integer NOT NULL DEFAULT 0,
  circuit_breaker_open boolean NOT NULL DEFAULT false,
  last_error text,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.service_health ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read service health"
  ON public.service_health FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can manage service health"
  ON public.service_health FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role can manage service health"
  ON public.service_health FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Seed default feature flags
INSERT INTO public.feature_flags (key, description) VALUES
  ('auto_apply', 'Enable auto-apply job feature'),
  ('autopilot_mode', 'Enable fully automated job search + apply'),
  ('career_path', 'Enable career path planning'),
  ('learning', 'Enable learning recommendations'),
  ('gig_marketplace', 'Enable gig/freelance marketplace'),
  ('notifications', 'Enable notification system'),
  ('analytics', 'Enable analytics tracking'),
  ('job_search', 'Enable job search'),
  ('matching', 'Enable job matching/scoring');

-- Seed default service health entries
INSERT INTO public.service_health (service_name) VALUES
  ('auth'), ('profile'), ('search'), ('matching'),
  ('auto-apply'), ('career-path'), ('learning'),
  ('notification'), ('analytics'), ('admin'), ('billing');

-- ========================================
-- Source: 20260406040948_3ff6303a-b5a3-4b69-9d35-883ea1778b98.sql
-- ========================================
-- Gigs table (Fiverr/Upwork style listings)
CREATE TABLE public.gigs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'general',
  skills_required text[] NOT NULL DEFAULT '{}',
  budget_min numeric,
  budget_max numeric,
  budget_type text NOT NULL DEFAULT 'fixed',
  location text DEFAULT 'Remote',
  is_remote boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'open',
  applications_count integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.gigs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view open gigs"
  ON public.gigs FOR SELECT TO authenticated
  USING (status = 'open' OR auth.uid() = user_id);

CREATE POLICY "Users can manage own gigs"
  ON public.gigs FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Gig Bids
CREATE TABLE public.gig_bids (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gig_id uuid NOT NULL REFERENCES public.gigs(id) ON DELETE CASCADE,
  bidder_id uuid NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  message text DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.gig_bids ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Bidders can manage own bids"
  ON public.gig_bids FOR ALL TO authenticated
  USING (auth.uid() = bidder_id)
  WITH CHECK (auth.uid() = bidder_id);

CREATE POLICY "Gig owners can view bids on their gigs"
  ON public.gig_bids FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.gigs WHERE gigs.id = gig_bids.gig_id AND gigs.user_id = auth.uid()));

-- Gig Contracts
CREATE TABLE public.gig_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gig_id uuid NOT NULL REFERENCES public.gigs(id) ON DELETE CASCADE,
  client_id uuid NOT NULL,
  freelancer_id uuid NOT NULL,
  bid_id uuid REFERENCES public.gig_bids(id) ON DELETE SET NULL,
  amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  milestones jsonb NOT NULL DEFAULT '[]',
  started_at timestamp with time zone NOT NULL DEFAULT now(),
  completed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.gig_contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Contract parties can view own contracts"
  ON public.gig_contracts FOR SELECT TO authenticated
  USING (auth.uid() = client_id OR auth.uid() = freelancer_id);

CREATE POLICY "Contract parties can update own contracts"
  ON public.gig_contracts FOR UPDATE TO authenticated
  USING (auth.uid() = client_id OR auth.uid() = freelancer_id);

CREATE POLICY "Authenticated can create contracts"
  ON public.gig_contracts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = client_id);

-- Gig Reviews
CREATE TABLE public.gig_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.gig_contracts(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL,
  reviewee_id uuid NOT NULL,
  rating integer NOT NULL DEFAULT 5,
  comment text DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.gig_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view reviews"
  ON public.gig_reviews FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Contract parties can create reviews"
  ON public.gig_reviews FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.gig_contracts
      WHERE gig_contracts.id = gig_reviews.contract_id
      AND (gig_contracts.client_id = auth.uid() OR gig_contracts.freelancer_id = auth.uid())
    )
  );

-- ========================================
-- Source: 20260408194227_0fc5f5d6-4870-42e9-ad73-e3fff0e47a54.sql
-- ========================================
ALTER TABLE public.job_postings
  ADD COLUMN IF NOT EXISTS skills text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS experience_level text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS benefits text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS remote_type text DEFAULT 'on-site';

-- ========================================
-- Source: 20260408194559_689c439c-0251-4a8a-a1ac-805c364a537f.sql
-- ========================================
CREATE TABLE public.talent_invites (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  talent_id uuid NOT NULL,
  job_id uuid NOT NULL REFERENCES public.job_postings(id) ON DELETE CASCADE,
  employer_id uuid NOT NULL,
  message text DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  sent_at timestamp with time zone NOT NULL DEFAULT now(),
  viewed_at timestamp with time zone,
  responded_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.talent_invites ENABLE ROW LEVEL SECURITY;

-- Employers can view their own invites
CREATE POLICY "Employers can view own invites"
  ON public.talent_invites FOR SELECT
  TO authenticated
  USING (auth.uid() = employer_id);

-- Employers can create invites
CREATE POLICY "Employers can create invites"
  ON public.talent_invites FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = employer_id);

-- Employers can update own invites
CREATE POLICY "Employers can update own invites"
  ON public.talent_invites FOR UPDATE
  TO authenticated
  USING (auth.uid() = employer_id);

-- Talent can view invites sent to them
CREATE POLICY "Talent can view received invites"
  ON public.talent_invites FOR SELECT
  TO authenticated
  USING (auth.uid() = talent_id);

-- Talent can update invite status (accept/decline)
CREATE POLICY "Talent can respond to invites"
  ON public.talent_invites FOR UPDATE
  TO authenticated
  USING (auth.uid() = talent_id);

-- Admins can view all
CREATE POLICY "Admins can view all invites"
  ON public.talent_invites FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Employers can delete own invites
CREATE POLICY "Employers can delete own invites"
  ON public.talent_invites FOR DELETE
  TO authenticated
  USING (auth.uid() = employer_id);

-- Create index for common queries
CREATE INDEX idx_talent_invites_employer ON public.talent_invites(employer_id);
CREATE INDEX idx_talent_invites_talent ON public.talent_invites(talent_id);
CREATE INDEX idx_talent_invites_job ON public.talent_invites(job_id);

-- ========================================
-- Source: 20260408194937_066f6744-53d6-47f9-a303-0ca125240378.sql
-- ========================================
-- Projects table
CREATE TABLE public.projects (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employer_id uuid NOT NULL,
  title text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  budget_min numeric,
  budget_max numeric,
  timeline_days integer,
  skills_required text[] DEFAULT '{}'::text[],
  deliverables text[] DEFAULT '{}'::text[],
  status text NOT NULL DEFAULT 'open',
  proposals_count integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Employers can manage own projects" ON public.projects FOR ALL TO authenticated
  USING (auth.uid() = employer_id) WITH CHECK (auth.uid() = employer_id);

CREATE POLICY "Anyone authenticated can view open projects" ON public.projects FOR SELECT TO authenticated
  USING (status = 'open' OR auth.uid() = employer_id);

CREATE POLICY "Admins can view all projects" ON public.projects FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_projects_employer ON public.projects(employer_id);
CREATE INDEX idx_projects_status ON public.projects(status);

-- Project proposals table
CREATE TABLE public.project_proposals (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  talent_id uuid NOT NULL,
  price numeric NOT NULL DEFAULT 0,
  timeline_days integer,
  cover_message text DEFAULT '',
  portfolio_links text[] DEFAULT '{}'::text[],
  status text NOT NULL DEFAULT 'pending',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.project_proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Talent can manage own proposals" ON public.project_proposals FOR ALL TO authenticated
  USING (auth.uid() = talent_id) WITH CHECK (auth.uid() = talent_id);

CREATE POLICY "Employers can view proposals on their projects" ON public.project_proposals FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = project_proposals.project_id AND projects.employer_id = auth.uid()));

CREATE POLICY "Employers can update proposals on their projects" ON public.project_proposals FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = project_proposals.project_id AND projects.employer_id = auth.uid()));

CREATE POLICY "Admins can view all proposals" ON public.project_proposals FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_proposals_project ON public.project_proposals(project_id);
CREATE INDEX idx_proposals_talent ON public.project_proposals(talent_id);

-- Contracts table
CREATE TABLE public.contracts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  proposal_id uuid NOT NULL REFERENCES public.project_proposals(id) ON DELETE CASCADE,
  employer_id uuid NOT NULL,
  talent_id uuid NOT NULL,
  agreed_price numeric NOT NULL DEFAULT 0,
  agreed_timeline_days integer,
  status text NOT NULL DEFAULT 'active',
  started_at timestamp with time zone NOT NULL DEFAULT now(),
  completed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Contract parties can view own contracts" ON public.contracts FOR SELECT TO authenticated
  USING (auth.uid() = employer_id OR auth.uid() = talent_id);

CREATE POLICY "Employers can create contracts" ON public.contracts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = employer_id);

CREATE POLICY "Contract parties can update contracts" ON public.contracts FOR UPDATE TO authenticated
  USING (auth.uid() = employer_id OR auth.uid() = talent_id);

CREATE POLICY "Admins can view all contracts" ON public.contracts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_contracts_employer ON public.contracts(employer_id);
CREATE INDEX idx_contracts_talent ON public.contracts(talent_id);

-- Milestones table
CREATE TABLE public.milestones (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  description text DEFAULT '',
  amount numeric DEFAULT 0,
  due_date timestamp with time zone,
  status text NOT NULL DEFAULT 'pending',
  completed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Contract parties can view milestones" ON public.milestones FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.contracts WHERE contracts.id = milestones.contract_id AND (contracts.employer_id = auth.uid() OR contracts.talent_id = auth.uid())));

CREATE POLICY "Contract parties can manage milestones" ON public.milestones FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.contracts WHERE contracts.id = milestones.contract_id AND (contracts.employer_id = auth.uid() OR contracts.talent_id = auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.contracts WHERE contracts.id = milestones.contract_id AND (contracts.employer_id = auth.uid() OR contracts.talent_id = auth.uid())));

CREATE POLICY "Admins can view all milestones" ON public.milestones FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_milestones_contract ON public.milestones(contract_id);

-- ========================================
-- Source: 20260408195433_6ef9036a-20f7-417e-bd91-91cfd8d8f31d.sql
-- ========================================
-- Service catalog
CREATE TABLE public.service_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL,
  title text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'general',
  headline text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  image_url text,
  turnaround_days integer NOT NULL DEFAULT 7,
  status text NOT NULL DEFAULT 'draft',
  rating_avg numeric NOT NULL DEFAULT 0,
  rating_count integer NOT NULL DEFAULT 0,
  orders_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.service_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view published services" ON public.service_catalog
  FOR SELECT USING (status = 'published' OR auth.uid() = seller_id);
CREATE POLICY "Sellers can manage own services" ON public.service_catalog
  FOR ALL USING (auth.uid() = seller_id) WITH CHECK (auth.uid() = seller_id);
CREATE POLICY "Admins can view all services" ON public.service_catalog
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Service packages (3 tiers per service)
CREATE TABLE public.service_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid NOT NULL REFERENCES public.service_catalog(id) ON DELETE CASCADE,
  tier text NOT NULL DEFAULT 'basic',
  name text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  price numeric NOT NULL DEFAULT 0,
  delivery_days integer NOT NULL DEFAULT 7,
  features text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.service_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view packages of published services" ON public.service_packages
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.service_catalog sc
    WHERE sc.id = service_packages.service_id AND (sc.status = 'published' OR sc.seller_id = auth.uid())
  ));
CREATE POLICY "Sellers can manage packages for own services" ON public.service_packages
  FOR ALL USING (EXISTS (
    SELECT 1 FROM public.service_catalog sc
    WHERE sc.id = service_packages.service_id AND sc.seller_id = auth.uid()
  )) WITH CHECK (EXISTS (
    SELECT 1 FROM public.service_catalog sc
    WHERE sc.id = service_packages.service_id AND sc.seller_id = auth.uid()
  ));

-- Catalog orders
CREATE TABLE public.catalog_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id uuid NOT NULL,
  seller_id uuid NOT NULL,
  service_id uuid NOT NULL REFERENCES public.service_catalog(id),
  package_id uuid NOT NULL REFERENCES public.service_packages(id),
  price numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  delivery_deadline timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.catalog_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Buyers can create orders" ON public.catalog_orders
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = buyer_id);
CREATE POLICY "Order parties can view own orders" ON public.catalog_orders
  FOR SELECT TO authenticated USING (auth.uid() = buyer_id OR auth.uid() = seller_id);
CREATE POLICY "Order parties can update orders" ON public.catalog_orders
  FOR UPDATE TO authenticated USING (auth.uid() = buyer_id OR auth.uid() = seller_id);
CREATE POLICY "Admins can view all orders" ON public.catalog_orders
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Service reviews
CREATE TABLE public.service_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.catalog_orders(id),
  service_id uuid NOT NULL REFERENCES public.service_catalog(id),
  reviewer_id uuid NOT NULL,
  rating integer NOT NULL DEFAULT 5 CHECK (rating >= 1 AND rating <= 5),
  comment text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.service_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view reviews" ON public.service_reviews
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Order buyers can create reviews" ON public.service_reviews
  FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = reviewer_id AND EXISTS (
      SELECT 1 FROM public.catalog_orders co
      WHERE co.id = service_reviews.order_id AND co.buyer_id = auth.uid()
    )
  );

-- Indexes
CREATE INDEX idx_service_catalog_seller ON public.service_catalog(seller_id);
CREATE INDEX idx_service_catalog_status ON public.service_catalog(status);
CREATE INDEX idx_service_catalog_category ON public.service_catalog(category);
CREATE INDEX idx_service_packages_service ON public.service_packages(service_id);
CREATE INDEX idx_catalog_orders_buyer ON public.catalog_orders(buyer_id);
CREATE INDEX idx_catalog_orders_seller ON public.catalog_orders(seller_id);
CREATE INDEX idx_service_reviews_service ON public.service_reviews(service_id);

-- ========================================
-- Source: 20260408195845_1302519c-b194-4b8e-9e9a-b523fb308a40.sql
-- ========================================
-- Add title column to service_reviews
ALTER TABLE public.service_reviews ADD COLUMN IF NOT EXISTS title text DEFAULT '';

-- Helpful votes
CREATE TABLE public.helpful_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.service_reviews(id) ON DELETE CASCADE,
  voter_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (review_id, voter_id)
);
ALTER TABLE public.helpful_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view helpful votes" ON public.helpful_votes
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert own votes" ON public.helpful_votes
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = voter_id);
CREATE POLICY "Users can delete own votes" ON public.helpful_votes
  FOR DELETE TO authenticated USING (auth.uid() = voter_id);

CREATE INDEX idx_helpful_votes_review ON public.helpful_votes(review_id);

-- Review reports
CREATE TABLE public.review_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.service_reviews(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL,
  reason text NOT NULL DEFAULT 'spam',
  comment text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (review_id, reporter_id)
);
ALTER TABLE public.review_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can create reports" ON public.review_reports
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = reporter_id);
CREATE POLICY "Users can view own reports" ON public.review_reports
  FOR SELECT TO authenticated USING (auth.uid() = reporter_id);
CREATE POLICY "Admins can view all reports" ON public.review_reports
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_review_reports_review ON public.review_reports(review_id);

-- ========================================
-- Source: 20260408200137_df46e9b2-51bf-4f34-86ad-398d19efe584.sql
-- ========================================
CREATE TABLE public.user_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  preference_key text NOT NULL,
  preference_value text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, preference_key)
);

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own preferences" ON public.user_preferences
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ========================================
-- Source: 20260408200424_7ee7afd9-6a62-4842-8236-4fe10ddfa2a2.sql
-- ========================================
-- Admin alerts table
CREATE TABLE public.admin_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type text NOT NULL DEFAULT 'service_down',
  severity text NOT NULL DEFAULT 'medium',
  message text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'unresolved',
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage alerts" ON public.admin_alerts
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role can manage alerts" ON public.admin_alerts
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_admin_alerts_status ON public.admin_alerts(status);
CREATE INDEX idx_admin_alerts_severity ON public.admin_alerts(severity);

-- Add response_time_ms to service_health
ALTER TABLE public.service_health ADD COLUMN IF NOT EXISTS response_time_ms integer DEFAULT 0;

-- ========================================
-- Source: 20260409000000_marketplace_feature_flags.sql
-- ========================================
-- Marketplace feature flags and admin settings for iCareerOS Gig Marketplace
-- Seeds new flags into admin_settings (existing table from admin_control_center migration)

INSERT INTO public.admin_settings (key, value, description)
VALUES
  ('marketplace_enabled',          'true'::jsonb,   'Enable the iCareerOS Gig Marketplace'),
  ('marketplace_commission_rate',  '10'::jsonb,     'Platform commission percentage on gig transactions'),
  ('marketplace_max_gig_price',    '10000'::jsonb,  'Maximum allowed gig listing price (USD)'),
  ('marketplace_auto_approve',     'false'::jsonb,  'Auto-approve new gig listings without admin review'),
  ('marketplace_featured_limit',   '12'::jsonb,     'Maximum number of featured listings on marketplace homepage'),
  ('marketplace_min_rating',       '3.5'::jsonb,    'Minimum provider rating to appear in search results'),
  ('marketplace_escrow_enabled',   'true'::jsonb,   'Enable escrow-based payment protection for gig transactions'),
  ('marketplace_categories',       '"career_coaching,resume_writing,interview_prep,linkedin_optimization,salary_negotiation,portfolio_review,networking_strategy,job_search_strategy"'::jsonb, 'Comma-separated list of marketplace service categories')
ON CONFLICT (key) DO NOTHING;

-- ========================================
-- Source: 20260412000000_invite_only_enrollment.sql
-- ========================================
-- ============================================================
-- iCareerOS: Invite-Only Enrollment System
-- Migration: 20260412000000_invite_only_enrollment.sql
-- Description: Creates invitations table, referral_tree,
--   daily usage view, profiles extensions, and RLS policies.
-- ============================================================

-- ===================
-- 1. INVITATIONS TABLE
-- ===================
CREATE TABLE IF NOT EXISTS public.invitations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inviter_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invite_type     TEXT NOT NULL CHECK (invite_type IN ('email', 'code')),

  -- For email invites
  invitee_email   TEXT,

  -- The token/code
  token           TEXT NOT NULL UNIQUE,
  invite_code     TEXT UNIQUE,

  -- State
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  accepted_by     UUID REFERENCES auth.users(id),
  accepted_at     TIMESTAMPTZ,

  -- Metadata
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),

  -- Constraints
  CONSTRAINT email_required_for_email_type
    CHECK (invite_type != 'email' OR invitee_email IS NOT NULL),
  CONSTRAINT code_required_for_code_type
    CHECK (invite_type != 'code' OR invite_code IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_invitations_token ON public.invitations(token);
CREATE INDEX IF NOT EXISTS idx_invitations_invite_code ON public.invitations(invite_code);
CREATE INDEX IF NOT EXISTS idx_invitations_inviter_id ON public.invitations(inviter_id);
CREATE INDEX IF NOT EXISTS idx_invitations_status ON public.invitations(status);
CREATE INDEX IF NOT EXISTS idx_invitations_invitee_email ON public.invitations(invitee_email);

-- ===================
-- 2. REFERRAL TREE TABLE
-- ===================
CREATE TABLE IF NOT EXISTS public.referral_tree (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  invited_by      UUID REFERENCES auth.users(id),
  invitation_id   UUID REFERENCES public.invitations(id),
  depth           INT NOT NULL DEFAULT 0,
  chain_path      UUID[] NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referral_tree_invited_by ON public.referral_tree(invited_by);
CREATE INDEX IF NOT EXISTS idx_referral_tree_depth ON public.referral_tree(depth);
CREATE INDEX IF NOT EXISTS idx_referral_tree_chain_path ON public.referral_tree USING GIN(chain_path);

-- ===================
-- 3. DAILY USAGE VIEW
-- ===================
CREATE OR REPLACE VIEW public.invite_daily_usage AS
SELECT
  inviter_id,
  COUNT(*) AS invites_sent_today,
  GREATEST(0, 5 - COUNT(*)::int) AS invites_remaining_today
FROM public.invitations
WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'UTC')
  AND created_at < date_trunc('day', now() AT TIME ZONE 'UTC') + INTERVAL '1 day'
GROUP BY inviter_id;

-- ===================
-- 4. PROFILES EXTENSIONS
-- ===================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'invited_via'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN invited_via UUID REFERENCES public.invitations(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'referral_code'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN referral_code TEXT UNIQUE;
  END IF;
END $$;

-- ===================
-- 5. RLS POLICIES â INVITATIONS
-- ===================
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view invitations they sent"
  ON public.invitations FOR SELECT
  USING (inviter_id = auth.uid());

CREATE POLICY "Users can view invitations sent to their email"
  ON public.invitations FOR SELECT
  USING (
    invitee_email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

CREATE POLICY "Users can create invitations"
  ON public.invitations FOR INSERT
  WITH CHECK (inviter_id = auth.uid());

CREATE POLICY "Admins can view all invitations"
  ON public.invitations FOR SELECT
  USING (
    (SELECT raw_user_meta_data->>'role' FROM auth.users WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY "Admins can update invitations"
  ON public.invitations FOR UPDATE
  USING (
    (SELECT raw_user_meta_data->>'role' FROM auth.users WHERE id = auth.uid()) = 'admin'
  );

-- ===================
-- 6. RLS POLICIES â REFERRAL TREE
-- ===================
ALTER TABLE public.referral_tree ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own referral entry"
  ON public.referral_tree FOR SELECT
  USING (user_id = auth.uid() OR invited_by = auth.uid());

CREATE POLICY "Admins can view full referral tree"
  ON public.referral_tree FOR SELECT
  USING (
    (SELECT raw_user_meta_data->>'role' FROM auth.users WHERE id = auth.uid()) = 'admin'
  );

-- ===================
-- 7. SEED EXISTING USERS AS FOUNDING MEMBERS
-- ===================
-- Insert all current users into referral_tree with depth 0 (founding members)
INSERT INTO public.referral_tree (user_id, invited_by, depth, chain_path)
SELECT id, NULL, 0, '{}'
FROM auth.users
WHERE id NOT IN (SELECT user_id FROM public.referral_tree)
ON CONFLICT (user_id) DO NOTHING;

-- Generate referral codes for existing users who don't have one
UPDATE public.profiles
SET referral_code = UPPER(LEFT(COALESCE(username, 'USER'), 4)) || '-' ||
  SUBSTR(MD5(RANDOM()::text), 1, 4)
WHERE referral_code IS NULL;

-- ===================
-- 8. FEATURE FLAG
-- ===================
INSERT INTO public.feature_flags (key, enabled, description)
VALUES (
  'invite_only_enrollment',
  true,
  'When enabled, new signups require a valid invite token or code'
)
ON CONFLICT (key) DO UPDATE SET enabled = true;

-- ===================
-- 9. RPC: Check invite daily limit (race-condition safe)
-- ===================
CREATE OR REPLACE FUNCTION public.check_and_increment_invite_limit(p_inviter_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INT;
  v_limit INT := 5;
  v_is_admin BOOLEAN;
BEGIN
  -- Check if admin (bypass limit)
  SELECT (raw_user_meta_data->>'role') = 'admin'
  INTO v_is_admin
  FROM auth.users WHERE id = p_inviter_id;

  IF v_is_admin THEN
    RETURN json_build_object('allowed', true, 'remaining', -1, 'is_admin', true);
  END IF;

  -- Lock and count today's invites for this user (advisory lock prevents race conditions)
  PERFORM pg_advisory_xact_lock(hashtext(p_inviter_id::text || date_trunc('day', now() AT TIME ZONE 'UTC')::text));

  SELECT COUNT(*)
  INTO v_count
  FROM public.invitations
  WHERE inviter_id = p_inviter_id
    AND created_at >= date_trunc('day', now() AT TIME ZONE 'UTC')
    AND created_at < date_trunc('day', now() AT TIME ZONE 'UTC') + INTERVAL '1 day';

  IF v_count >= v_limit THEN
    RETURN json_build_object(
      'allowed', false,
      'remaining', 0,
      'resets_at', (date_trunc('day', now() AT TIME ZONE 'UTC') + INTERVAL '1 day')::text
    );
  END IF;

  RETURN json_build_object('allowed', true, 'remaining', v_limit - v_count - 1);
END;
$$;

-- ===================
-- 10. RPC: Accept invite and build referral tree
-- ===================
CREATE OR REPLACE FUNCTION public.accept_invitation(
  p_token TEXT DEFAULT NULL,
  p_invite_code TEXT DEFAULT NULL,
  p_new_user_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invitation RECORD;
  v_parent RECORD;
  v_new_depth INT;
  v_new_chain UUID[];
  v_referral_code TEXT;
BEGIN
  -- Find the invitation
  IF p_token IS NOT NULL THEN
    SELECT * INTO v_invitation FROM public.invitations WHERE token = p_token;
  ELSIF p_invite_code IS NOT NULL THEN
    SELECT * INTO v_invitation FROM public.invitations WHERE invite_code = UPPER(p_invite_code);
  ELSE
    RETURN json_build_object('success', false, 'error', 'No token or code provided');
  END IF;

  IF v_invitation IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'not_found');
  END IF;

  IF v_invitation.status != 'pending' THEN
    RETURN json_build_object('success', false, 'error', 'already_used');
  END IF;

  IF v_invitation.expires_at < now() THEN
    UPDATE public.invitations SET status = 'expired' WHERE id = v_invitation.id;
    RETURN json_build_object('success', false, 'error', 'expired');
  END IF;

  -- Mark invitation as accepted
  UPDATE public.invitations
  SET status = 'accepted',
      accepted_by = p_new_user_id,
      accepted_at = now()
  WHERE id = v_invitation.id;

  -- Get inviter's referral tree entry for chain computation
  SELECT * INTO v_parent
  FROM public.referral_tree
  WHERE user_id = v_invitation.inviter_id;

  IF v_parent IS NOT NULL THEN
    v_new_depth := v_parent.depth + 1;
    v_new_chain := v_parent.chain_path || v_invitation.inviter_id;
  ELSE
    v_new_depth := 1;
    v_new_chain := ARRAY[v_invitation.inviter_id];
  END IF;

  -- Insert into referral tree
  INSERT INTO public.referral_tree (user_id, invited_by, invitation_id, depth, chain_path)
  VALUES (p_new_user_id, v_invitation.inviter_id, v_invitation.id, v_new_depth, v_new_chain)
  ON CONFLICT (user_id) DO NOTHING;

  -- Generate referral code for new user
  v_referral_code := UPPER(LEFT(
    COALESCE(
      (SELECT username FROM public.profiles WHERE user_id = p_new_user_id),
      'USER'
    ), 4
  )) || '-' || UPPER(SUBSTR(MD5(RANDOM()::text), 1, 4));

  -- Update profile
  UPDATE public.profiles
  SET invited_via = v_invitation.id,
      referral_code = v_referral_code
  WHERE user_id = p_new_user_id;

  RETURN json_build_object(
    'success', true,
    'invitation_id', v_invitation.id,
    'inviter_id', v_invitation.inviter_id,
    'depth', v_new_depth,
    'referral_code', v_referral_code
  );
END;
$$;

-- ========================================
-- Source: 20260412_user_theme_preference.sql
-- ========================================
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS theme text DEFAULT 'system'
  CHECK (theme IN ('light', 'dark', 'system'));

-- ========================================
-- Source: 20260413000000_platform_settings.sql
-- ========================================
-- ============================================================
-- iCareerOS: Platform Settings Enhancement
-- Migration: 20260413000000_platform_settings.sql
-- Description: Adds updated_at tracking to feature_flags,
--   adds admin update policy, ensures the toggle works from
--   the PlatformSettings admin page.
-- ============================================================

-- ===================
-- 1. ADD updated_at TO feature_flags (if not exists)
-- ===================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'feature_flags'
      AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.feature_flags
      ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now();
  END IF;
END $$;

-- ===================
-- 2. RLS: Allow admins to update feature flags
-- ===================
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

-- Admins can read all feature flags
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'feature_flags'
      AND policyname = 'Admins can view feature flags'
  ) THEN
    CREATE POLICY "Admins can view feature flags"
      ON public.feature_flags FOR SELECT
      USING (
        (SELECT raw_user_meta_data->>'role' FROM auth.users WHERE id = auth.uid()) = 'admin'
      );
  END IF;
END $$;

-- Admins can update feature flags
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'feature_flags'
      AND policyname = 'Admins can update feature flags'
  ) THEN
    CREATE POLICY "Admins can update feature flags"
      ON public.feature_flags FOR UPDATE
      USING (
        (SELECT raw_user_meta_data->>'role' FROM auth.users WHERE id = auth.uid()) = 'admin'
      );
  END IF;
END $$;

-- Authenticated users can read feature flags (needed for signup gate check)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'feature_flags'
      AND policyname = 'Authenticated users can read feature flags'
  ) THEN
    CREATE POLICY "Authenticated users can read feature flags"
      ON public.feature_flags FOR SELECT
      USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- Anonymous users can read feature flags (needed for signup page to check mode)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'feature_flags'
      AND policyname = 'Anon users can read feature flags'
  ) THEN
    CREATE POLICY "Anon users can read feature flags"
      ON public.feature_flags FOR SELECT
      USING (auth.role() = 'anon');
  END IF;
END $$;

-- ===================
-- 3. RPC: Check registration mode (for signup page)
-- ===================
CREATE OR REPLACE FUNCTION public.check_registration_mode()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invite_only BOOLEAN;
BEGIN
  SELECT enabled INTO v_invite_only
  FROM public.feature_flags
  WHERE key = 'invite_only_enrollment';

  -- Default to invite-only if flag doesn't exist
  IF v_invite_only IS NULL THEN
    v_invite_only := true;
  END IF;

  RETURN json_build_object(
    'invite_only', v_invite_only,
    'mode', CASE WHEN v_invite_only THEN 'invite_only' ELSE 'public' END
  );
END;
$$;

-- Grant execute to anon so the signup page can check the mode
GRANT EXECUTE ON FUNCTION public.check_registration_mode() TO anon;
GRANT EXECUTE ON FUNCTION public.check_registration_mode() TO authenticated;

-- ========================================
-- Source: 20260413_001_job_postings.sql
-- ========================================
-- iCareerOS v5 — job_postings table
-- Stores opportunities scraped by GitHub Actions every 2 hours.
-- All search queries read from this table. No external API calls at query time.

CREATE TABLE IF NOT EXISTS job_postings (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id     text        UNIQUE NOT NULL,
  title           text        NOT NULL,
  company         text,
  location        text,
  is_remote       boolean     DEFAULT false,
  job_type        text        CHECK (job_type IN ('fulltime','parttime','contract','internship') OR job_type IS NULL),
  salary_min      integer,
  salary_max      integer,
  salary_currency text        DEFAULT 'USD',
  description     text,
  job_url         text        NOT NULL,
  apply_url       text,
  source          text        NOT NULL,
  date_posted     timestamptz,
  scraped_at      timestamptz DEFAULT now(),
  expires_at      timestamptz GENERATED ALWAYS AS (scraped_at + interval '7 days') STORED
);

CREATE INDEX IF NOT EXISTS idx_job_postings_fts
  ON job_postings USING gin(to_tsvector('english', coalesce(title,'') || ' ' || coalesce(company,'') || ' ' || coalesce(description,'')));
CREATE INDEX IF NOT EXISTS idx_job_postings_scraped   ON job_postings(scraped_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_postings_expires   ON job_postings(expires_at);
CREATE INDEX IF NOT EXISTS idx_job_postings_source    ON job_postings(source);
CREATE INDEX IF NOT EXISTS idx_job_postings_remote    ON job_postings(is_remote) WHERE is_remote = true;

ALTER TABLE job_postings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read job_postings"   ON job_postings FOR SELECT USING (true);
CREATE POLICY "service write job_postings" ON job_postings FOR ALL   USING (auth.role() = 'service_role');

-- ========================================
-- Source: 20260413_004_search_queries.sql
-- ========================================
-- iCareerOS v5 — search_queries table
-- Records every search to power the scraper's dynamic SEARCH_CONFIGS.
-- Top searched terms get added to the scraper automatically.

CREATE TABLE IF NOT EXISTS search_queries (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  search_term text        NOT NULL,
  location    text,
  is_remote   boolean,
  result_count integer,
  queried_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_search_queries_term ON search_queries(search_term);
CREATE INDEX IF NOT EXISTS idx_search_queries_time ON search_queries(queried_at DESC);

ALTER TABLE search_queries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service write search_queries" ON search_queries FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "users read own queries"       ON search_queries FOR SELECT USING (user_id = auth.uid());

-- ========================================
-- Source: 20260413_005_search_terms_fn.sql
-- ========================================
-- Helper function used by the scraper to fetch top user search terms dynamically.
CREATE OR REPLACE FUNCTION get_top_search_terms(limit_count integer DEFAULT 10)
RETURNS TABLE(search_term text, location text, search_count bigint)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    search_term,
    COALESCE(location, 'United States') AS location,
    COUNT(*) AS search_count
  FROM search_queries
  WHERE queried_at > now() - interval '7 days'
    AND search_term IS NOT NULL
    AND length(trim(search_term)) > 2
  GROUP BY search_term, location
  ORDER BY search_count DESC
  LIMIT limit_count;
$$;

-- ========================================
-- Source: 20260414000000_user_theme_preference.sql
-- ========================================
-- Add theme_preference to profiles table (project uses 'profiles', not 'user_profiles')
-- Mirrors the existing 'theme' column pattern used by ThemeContext
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS theme_preference text DEFAULT 'system'
    CHECK (theme_preference IN ('light', 'dark', 'system'));

COMMENT ON COLUMN profiles.theme_preference IS
  'User-selected theme: light, dark, or system (follows OS preference)';

-- Backfill from existing theme column if present
UPDATE profiles
SET theme_preference = theme
WHERE theme IS NOT NULL
  AND theme IN ('light', 'dark', 'system')
  AND theme_preference = 'system';

-- ========================================
-- Source: 20260414100000_fix_scraped_jobs_view.sql
-- ========================================
-- ============================================================
-- Fix: scraped_jobs view — computed market_rate + seniority
-- ============================================================
-- Context: the previous hotfix created a VIEW named scraped_jobs
-- on top of job_postings to surface employer postings to job seekers.
-- That view left market_rate and seniority as NULL because it did not
-- map salary_min/salary_max to market_rate or experience_level to seniority.
-- This migration re-creates the view with those columns computed.
-- ============================================================

CREATE OR REPLACE VIEW public.scraped_jobs AS
SELECT
  jp.id,
  jp.title,
  jp.company,
  jp.location,

  -- job_type: use job_type column; fall back to remote_type for older rows
  COALESCE(jp.job_type, jp.remote_type) AS job_type,

  jp.description,
  NULL::text  AS source_id,

  -- is_remote: explicit flag takes priority, then infer from remote_type
  COALESCE(
    jp.is_remote,
    jp.remote_type IN ('remote', 'hybrid')
  )           AS is_remote,

  -- FIX: map experience_level to seniority so the career-level filter works
  jp.experience_level AS seniority,

  -- FIX: compute market_rate from salary_min/max so the salary filter works
  CASE
    WHEN jp.salary_min IS NOT NULL AND jp.salary_max IS NOT NULL
      THEN (jp.salary_min + jp.salary_max) / 2
    WHEN jp.salary_max IS NOT NULL THEN jp.salary_max
    WHEN jp.salary_min IS NOT NULL THEN jp.salary_min
    ELSE NULL
  END         AS market_rate,

  -- Human-readable salary string for display
  CASE
    WHEN jp.salary_min IS NOT NULL AND jp.salary_max IS NOT NULL
      THEN '$' || to_char(jp.salary_min, 'FM999,999')
        || ' - $' || to_char(jp.salary_max, 'FM999,999')
    WHEN jp.salary_max IS NOT NULL
      THEN 'Up to $' || to_char(jp.salary_max, 'FM999,999')
    WHEN jp.salary_min IS NOT NULL
      THEN 'From $' || to_char(jp.salary_min, 'FM999,999')
    ELSE NULL
  END         AS salary,

  -- Employer postings start at quality_score 50; no fake-job flags
  50           AS quality_score,
  false        AS is_flagged,
  NULL::jsonb  AS flag_reasons,
  NULL::jsonb  AS compensation_breakdown,
  NULL::jsonb  AS salary_range_estimated,
  NULL::text   AS industry,

  jp.created_at,
  jp.created_at  AS first_seen_at,
  jp.updated_at  AS last_seen_at,
  NULL::text     AS job_url,
  'internal'     AS source

FROM public.job_postings jp
WHERE jp.status = 'active';

-- Grant read access to authenticated users and anon
GRANT SELECT ON public.scraped_jobs TO anon, authenticated;

COMMENT ON VIEW public.scraped_jobs IS
  'Unified job feed: surfaces active employer postings with computed market_rate and seniority for job-seeker search filters.';

-- ========================================
-- Source: 20260414_ai_search_feature_flag.sql
-- ========================================
-- Feature flag to control AI-powered job search (Firecrawl)
-- Currently OFF — operating in database-only mode at zero cost
-- Turn ON when ready to re-enable AI search with a Firecrawl API key
INSERT INTO feature_flags (key, enabled, description) VALUES
  ('ai_search', false, 'Enable AI-powered web search via Firecrawl API (adds external cost)')
ON CONFLICT (key) DO NOTHING;

-- ========================================
-- Source: 20260415_001_job_discovery_schema.sql
-- ========================================
-- =============================================================================
-- iCareerOS v5 — Job Discovery Microservices
-- Migration 001: Core schema for 6-service pipeline
-- Tables: raw_jobs, extracted_jobs, deduplicated_jobs, job_scores,
--         extraction_feedback, extraction_accuracy, platform_events
--
-- COMPATIBILITY: These are net-new tables. Existing job_postings,
-- discovered_jobs, user_search_preferences are NOT modified.
--
-- BRIDGE NOTE: The job-spy-adapter reads from the existing `job_postings`
-- table (populated by GitHub Actions every 2h) and feeds raw_jobs here.
-- No duplicate scraping. Zero cost increase.
-- =============================================================================

-- Raw opportunities (sourced from fetchers — JobSpy bridge + Cowork APIs)
CREATE TABLE IF NOT EXISTS raw_jobs (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  source          text        NOT NULL,             -- 'indeed','linkedin','greenhouse','lever', etc
  source_job_id   text        NOT NULL,             -- Original ID from source
  title           text,
  company         text,
  location        text,
  remote_type     text        CHECK (remote_type IN ('remote','hybrid','onsite','unknown')),
  salary_min      integer,
  salary_max      integer,
  url             text        UNIQUE NOT NULL,
  raw_html        text,                             -- HTML from Puppeteer/Cheerio (Cowork APIs)
  raw_json        jsonb,                            -- JSON from API responses
  fetch_method    text        CHECK (fetch_method IN ('jobspy_bridge','cowork_api','puppeteer','cheerio','rss')),
  fetched_at      timestamptz,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_raw_jobs_source     ON raw_jobs(source);
CREATE INDEX IF NOT EXISTS idx_raw_jobs_url        ON raw_jobs(url);
CREATE INDEX IF NOT EXISTS idx_raw_jobs_fetched    ON raw_jobs(fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_raw_jobs_source_id  ON raw_jobs(source, source_job_id);
CREATE INDEX IF NOT EXISTS idx_raw_jobs_created ON raw_jobs(created_at DESC);


-- Extracted opportunities (structured data parsed by Mistral 7B or Claude)
CREATE TABLE IF NOT EXISTS extracted_jobs (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_job_id              uuid        REFERENCES raw_jobs(id) ON DELETE CASCADE,
  source                  text        NOT NULL,
  source_job_id           text,
  title                   text        NOT NULL,
  company                 text        NOT NULL,
  location                text,
  remote_type             text        CHECK (remote_type IN ('remote','hybrid','onsite','unknown')),
  required_skills         text[]      DEFAULT '{}',
  experience_level        text        CHECK (experience_level IN ('entry','mid','senior','executive','unknown')),
  employment_type         text        CHECK (employment_type IN ('full-time','contract','part-time','intern','unknown')),
  job_description_clean   text,                     -- Marketing/boilerplate stripped
  salary_min              integer,
  salary_max              integer,
  currency                text        DEFAULT 'USD',
  confidence_score        float       DEFAULT 0.5   CHECK (confidence_score BETWEEN 0.0 AND 1.0),
  extraction_method       text        CHECK (extraction_method IN ('mistral','claude','fallback_manual')),
  extracted_at            timestamptz,
  created_at              timestamptz DEFAULT now(),

  UNIQUE(raw_job_id)
);

CREATE INDEX IF NOT EXISTS idx_extracted_company    ON extracted_jobs(company);
CREATE INDEX IF NOT EXISTS idx_extracted_skills     ON extracted_jobs USING GIN(required_skills);
CREATE INDEX IF NOT EXISTS idx_extracted_confidence ON extracted_jobs(confidence_score DESC);
CREATE INDEX IF NOT EXISTS idx_extracted_source     ON extracted_jobs(source, extracted_at DESC);
CREATE INDEX IF NOT EXISTS idx_extracted_created ON extracted_jobs(created_at DESC);


-- Deduplicated opportunities (1 record per unique title+company+location)
CREATE TABLE IF NOT EXISTS deduplicated_jobs (
  id                        uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  title                     text    NOT NULL,
  company                   text    NOT NULL,
  location                  text,
  job_hash                  text    UNIQUE NOT NULL,  -- SHA256(lower(title)||lower(company)||lower(location))
  sources                   jsonb   NOT NULL DEFAULT '[]',
                            -- [{"source":"indeed","job_id":"...","url":"...","seen_at":"..."}]
  source_count              integer GENERATED ALWAYS AS (jsonb_array_length(sources)) STORED,
  primary_extracted_job_id  uuid    REFERENCES extracted_jobs(id),
  deduped_at                timestamptz,
  created_at                timestamptz DEFAULT now(),
  updated_at                timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dedup_hash    ON deduplicated_jobs(job_hash);
CREATE INDEX IF NOT EXISTS idx_dedup_company ON deduplicated_jobs(company);
CREATE INDEX IF NOT EXISTS idx_dedup_title   ON deduplicated_jobs(lower(title));

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_dedup_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_dedup_updated_at ON deduplicated_jobs;
CREATE TRIGGER trg_dedup_updated_at
  BEFORE UPDATE ON deduplicated_jobs
  FOR EACH ROW EXECUTE FUNCTION update_dedup_jobs_updated_at();


-- Job scores (profile fit — user × deduped job)
CREATE TABLE IF NOT EXISTS job_scores (
  id                      uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  deduplicated_job_id     uuid    REFERENCES deduplicated_jobs(id) ON DELETE CASCADE,
  profile_id              uuid    REFERENCES auth.users(id) ON DELETE CASCADE,
  skill_match_pct         integer CHECK (skill_match_pct BETWEEN 0 AND 100),
  experience_match_pct    integer CHECK (experience_match_pct BETWEEN 0 AND 100),
  location_match_pct      integer CHECK (location_match_pct BETWEEN 0 AND 100),
  salary_match_pct        integer CHECK (salary_match_pct BETWEEN 0 AND 100),
  fit_score               integer CHECK (fit_score BETWEEN 0 AND 100),
  fit_reasoning           text,
  scored_at               timestamptz,
  created_at              timestamptz DEFAULT now(),

  UNIQUE(deduplicated_job_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_scores_profile ON job_scores(profile_id, fit_score DESC);
CREATE INDEX IF NOT EXISTS idx_scores_dedup   ON job_scores(deduplicated_job_id);
CREATE INDEX IF NOT EXISTS idx_scores_top     ON job_scores(profile_id, fit_score DESC) WHERE fit_score >= 60;


-- Extraction feedback (user corrections → learning loop)
CREATE TABLE IF NOT EXISTS extraction_feedback (
  id                  uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  extracted_job_id    uuid    REFERENCES extracted_jobs(id) ON DELETE CASCADE,
  profile_id          uuid    REFERENCES auth.users(id) ON DELETE CASCADE,
  is_correct          boolean,
  corrections         jsonb,  -- {"required_skills": ["actual","skills"], "experience_level": "senior"}
  confidence_before   float,
  feedback_at         timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feedback_job     ON extraction_feedback(extracted_job_id);
CREATE INDEX IF NOT EXISTS idx_feedback_profile ON extraction_feedback(profile_id);
CREATE INDEX IF NOT EXISTS idx_feedback_recent  ON extraction_feedback(feedback_at DESC);


-- Extraction accuracy (per-source learning metrics)
CREATE TABLE IF NOT EXISTS extraction_accuracy (
  id                  uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  source              text    UNIQUE NOT NULL,
  accuracy_7d         float   DEFAULT 0.75,
  accuracy_30d        float   DEFAULT 0.75,
  total_extractions   integer DEFAULT 0,
  total_corrections   integer DEFAULT 0,
  last_retrain        timestamptz,
  prompt_version      integer DEFAULT 1,
  prompt_override     text,   -- Custom prompt for this source when accuracy < 0.80
  updated_at          timestamptz DEFAULT now()
);

-- Seed known sources
INSERT INTO extraction_accuracy (source) VALUES
  ('indeed'),('linkedin'),('greenhouse'),('lever'),('smartrecruiters'),
  ('remotive'),('weworkremotely'),('wellfound'),('ziprecruiter'),
  ('google'),('glassdoor'),('dice')
ON CONFLICT (source) DO NOTHING;


-- Platform events (event bus — services communicate through this table)
CREATE TABLE IF NOT EXISTS platform_events (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type    text        NOT NULL,
                            -- 'job.fetched' | 'job.extracted' | 'job.deduped' | 'job.scored'
                            -- | 'extraction.low_confidence' | 'accuracy.degraded'
                            -- | 'batch.fetch_started' | 'batch.extract_started'
  payload       jsonb       NOT NULL DEFAULT '{}',
  consumed_by   text[]      DEFAULT '{}',
  published_at  timestamptz DEFAULT now(),
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_events_type      ON platform_events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_published ON platform_events(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_unconsumed
  ON platform_events(event_type, published_at)
  WHERE consumed_by = '{}';

-- Auto-purge events older than 7 days to keep table lean
CREATE OR REPLACE FUNCTION purge_old_platform_events()
RETURNS integer AS $$
DECLARE rows_deleted integer;
BEGIN
  DELETE FROM platform_events WHERE published_at < now() - interval '7 days';
  GET DIAGNOSTICS rows_deleted = ROW_COUNT;
  RETURN rows_deleted;
END;
$$ LANGUAGE plpgsql;


-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================
ALTER TABLE raw_jobs             ENABLE ROW LEVEL SECURITY;
ALTER TABLE extracted_jobs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE deduplicated_jobs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_scores           ENABLE ROW LEVEL SECURITY;
ALTER TABLE extraction_feedback  ENABLE ROW LEVEL SECURITY;
ALTER TABLE extraction_accuracy  ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_events      ENABLE ROW LEVEL SECURITY;

-- Service role has full access to everything (scrapers, batch opportunities)
CREATE POLICY "service_full_raw_jobs"           ON raw_jobs           FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_full_extracted_jobs"     ON extracted_jobs     FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_full_deduplicated_jobs"  ON deduplicated_jobs  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_full_job_scores"         ON job_scores         FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_full_feedback"           ON extraction_feedback FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_full_accuracy"           ON extraction_accuracy FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_full_events"             ON platform_events    FOR ALL USING (auth.role() = 'service_role');

-- Authenticated users can read deduplicated opportunities and their own scores
CREATE POLICY "auth_read_dedup_jobs"    ON deduplicated_jobs  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "auth_own_scores"         ON job_scores         FOR SELECT USING (auth.uid() = profile_id);
CREATE POLICY "auth_own_feedback"       ON extraction_feedback FOR ALL  USING (auth.uid() = profile_id);
CREATE POLICY "auth_read_accuracy"      ON extraction_accuracy FOR SELECT USING (auth.role() = 'authenticated');


-- =============================================================================
-- HELPER VIEWS
-- =============================================================================

-- Top opportunities per user (score >= 60, last 30 days)
CREATE OR REPLACE VIEW user_job_feed AS
SELECT
  dj.id, dj.title, dj.company, dj.location, dj.job_hash,
  ej.remote_type, ej.required_skills, ej.experience_level,
  ej.employment_type, ej.salary_min, ej.salary_max, ej.currency,
  ej.job_description_clean,
  dj.source_count,
  js.fit_score, js.skill_match_pct, js.experience_match_pct,
  js.salary_match_pct, js.fit_reasoning, js.profile_id
FROM deduplicated_jobs dj
JOIN extracted_jobs     ej ON ej.id = dj.primary_extracted_job_id
JOIN job_scores         js ON js.deduplicated_job_id = dj.id
WHERE js.fit_score >= 60
  AND dj.created_at > now() - interval '30 days'
ORDER BY js.fit_score DESC;

-- Pipeline stats (last 24 hours)
CREATE OR REPLACE VIEW pipeline_stats_24h AS
SELECT
  (SELECT count(*) FROM raw_jobs       WHERE created_at   > now() - interval '24h') AS raw_fetched,
  (SELECT count(*) FROM extracted_jobs WHERE extracted_at > now() - interval '24h') AS extracted,
  (SELECT count(*) FROM deduplicated_jobs WHERE created_at > now() - interval '24h') AS deduped,
  (SELECT count(*) FROM job_scores     WHERE scored_at    > now() - interval '24h') AS scored,
  (SELECT count(*) FROM platform_events WHERE published_at > now() - interval '24h') AS events_published,
  (SELECT avg(confidence_score) FROM extracted_jobs WHERE extracted_at > now() - interval '24h') AS avg_confidence;

-- ========================================
-- Source: 20260415_002_schedule_batch_jobs.sql
-- ========================================
-- =============================================================================
-- iCareerOS v5 — Job Discovery Microservices
-- Migration 002: pg_cron batch scheduling (SQL-only, no edge function HTTP calls)
--
-- Pipeline schedule (UTC):
--   02:00  → Scraping via GitHub Actions (every 2h, free)
--   03:00  → Fire extraction batch event (GitHub Actions picks up + processes)
--   04:00  → Fire dedup batch event (GitHub Actions picks up + processes)
--   05:00  → Fire score batch event (GitHub Actions picks up + processes)
--   06:00  → Recalculate extraction accuracy stats (pure SQL)
--   Sun 00:00  → Archive stale opportunities + purge old events (pure SQL)
--
-- All schedules use pure SQL functions — no HTTP calls, no secrets needed.
-- GitHub Actions workflows run on their own schedule and also react to
-- platform_events via the event-listeners service.
-- =============================================================================

-- pg_cron requires Pro plan — skipped
-- CREATE EXTENSION IF NOT EXISTS pg_cron;

-- =============================================================================
-- BATCH TRIGGER FUNCTIONS
-- These insert events into platform_events; TypeScript services react.
-- =============================================================================

CREATE OR REPLACE FUNCTION trigger_extract_batch()
RETURNS void AS $$
BEGIN
  INSERT INTO platform_events (event_type, payload)
  VALUES (
    'batch.extract_started',
    jsonb_build_object(
      'triggered_at', now(),
      'source', 'pg_cron',
      'pending_count', (
        SELECT count(*) FROM raw_jobs r
        WHERE NOT EXISTS (
          SELECT 1 FROM extracted_jobs e WHERE e.raw_job_id = r.id
        )
        AND r.created_at > now() - interval '48 hours'
      )
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION trigger_dedup_batch()
RETURNS void AS $$
BEGIN
  INSERT INTO platform_events (event_type, payload)
  VALUES (
    'batch.dedup_started',
    jsonb_build_object(
      'triggered_at', now(),
      'source', 'pg_cron',
      'pending_count', (
        SELECT count(*) FROM extracted_jobs ej
        WHERE NOT EXISTS (
          SELECT 1 FROM deduplicated_jobs dj
          WHERE dj.primary_extracted_job_id = ej.id
        )
        AND ej.created_at > now() - interval '48 hours'
      )
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION trigger_score_batch()
RETURNS void AS $$
BEGIN
  INSERT INTO platform_events (event_type, payload)
  VALUES (
    'batch.score_started',
    jsonb_build_object(
      'triggered_at', now(),
      'source', 'pg_cron',
      'unscored_jobs', (
        SELECT count(*) FROM deduplicated_jobs dj
        WHERE dj.created_at > now() - interval '48 hours'
      )
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION update_extraction_accuracy_stats()
RETURNS void AS $$
BEGIN
  -- Recalculate accuracy per source from feedback table
  UPDATE extraction_accuracy ea
  SET
    accuracy_7d = COALESCE((
      SELECT
        sum(CASE WHEN ef.is_correct THEN 1 ELSE 0 END)::float
        / NULLIF(count(*), 0)
      FROM extraction_feedback ef
      JOIN extracted_jobs ej ON ej.id = ef.extracted_job_id
      WHERE ej.source = ea.source
        AND ef.feedback_at > now() - interval '7 days'
    ), ea.accuracy_7d),
    accuracy_30d = COALESCE((
      SELECT
        sum(CASE WHEN ef.is_correct THEN 1 ELSE 0 END)::float
        / NULLIF(count(*), 0)
      FROM extraction_feedback ef
      JOIN extracted_jobs ej ON ej.id = ef.extracted_job_id
      WHERE ej.source = ea.source
        AND ef.feedback_at > now() - interval '30 days'
    ), ea.accuracy_30d),
    total_extractions = (
      SELECT count(*) FROM extracted_jobs WHERE source = ea.source
    ),
    total_corrections = (
      SELECT count(*) FROM extraction_feedback ef
      JOIN extracted_jobs ej ON ej.id = ef.extracted_job_id
      WHERE ej.source = ea.source AND ef.is_correct = false
    ),
    updated_at = now();

  -- Flag sources with accuracy < 80% by publishing an event
  INSERT INTO platform_events (event_type, payload)
  SELECT
    'accuracy.degraded',
    jsonb_build_object(
      'source', source,
      'accuracy_7d', accuracy_7d,
      'prompt_version', prompt_version
    )
  FROM extraction_accuracy
  WHERE accuracy_7d < 0.80
    AND total_extractions > 10;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION archive_stale_jobs()
RETURNS integer AS $$
DECLARE
  rows_deleted integer := 0;
  n integer;
BEGIN
  -- Nullify raw_html on raw_jobs > 7 days (save storage, keep metadata)
  UPDATE raw_jobs SET raw_html = NULL
  WHERE raw_html IS NOT NULL AND created_at < now() - interval '7 days';

  -- Archive raw_jobs older than 30 days (keep extracted data)
  DELETE FROM raw_jobs WHERE created_at < now() - interval '30 days' AND raw_html IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  rows_deleted := rows_deleted + n;

  -- Purge old platform events (> 7 days)
  SELECT purge_old_platform_events() INTO n;
  rows_deleted := rows_deleted + n;

  -- Purge job_scores for users who haven't logged in in 90 days
  DELETE FROM job_scores
  WHERE profile_id IN (
    SELECT id FROM auth.users
    WHERE last_sign_in_at < now() - interval '90 days'
  );
  GET DIAGNOSTICS n = ROW_COUNT;
  rows_deleted := rows_deleted + n;

  RETURN rows_deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- =============================================================================
-- pg_cron SCHEDULES (SQL-only — no HTTP calls, no secrets required)
-- =============================================================================

-- 03:00 UTC — fire extraction batch event (GHA job-extractor.yml picks up)
-- pg_cron not available — skipped
-- SELECT cron.schedule(
  'jd-extract-batch',
  '0 3 * * *',
  'SELECT trigger_extract_batch()'
);

-- 04:00 UTC — fire dedup batch event (GHA job-deduplicator.yml picks up)
-- pg_cron not available — skipped
-- SELECT cron.schedule(
  'jd-dedup-batch',
  '0 4 * * *',
  'SELECT trigger_dedup_batch()'
);

-- 05:00 UTC — fire score/match batch event (GHA job-matcher.yml picks up)
-- pg_cron not available — skipped
-- SELECT cron.schedule(
  'jd-score-batch',
  '0 5 * * *',
  'SELECT trigger_score_batch()'
);

-- 06:00 UTC — recalculate extraction accuracy (pure SQL, no service needed)
-- pg_cron not available — skipped
-- SELECT cron.schedule(
  'jd-accuracy-update',
  '0 6 * * *',
  'SELECT update_extraction_accuracy_stats()'
);

-- 00:00 UTC Sunday — archive stale data + purge old events
-- pg_cron not available — skipped
-- SELECT cron.schedule(
  'jd-archive-stale',
  '0 0 * * 0',
  'SELECT archive_stale_jobs()'
);


-- =============================================================================
-- VERIFICATION
-- =============================================================================
DO $$
BEGIN
  ASSERT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'jd-extract-batch'),
    'jd-extract-batch cron job must exist';
  ASSERT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'jd-dedup-batch'),
    'jd-dedup-batch cron job must exist';
  ASSERT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'jd-score-batch'),
    'jd-score-batch cron job must exist';
  ASSERT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'jd-accuracy-update'),
    'jd-accuracy-update cron job must exist';
  ASSERT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'jd-archive-stale'),
    'jd-archive-stale cron job must exist';
  RAISE NOTICE '✅ Migration 002 verified: all 5 pg_cron opportunities scheduled';
END $$;


-- =============================================================================
-- MANUAL TEST HELPERS (run from SQL editor to test each stage)
-- =============================================================================

-- Test extraction trigger:
-- SELECT trigger_extract_batch();

-- Test dedup trigger:
-- SELECT trigger_dedup_batch();

-- Test score trigger:
-- SELECT trigger_score_batch();

-- Check pipeline stats:
-- SELECT * FROM pipeline_stats_24h;

-- Check all scheduled jobs:
-- SELECT jobname, schedule, command FROM cron.job ORDER BY jobname;

-- Remove all scheduled opportunities (if needed):
-- -- pg_cron not available — skipped
-- SELECT cron.unschedule('jd-extract-batch');
-- -- pg_cron not available — skipped
-- SELECT cron.unschedule('jd-dedup-batch');
-- -- pg_cron not available — skipped
-- SELECT cron.unschedule('jd-score-batch');
-- -- pg_cron not available — skipped
-- SELECT cron.unschedule('jd-accuracy-update');
-- -- pg_cron not available — skipped
-- SELECT cron.unschedule('jd-archive-stale');

-- ========================================
-- Source: 20260416_003_phase0_ingestion_infrastructure.sql
-- ========================================
-- =============================================================================
-- iCareerOS — Migration 003: Phase 0 Job Ingestion Infrastructure
--
-- Adds the ingestion-specific tables required by the Phase 0 pipeline:
--   opportunities              — unified output of all 12 source adapters
--   ingestion_runs    — audit log of every scrape run
--   ingestion_sources — registry of active sources with health stats
--
-- COMPATIBILITY: Additive only. Existing raw_jobs / extracted_jobs tables
-- are untouched. The `jobs` table here feeds raw_jobs via the sourcing bridge.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. opportunities — unified ingestion output (all 12 free sources)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS opportunities (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id                text        NOT NULL,                -- source-native ID
  source_name           text        NOT NULL,                -- 'greenhouse','lever','himalayas', …
  source_type           text        NOT NULL,                -- 'ats_api','aggregator','remote_api','rss_feed','career_page'
  company               text        NOT NULL,
  title                 text        NOT NULL,
  location              text,
  remote_type           text        CHECK (remote_type IN ('remote','hybrid','onsite','unknown')),
  employment_type       text,
  salary_min            numeric,
  salary_max            numeric,
  salary_currency       text        DEFAULT 'USD',
  date_posted           timestamptz,
  date_scraped          timestamptz DEFAULT now() NOT NULL,
  date_last_seen        timestamptz DEFAULT now() NOT NULL,
  application_url       text,
  description           text,
  description_normalized text,
  skills                text[]      DEFAULT '{}',
  job_category          text,
  status                text        DEFAULT 'active'
                          CHECK (status IN ('active','stale','closed')),
  attribution_req       text,                                -- e.g. "Jobs via RemoteOK"
  dedupe_key            text        UNIQUE,                  -- SHA256(title+company+location)
  confidence_score      numeric     DEFAULT 1.0
                          CHECK (confidence_score BETWEEN 0.0 AND 1.0),
  raw_source_reference  jsonb,                               -- full original payload
  created_at            timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_jobs_status      ON opportunities(status);
CREATE INDEX IF NOT EXISTS idx_jobs_company     ON opportunities(company);
CREATE INDEX IF NOT EXISTS idx_jobs_date_posted ON opportunities(date_posted DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_source      ON opportunities(source_name);
CREATE INDEX IF NOT EXISTS idx_jobs_remote_type ON opportunities(remote_type);
CREATE INDEX IF NOT EXISTS idx_jobs_skills      ON opportunities USING GIN(skills);
CREATE INDEX IF NOT EXISTS idx_jobs_last_seen   ON opportunities(date_last_seen DESC);

-- ---------------------------------------------------------------------------
-- 2. ingestion_runs — audit log for every fetch run
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ingestion_runs (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_name     text        NOT NULL,
  started_at      timestamptz DEFAULT now(),
  completed_at    timestamptz,
  jobs_fetched    integer     DEFAULT 0,
  jobs_inserted   integer     DEFAULT 0,
  jobs_updated    integer     DEFAULT 0,
  jobs_closed     integer     DEFAULT 0,
  errors          jsonb       DEFAULT '[]',
  status          text        DEFAULT 'running'
                    CHECK (status IN ('running','success','failed','partial'))
);

CREATE INDEX IF NOT EXISTS idx_ingestion_runs_source ON ingestion_runs(source_name, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_ingestion_runs_status ON ingestion_runs(status, started_at DESC);

-- ---------------------------------------------------------------------------
-- 3. ingestion_sources — registry of all 12 active sources
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ingestion_sources (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_name           text        UNIQUE NOT NULL,
  source_type           text        NOT NULL,
  tier                  integer     NOT NULL,              -- 1=fastest/best, 5=slowest/fallback
  base_url              text,
  requires_key          boolean     DEFAULT false,
  attribution_req       text,
  refresh_hours         integer     DEFAULT 6,
  is_active             boolean     DEFAULT true,
  consecutive_failures  integer     DEFAULT 0,
  last_success_at       timestamptz,
  created_at            timestamptz DEFAULT now()
);

-- Seed all 12 free sources
INSERT INTO ingestion_sources
  (source_name, source_type, tier, refresh_hours, requires_key, attribution_req)
VALUES
  ('greenhouse',      'ats_api',      1,  6,   false, NULL),
  ('lever',           'ats_api',      1,  6,   false, NULL),
  ('ashby',           'ats_api',      1,  6,   false, NULL),
  ('adzuna',          'aggregator',   2,  12,  true,  NULL),
  ('jooble',          'aggregator',   2,  24,  true,  NULL),
  ('himalayas',       'remote_api',   3,  6,   false, 'Jobs via Himalayas'),
  ('remoteok',        'remote_api',   3,  6,   false, 'Jobs via RemoteOK'),
  ('remotive',        'remote_api',   3,  6,   false, 'Jobs via Remotive'),
  ('jobicy',          'remote_api',   3,  12,  false, 'Jobs via Jobicy'),
  ('arbeitnow',       'remote_api',   3,  12,  false, NULL),
  ('weworkremotely',  'rss_feed',     4,  24,  false, NULL),
  ('jsonld_crawl',    'career_page',  5,  24,  false, NULL)
ON CONFLICT (source_name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. Stale detection function — called by pg_cron nightly
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION mark_stale_jobs()
RETURNS void AS $$
BEGIN
  -- Mark stale (48h unseen)
  UPDATE opportunities
  SET status = 'stale'
  WHERE status = 'active'
    AND date_last_seen < now() - INTERVAL '48 hours';

  -- Mark closed (7 days unseen)
  UPDATE opportunities
  SET status = 'closed'
  WHERE status IN ('active', 'stale')
    AND date_last_seen < now() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ---------------------------------------------------------------------------
-- 5. Reset consecutive_failures when source succeeds
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION record_source_success(p_source_name text)
RETURNS void AS $$
BEGIN
  UPDATE ingestion_sources
  SET consecutive_failures = 0,
      last_success_at = now()
  WHERE source_name = p_source_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION record_source_failure(p_source_name text)
RETURNS void AS $$
BEGIN
  UPDATE ingestion_sources
  SET consecutive_failures = consecutive_failures + 1,
      is_active = CASE WHEN consecutive_failures + 1 >= 3 THEN false ELSE is_active END
  WHERE source_name = p_source_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ---------------------------------------------------------------------------
-- 6. Schedule stale detection via pg_cron (runs at 01:00 UTC daily)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'mark-stale-jobs',
      '0 1 * * *',
      'SELECT mark_stale_jobs()'
    );
  END IF;
END $$;

-- ========================================
-- Source: 20260416_004_supplementary_tables.sql
-- ========================================
-- =============================================================================
-- iCareerOS — Migration 004: Supplementary Tables & Functions
-- Run after: 20260415_001_job_discovery_schema.sql
--
-- Adds tables and functions referenced by TypeScript services but not
-- included in earlier migrations:
--   1. query_cache        — used by cache-service/index.ts (SupabaseCache)
--   2. benchmark_reports  — used by benchmarks/index.ts
--   3. mark_events_consumed() — used by event-bus.ts
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. QUERY CACHE TABLE
-- SupabaseCache class in cache-service/index.ts reads/writes this table.
-- TTL-based: expired rows are deleted on next read (lazy expiry).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS query_cache (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key   text        UNIQUE NOT NULL,
  data        jsonb       NOT NULL,
  cached_at   timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  hit_count   integer     NOT NULL DEFAULT 0
);

-- Fast lookup by key (primary access pattern)
CREATE INDEX IF NOT EXISTS idx_query_cache_key
  ON query_cache (cache_key);

-- Enables efficient TTL sweeps and ORDER BY expires_at
CREATE INDEX IF NOT EXISTS idx_query_cache_expires
  ON query_cache (expires_at);

COMMENT ON TABLE query_cache IS
  'Persistent query result cache. TTL enforced lazily on read. Used by SupabaseCache class.';

-- RLS: service role only (no user-facing access)
ALTER TABLE query_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_only_cache"
  ON query_cache
  USING (auth.role() = 'service_role');


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. BENCHMARK REPORTS TABLE
-- BenchmarksService.saveReport() writes daily snapshots here.
-- UNIQUE on report_date prevents duplicate daily runs.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS benchmark_reports (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  report_date  date        UNIQUE NOT NULL,
  performance  jsonb       NOT NULL,   -- PerformanceMetrics
  coverage     jsonb       NOT NULL,   -- CoverageMetrics
  accuracy     jsonb       NOT NULL,   -- AccuracyMetrics
  cost         jsonb       NOT NULL,   -- CostMetrics
  health       jsonb       NOT NULL,   -- HealthMetrics
  created_at   timestamptz DEFAULT now()
);

-- Fast look up of recent reports (dashboard + alerts)
CREATE INDEX IF NOT EXISTS idx_benchmark_reports_date
  ON benchmark_reports (report_date DESC);

COMMENT ON TABLE benchmark_reports IS
  'Daily pipeline health snapshots written by BenchmarksService.generateReport().';

-- RLS: service role writes, authenticated reads for admin dashboard
ALTER TABLE benchmark_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_write_benchmarks"
  ON benchmark_reports
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "service_role_update_benchmarks"
  ON benchmark_reports
  FOR UPDATE
  USING (auth.role() = 'service_role');

CREATE POLICY "authenticated_read_benchmarks"
  ON benchmark_reports
  FOR SELECT
  USING (auth.role() IN ('service_role', 'authenticated'));


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. mark_events_consumed() FUNCTION
-- Called by EventBus.markConsumed() in event-bus.ts.
-- Appends consumer name to consumed_by array, idempotent.
-- SECURITY DEFINER so it can bypass RLS on platform_events.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION mark_events_consumed(
  p_event_ids uuid[],
  p_consumer  text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE platform_events
  SET consumed_by = array_append(consumed_by, p_consumer)
  WHERE id = ANY(p_event_ids)
    AND NOT (p_consumer = ANY(consumed_by));
END;
$$;

COMMENT ON FUNCTION mark_events_consumed IS
  'Marks events as consumed by the given consumer. Idempotent — safe to call multiple times.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. EXPIRED CACHE CLEANUP FUNCTION
-- Called periodically to purge expired cache rows and keep the table lean.
-- Scheduled below via pg_cron.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION cleanup_expired_cache()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM query_cache
  WHERE expires_at < now();

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

COMMENT ON FUNCTION cleanup_expired_cache IS
  'Deletes expired rows from query_cache. Returns number of rows deleted.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. pg_cron: nightly cache cleanup at 03:00 UTC
-- Runs after stale detection (01:00 UTC) and before benchmarks (07:30 UTC).
-- ─────────────────────────────────────────────────────────────────────────────

-- pg_cron not available — skipped
-- SELECT cron.schedule(
  'cleanup-expired-cache',
  '0 3 * * *',  -- 03:00 UTC nightly
  $$SELECT cleanup_expired_cache()$$
);


-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICATION
-- Run after applying migration to confirm all objects were created.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'query_cache' AND table_schema = 'public'
  ), 'query_cache table missing';

  ASSERT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'benchmark_reports' AND table_schema = 'public'
  ), 'benchmark_reports table missing';

  ASSERT EXISTS (
    SELECT 1 FROM information_schema.routines
    WHERE routine_name = 'mark_events_consumed' AND routine_schema = 'public'
  ), 'mark_events_consumed function missing';

  ASSERT EXISTS (
    SELECT 1 FROM information_schema.routines
    WHERE routine_name = 'cleanup_expired_cache' AND routine_schema = 'public'
  ), 'cleanup_expired_cache function missing';

  RAISE NOTICE '✅ Migration 004 verified — all objects created successfully';
END;
$$;

-- ========================================
-- Source: 20260416_006_fix_scraped_jobs_view.sql
-- ========================================
-- Fix scraped_jobs VIEW to read from job_postings (where the scraper actually writes)
-- and add HTML entity decode + tag strip to description.
--
-- Previous session accidentally pointed the view at the `jobs` table instead of
-- `job_postings`. The Python scraper (job-scraper.yml) inserts into `job_postings`;
-- `jobs` is the Phase-0 ingestion table populated by a different pipeline.
--
-- This restores the correct source while keeping HTML cleanup.

CREATE OR REPLACE VIEW public.scraped_jobs AS
SELECT
  jp.id,
  jp.title,
  jp.company,
  jp.location,
  COALESCE(jp.job_type, jp.remote_type)                           AS job_type,

  -- Decode HTML entities and strip tags from scraped descriptions
  trim(regexp_replace(
    regexp_replace(
      replace(replace(replace(replace(replace(replace(replace(
        COALESCE(jp.description, ''),
        '&lt;',  '<'),
        '&gt;',  '>'),
        '&amp;', '&'),
        '&quot;', '"'),
        '&#39;', ''''),
        '&nbsp;', ' '),
        '&#x27;', ''''),
      '<[^>]+>', ' ', 'g'),
    '\s+', ' ', 'g'))                                             AS description,

  jp.external_id                                                  AS source_id,
  COALESCE(jp.is_remote, false)                                   AS is_remote,
  jp.experience_level                                             AS seniority,

  -- Numeric salary midpoint for filtering
  CASE
    WHEN jp.salary_min IS NOT NULL AND jp.salary_max IS NOT NULL
      THEN (jp.salary_min + jp.salary_max) / 2
    WHEN jp.salary_max IS NOT NULL THEN jp.salary_max
    WHEN jp.salary_min IS NOT NULL THEN jp.salary_min
    ELSE NULL
  END                                                             AS market_rate,

  -- Human-readable salary string
  CASE
    WHEN jp.salary_min IS NOT NULL AND jp.salary_max IS NOT NULL
      THEN '$' || to_char(jp.salary_min, 'FM999,999') || ' – $' || to_char(jp.salary_max, 'FM999,999')
    WHEN jp.salary_max IS NOT NULL
      THEN 'Up to $' || to_char(jp.salary_max, 'FM999,999')
    WHEN jp.salary_min IS NOT NULL
      THEN 'From $' || to_char(jp.salary_min, 'FM999,999')
    ELSE NULL
  END                                                             AS salary,

  50                                                              AS quality_score,
  false                                                           AS is_flagged,
  NULL::text[]                                                    AS flag_reasons,

  jp.created_at,
  COALESCE(jp.scraped_at, jp.created_at)                         AS first_seen_at,
  COALESCE(jp.job_url, jp.apply_url)                             AS job_url,
  COALESCE(jp.source, 'scraped')                                 AS source

FROM public.job_postings jp
WHERE jp.status = 'active'          -- employer-posted opportunities
   OR jp.external_id IS NOT NULL    -- scraper-ingested opportunities (external_id set by scraper)
;

GRANT SELECT ON public.scraped_jobs TO anon, authenticated;

-- ========================================
-- Source: 20260416_007_job_validation_columns.sql
-- ========================================
-- ============================================================================
-- Add real validation columns to job_postings and update scraped_jobs view
--
-- Previously quality_score, is_flagged, flag_reasons were hardcoded constants
-- in the VIEW. This migration promotes them to real columns so the scraper
-- and daily revalidation job can write actual results per job.
--
-- New columns:
--   quality_score   integer      0-100, starts at 50; computed by validator
--   is_flagged      boolean      true when quality_score < 40 (risky job)
--   flag_reasons    text[]       human-readable reasons (e.g. "Scam keyword: commission only")
--   validated_at    timestamptz  last time this job was run through the validator
--   url_valid       boolean      null=unchecked, true=URL responds, false=404/gone
-- ============================================================================

-- 1. Add validation columns (idempotent)
ALTER TABLE public.job_postings
  ADD COLUMN IF NOT EXISTS quality_score  integer     DEFAULT 50,
  ADD COLUMN IF NOT EXISTS is_flagged     boolean     DEFAULT false,
  ADD COLUMN IF NOT EXISTS flag_reasons   text[],
  ADD COLUMN IF NOT EXISTS validated_at   timestamptz,
  ADD COLUMN IF NOT EXISTS url_valid      boolean;

-- 2. Index for daily revalidation query (find opportunities not validated in last 24h)
CREATE INDEX IF NOT EXISTS idx_job_postings_validated_at
  ON public.job_postings(validated_at ASC NULLS FIRST)
  WHERE external_id IS NOT NULL;

-- 3. Index for filtering out flagged opportunities efficiently
CREATE INDEX IF NOT EXISTS idx_job_postings_flagged
  ON public.job_postings(is_flagged)
  WHERE external_id IS NOT NULL;

-- 4. Rebuild scraped_jobs view to read validation state from real columns
DROP VIEW IF EXISTS public.scraped_jobs CASCADE;

CREATE VIEW public.scraped_jobs AS
SELECT
  jp.id,
  jp.title,
  jp.company,
  jp.location,
  COALESCE(jp.job_type, jp.remote_type)                           AS job_type,

  -- Decode HTML entities and strip tags from scraped descriptions
  trim(regexp_replace(
    regexp_replace(
      replace(replace(replace(replace(replace(replace(replace(
        COALESCE(jp.description, ''),
        '&lt;',  '<'),
        '&gt;',  '>'),
        '&amp;', '&'),
        '&quot;', '"'),
        '&#39;', ''''),
        '&nbsp;', ' '),
        '&#x27;', ''''),
      '<[^>]+>', ' ', 'g'),
    '\s+', ' ', 'g'))                                             AS description,

  jp.external_id                                                  AS source_id,
  COALESCE(jp.is_remote, false)                                   AS is_remote,
  jp.experience_level                                             AS seniority,

  -- Numeric salary midpoint for filtering
  CASE
    WHEN jp.salary_min IS NOT NULL AND jp.salary_max IS NOT NULL
      THEN (jp.salary_min + jp.salary_max) / 2
    WHEN jp.salary_max IS NOT NULL THEN jp.salary_max
    WHEN jp.salary_min IS NOT NULL THEN jp.salary_min
    ELSE NULL
  END                                                             AS market_rate,

  -- Human-readable salary string
  CASE
    WHEN jp.salary_min IS NOT NULL AND jp.salary_max IS NOT NULL
      THEN '$' || to_char(jp.salary_min, 'FM999,999') || ' – $' || to_char(jp.salary_max, 'FM999,999')
    WHEN jp.salary_max IS NOT NULL
      THEN 'Up to $' || to_char(jp.salary_max, 'FM999,999')
    WHEN jp.salary_min IS NOT NULL
      THEN 'From $' || to_char(jp.salary_min, 'FM999,999')
    ELSE NULL
  END                                                             AS salary,

  -- Real validation columns (no longer hardcoded constants)
  COALESCE(jp.quality_score, 50)                                  AS quality_score,
  COALESCE(jp.is_flagged, false)                                  AS is_flagged,
  jp.flag_reasons                                                 AS flag_reasons,
  jp.validated_at,
  jp.url_valid,

  jp.created_at,
  COALESCE(jp.scraped_at, jp.created_at)                         AS first_seen_at,
  COALESCE(jp.job_url, jp.apply_url)                             AS job_url,
  COALESCE(jp.source, 'scraped')                                 AS source

FROM public.job_postings jp
WHERE jp.status = 'active'          -- employer-posted opportunities
   OR jp.external_id IS NOT NULL    -- scraper-ingested opportunities
;

GRANT SELECT ON public.scraped_jobs TO anon, authenticated;

-- ========================================
-- Source: 20260416_008_user_job_agents.sql
-- ========================================
-- ============================================================================
-- user_job_agents — Per-user job search agent state
--
-- One row per user. Tracks whether the agent needs to re-run (pending),
-- is currently running, idling with fresh results, or sleeping between cycles.
--
-- Lifecycle:
--   INSERT on first profile save      → status = 'pending'
--   Profile matching fields changed   → status = 'pending', next_run_at = now()
--   Agent starts running              → status = 'running'
--   Agent finishes                    → status = 'idle', next_run_at = now() + 8h
--   User is away > 8h                 → next_run_at <= now() → runs on next login
--
-- The run-job-agent edge function reads this table to decide whether to serve
-- cached user_opportunity_matches or run a fresh discovery + scoring pass.
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_job_agents (
  user_id            uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  status             text        NOT NULL DEFAULT 'pending'
                                 CHECK (status IN ('pending','running','idle','sleeping')),
  last_run_at        timestamptz,
  next_run_at        timestamptz NOT NULL DEFAULT now(),
  last_profile_hash  text,                        -- SHA-256 prefix of matching-relevant fields
  match_count        integer     NOT NULL DEFAULT 0,
  run_count          integer     NOT NULL DEFAULT 0,
  last_error         text,
  config             jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- Index: find users whose agent is due to run (background job / cron use)
CREATE INDEX IF NOT EXISTS idx_user_job_agents_next_run
  ON user_job_agents(next_run_at ASC)
  WHERE status IN ('pending', 'sleeping');

ALTER TABLE user_job_agents ENABLE ROW LEVEL SECURITY;

-- Users can read their own agent state (for status polling)
CREATE POLICY "users_read_own_agent"
  ON user_job_agents FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Service role has full access (edge functions use service key)
CREATE POLICY "service_role_full_agent"
  ON user_job_agents FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============================================================================
-- Profile-change trigger
--
-- When matching-relevant fields change on job_seeker_profiles, mark the
-- user's agent as 'pending' so the next login triggers a fresh run.
-- Also creates the agent row on first profile insert.
-- ============================================================================

CREATE OR REPLACE FUNCTION _mark_agent_pending()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO user_job_agents(user_id, status, next_run_at, updated_at)
  VALUES (NEW.user_id, 'pending', now(), now())
  ON CONFLICT (user_id) DO UPDATE SET
    status      = 'pending',
    next_run_at = now(),
    last_error  = NULL,
    updated_at  = now();
  RETURN NEW;
END;
$$;

-- Trigger on profile INSERT (new user completes onboarding)
DROP TRIGGER IF EXISTS trg_profile_insert_agent ON job_seeker_profiles;
CREATE TRIGGER trg_profile_insert_agent
  AFTER INSERT ON job_seeker_profiles
  FOR EACH ROW EXECUTE FUNCTION _mark_agent_pending();

-- Trigger on profile UPDATE — only when matching fields change
CREATE OR REPLACE FUNCTION _mark_agent_pending_on_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF (
    OLD.skills              IS DISTINCT FROM NEW.skills              OR
    OLD.target_job_titles   IS DISTINCT FROM NEW.target_job_titles   OR
    OLD.career_level        IS DISTINCT FROM NEW.career_level        OR
    OLD.location            IS DISTINCT FROM NEW.location            OR
    OLD.preferred_job_types IS DISTINCT FROM NEW.preferred_job_types OR
    OLD.salary_min          IS DISTINCT FROM NEW.salary_min          OR
    OLD.salary_max          IS DISTINCT FROM NEW.salary_max
  ) THEN
    INSERT INTO user_job_agents(user_id, status, next_run_at, updated_at)
    VALUES (NEW.user_id, 'pending', now(), now())
    ON CONFLICT (user_id) DO UPDATE SET
      status      = 'pending',
      next_run_at = now(),
      last_error  = NULL,
      updated_at  = now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profile_update_agent ON job_seeker_profiles;
CREATE TRIGGER trg_profile_update_agent
  AFTER UPDATE ON job_seeker_profiles
  FOR EACH ROW EXECUTE FUNCTION _mark_agent_pending_on_change();

-- ============================================================================
-- Seed: create pending agents for all existing users who have profiles
-- (catches users who signed up before this migration)
-- ============================================================================
INSERT INTO user_job_agents(user_id, status, next_run_at)
SELECT user_id, 'pending', now()
FROM   job_seeker_profiles
ON CONFLICT (user_id) DO NOTHING;

-- ========================================
-- Source: 20260416_009_fix_scraped_jobs_access.sql
-- ========================================
-- ============================================================================
-- Fix scraped_jobs access for browser (non-service-role) clients
--
-- Root causes:
--
-- 1. job_postings has user_id UUID NOT NULL and an RLS policy
--    USING (auth.uid() = user_id). Scraper rows have no user_id so:
--      a. INSERT fails (NOT NULL violation) → scraper silently drops rows
--      b. SELECT from browser client returns 0 rows (RLS filter)
--    Edge functions use SERVICE_ROLE key (bypasses RLS), so they work fine.
--    Browser clients (TodaysMatches fallback, OpportunityRadar) see nothing.
--
-- 2. The hasSubstantiveJobDescription frontend filter requires 140 chars /
--    24 words — moved to DB level is out of scope here; see frontend fix.
--
-- Fixes applied here:
--   a. Make user_id nullable (scraper inserts don't provide one)
--   b. Add SELECT policy allowing authenticated users to read scraped rows
--   c. Add SELECT policy allowing anon users to read scraped rows
--      (needed for scraped_jobs view query via browser Supabase client)
-- ============================================================================

-- 1. Make user_id nullable so scraper inserts succeed
ALTER TABLE public.job_postings
  ALTER COLUMN user_id DROP NOT NULL;

-- 2. Allow authenticated users to SELECT scraper-ingested rows
--    (rows identified by external_id IS NOT NULL)
DROP POLICY IF EXISTS "authenticated_read_scraped_jobs" ON public.job_postings;
CREATE POLICY "authenticated_read_scraped_jobs"
  ON public.job_postings FOR SELECT
  TO authenticated
  USING (external_id IS NOT NULL);

-- 3. Allow anon read of scraped rows (for public / pre-login searches)
DROP POLICY IF EXISTS "anon_read_scraped_jobs" ON public.job_postings;
CREATE POLICY "anon_read_scraped_jobs"
  ON public.job_postings FOR SELECT
  TO anon
  USING (external_id IS NOT NULL);

-- 4. Ensure the scraped_jobs view grant is current
GRANT SELECT ON public.scraped_jobs TO anon, authenticated;

-- ========================================
-- Source: 20260416_010_user_agent_instances.sql
-- ========================================
-- ============================================================================
-- Migration 010 — Agent Registry: rename user_job_agents → user_agent_instances
-- (Idempotent — safe to re-run)
-- ============================================================================

-- 1. Rename table (IF EXISTS = no-op if already renamed)
ALTER TABLE IF EXISTS public.user_job_agents
  RENAME TO user_agent_instances;

-- 2. Add agent_type column
ALTER TABLE public.user_agent_instances
  ADD COLUMN IF NOT EXISTS agent_type text NOT NULL DEFAULT 'job_match'
  CHECK (agent_type IN ('job_match', 'salary_monitor', 'market_intel', 'interview_prep'));

-- 3. Drop old PK, replace with composite (user_id, agent_type) — idempotent
ALTER TABLE public.user_agent_instances
  DROP CONSTRAINT IF EXISTS user_job_agents_pkey;

DROP INDEX IF EXISTS user_job_agents_pkey;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_agent_instances_pkey'
      AND conrelid = 'public.user_agent_instances'::regclass
  ) THEN
    ALTER TABLE public.user_agent_instances
      ADD CONSTRAINT user_agent_instances_pkey PRIMARY KEY (user_id, agent_type);
  END IF;
END $$;

-- 4. Update triggers to reference new table name
CREATE OR REPLACE FUNCTION public._mark_agent_pending()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.user_agent_instances (user_id, agent_type, status)
  VALUES (NEW.user_id, 'job_match', 'pending')
  ON CONFLICT (user_id, agent_type) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public._mark_agent_pending_on_change()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  changed boolean := false;
BEGIN
  IF (
    OLD.skills            IS DISTINCT FROM NEW.skills            OR
    OLD.target_job_titles IS DISTINCT FROM NEW.target_job_titles OR
    OLD.career_level      IS DISTINCT FROM NEW.career_level      OR
    OLD.location          IS DISTINCT FROM NEW.location          OR
    OLD.preferred_job_types IS DISTINCT FROM NEW.preferred_job_types OR
    OLD.salary_min        IS DISTINCT FROM NEW.salary_min        OR
    OLD.salary_max        IS DISTINCT FROM NEW.salary_max
  ) THEN
    changed := true;
  END IF;

  IF changed THEN
    INSERT INTO public.user_agent_instances (user_id, agent_type, status)
    VALUES (NEW.user_id, 'job_match', 'pending')
    ON CONFLICT (user_id, agent_type) DO UPDATE
      SET status = 'pending', updated_at = now();
  END IF;
  RETURN NEW;
END;
$$;

-- 5. Wakeup index
CREATE INDEX IF NOT EXISTS idx_user_agent_instances_wakeup
  ON public.user_agent_instances (next_run_at ASC, status)
  WHERE status IN ('pending', 'sleeping');

-- 6. Seed salary_monitor + market_intel rows
INSERT INTO public.user_agent_instances (user_id, agent_type, status, next_run_at)
SELECT user_id, 'salary_monitor', 'sleeping', now() + interval '7 days'
FROM public.user_agent_instances
WHERE agent_type = 'job_match'
ON CONFLICT (user_id, agent_type) DO NOTHING;

INSERT INTO public.user_agent_instances (user_id, agent_type, status, next_run_at)
SELECT user_id, 'market_intel', 'sleeping', now() + interval '30 days'
FROM public.user_agent_instances
WHERE agent_type = 'job_match'
ON CONFLICT (user_id, agent_type) DO NOTHING;

-- ========================================
-- Source: 20260416_011_agent_output_tables.sql
-- ========================================
-- ============================================================================
-- Migration 011 — Agent output tables
--
-- Creates storage for the three new agent types:
--   • user_salary_snapshots  — salary_monitor agent output
--   • user_market_intel      — market_intel agent output
--   • user_interview_prep    — interview_prep agent output (per job application)
--
-- All tables follow the same conventions:
--   - user_id references auth.users (CASCADE delete)
--   - RLS: users can only read/write their own rows
--   - agent_run_at timestamp for staleness checks
-- ============================================================================

-- ── 1. user_salary_snapshots ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.user_salary_snapshots (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  agent_run_at timestamptz NOT NULL DEFAULT now(),
  title        text,
  location     text,
  market_p25   numeric,          -- 25th percentile market rate
  market_p50   numeric,          -- median market rate
  market_p75   numeric,          -- 75th percentile market rate
  your_min     numeric,          -- user's salary_min from profile
  your_max     numeric,          -- user's salary_max from profile
  percentile   numeric,          -- where user's midpoint falls (0-100)
  trend        text CHECK (trend IN ('rising','flat','falling','unknown')),
  sample_size  integer DEFAULT 0,
  raw_data     jsonb             -- top_companies, title_variants, etc.
);

ALTER TABLE public.user_salary_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_salary_snapshots" ON public.user_salary_snapshots;
CREATE POLICY "users_own_salary_snapshots"
  ON public.user_salary_snapshots
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_salary_snapshots_user_time
  ON public.user_salary_snapshots (user_id, agent_run_at DESC);

-- ── 2. user_market_intel ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.user_market_intel (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  agent_run_at    timestamptz NOT NULL DEFAULT now(),
  hot_companies   jsonb,       -- [{name, open_roles, growth_pct}]
  trending_skills jsonb,       -- [{skill, frequency_delta}]
  remote_ratio    numeric,     -- 0.0–1.0 share of remote postings
  demand_by_city  jsonb,       -- [{city, job_count}]
  total_listings  integer DEFAULT 0
);

ALTER TABLE public.user_market_intel ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_market_intel" ON public.user_market_intel;
CREATE POLICY "users_own_market_intel"
  ON public.user_market_intel
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_market_intel_user_time
  ON public.user_market_intel (user_id, agent_run_at DESC);

-- ── 3. user_interview_prep ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.user_interview_prep (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  job_id          uuid        REFERENCES public.job_postings(id) ON DELETE SET NULL,
  job_url         text,
  agent_run_at    timestamptz NOT NULL DEFAULT now(),
  questions       jsonb,       -- [{id, question, category, difficulty}]
  suggested_ans   jsonb,       -- [{question_id, answer, tips}]
  company_bullets text[],
  red_flags       text[],
  expires_at      timestamptz NOT NULL DEFAULT (now() + interval '7 days')
);

ALTER TABLE public.user_interview_prep ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_interview_prep" ON public.user_interview_prep;
CREATE POLICY "users_own_interview_prep"
  ON public.user_interview_prep
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_interview_prep_user_job
  ON public.user_interview_prep (user_id, job_id, agent_run_at DESC);

-- ── 4. interview_prep trigger: seed interview_prep agent instance on app save ─

-- When a user saves a job application, mark their interview_prep agent as pending
-- so it generates prep for that job on next load.
CREATE OR REPLACE FUNCTION public._mark_interview_prep_pending()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.user_agent_instances (user_id, agent_type, status, config)
  VALUES (
    NEW.user_id,
    'interview_prep',
    'pending',
    jsonb_build_object('job_id', NEW.job_id, 'job_url', NEW.job_url)
  )
  ON CONFLICT (user_id, agent_type) DO UPDATE
    SET status = 'pending',
        config = jsonb_build_object('job_id', NEW.job_id, 'job_url', NEW.job_url),
        updated_at = now();
  RETURN NEW;
END;
$$;

-- Fire on INSERT into job_applications (if table exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'job_applications'
  ) THEN
    DROP TRIGGER IF EXISTS trg_job_application_interview_prep ON public.job_applications;
    CREATE TRIGGER trg_job_application_interview_prep
      AFTER INSERT ON public.job_applications
      FOR EACH ROW EXECUTE FUNCTION public._mark_interview_prep_pending();
  END IF;
END;
$$;

-- ========================================
-- Source: 20260416_discovery_feature_flags.sql
-- ========================================
-- =============================================================================
-- Discovery Agent: per-board feature flags
-- Migration: 20260416_discovery_feature_flags.sql
--
-- Master switch + one flag per board adapter.
-- All board flags default to false — flip them ON one at a time from
-- /admin/settings after verifying each adapter's data quality.
-- =============================================================================

INSERT INTO feature_flags (key, enabled, description) VALUES
  ('discovery_agent',              true,  'Master switch for Discovery Agent and all board adapters'),
  ('discovery_board_remoteok',     false, 'Enable RemoteOK job board adapter'),
  ('discovery_board_weworkremotely', false, 'Enable WeWorkRemotely adapter'),
  ('discovery_board_greenhouse',   false, 'Enable Greenhouse (employer ATS) adapter'),
  ('discovery_board_lever',        false, 'Enable Lever (employer ATS) adapter'),
  ('discovery_board_usajobs',      false, 'Enable USAJobs.gov official API adapter'),
  ('discovery_board_adzuna',       false, 'Enable Adzuna official API adapter'),
  ('discovery_cache_enabled',      true,  'Cache scraper results for 6 hours to protect upstream boards')
ON CONFLICT (key) DO UPDATE SET description = EXCLUDED.description;

-- ========================================
-- Source: 20260416_employer_role.sql
-- ========================================
-- Phase 7 Task 7.1: Employer Role & Profile
-- Adds employer role to user_roles constraint and creates employer_profiles table

ALTER TABLE user_roles DROP CONSTRAINT IF EXISTS user_roles_role_check;
ALTER TABLE user_roles ADD CONSTRAINT user_roles_role_check
  CHECK (role IN ('job_seeker', 'employer', 'admin'));

CREATE TABLE employer_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  company_name text,
  company_size text,
  industry text,
  website text,
  logo_url text,
  description text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE employer_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "employers own their profile"
  ON employer_profiles FOR ALL USING (user_id = auth.uid());
CREATE POLICY "anyone can read employer profiles"
  ON employer_profiles FOR SELECT USING (true);

-- ========================================
-- Source: 20260416_job_postings.sql
-- ========================================
-- Phase 7 Task 7.2: Job Postings
-- Creates job_postings table for employer job listings

CREATE TABLE job_postings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL,
  location text,
  remote_type text CHECK (remote_type IN ('remote','hybrid','onsite')),
  employment_type text CHECK (employment_type IN ('full_time','part_time','contract')),
  salary_min integer,
  salary_max integer,
  skills_required jsonb DEFAULT '[]',
  status text DEFAULT 'draft'
    CHECK (status IN ('draft','active','paused','closed')),
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz
);
ALTER TABLE job_postings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "employers manage own postings"
  ON job_postings FOR ALL USING (employer_id = auth.uid());
CREATE POLICY "job seekers can read active postings"
  ON job_postings FOR SELECT USING (status = 'active');

-- ========================================
-- Source: 20260416_scraped_jobs_discovery.sql
-- ========================================
-- =============================================================================
-- Discovery Agent: staging table + scraper run log
-- Migration: 20260416_scraped_jobs_discovery.sql
--
-- WHY a new table instead of touching scraped_jobs:
--   `scraped_jobs` is an active VIEW over `job_postings` (the Python scraper
--   table). The frontend queries it directly; the bridge cron reads it.
--   Dropping it would break both. Instead we create `discovery_jobs` as a
--   clean staging table for the TS board adapters. The existing
--   bridge_jobs_to_discovered() function is extended (in
--   20260418_bridge_jobs_to_discovered.sql) to also read discovery_jobs.
--
-- Tables created here:
--   discovery_jobs  — one row per job fetched by a board adapter
--   scraper_runs    — one row per adapter invocation (observability)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. discovery_jobs — staging table written by the Discovery Agent adapters.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS discovery_jobs (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at       timestamptz DEFAULT now(),
  source_board     text        NOT NULL,   -- 'remoteok', 'greenhouse', 'lever', etc.
  source_url       text,
  external_id      text,
  title            text,
  company          text,
  location         text,
  remote_type      text,                   -- 'remote' | 'hybrid' | 'onsite' | null
  employment_type  text,                   -- 'full_time' | 'part_time' | 'contract' | 'internship'
  salary_min       integer,
  salary_max       integer,
  salary_currency  text        DEFAULT 'USD',
  description      text,
  description_html text,
  posted_at        timestamptz,
  scraped_at       timestamptz DEFAULT now(),
  dedupe_hash      text,
  raw_payload      jsonb
);

-- Dedupe: same job on the same board never inserted twice across runs.
CREATE UNIQUE INDEX IF NOT EXISTS discovery_jobs_dedupe_hash_idx
  ON discovery_jobs (dedupe_hash)
  WHERE dedupe_hash IS NOT NULL;

-- Common query patterns.
CREATE INDEX IF NOT EXISTS discovery_jobs_source_board_scraped_at_idx
  ON discovery_jobs (source_board, scraped_at DESC);

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS discovery_jobs_title_trgm_idx
  ON discovery_jobs USING gin (title gin_trgm_ops);

-- RLS: authenticated users can read; only service role may write.
ALTER TABLE discovery_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "discovery_jobs readable by authenticated users" ON discovery_jobs;
CREATE POLICY "discovery_jobs readable by authenticated users"
  ON discovery_jobs FOR SELECT
  USING (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- 2. scraper_runs — audit log for every adapter invocation.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS scraper_runs (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_board              text        NOT NULL,
  search_term               text,
  location                  text,
  started_at                timestamptz DEFAULT now(),
  finished_at               timestamptz,
  status                    text        CHECK (status IN ('running','success','partial','failed')),
  jobs_found                integer     DEFAULT 0,
  jobs_inserted             integer     DEFAULT 0,
  jobs_skipped_duplicate    integer     DEFAULT 0,
  error_message             text,
  http_status               integer
);

CREATE INDEX IF NOT EXISTS scraper_runs_board_started_idx
  ON scraper_runs (source_board, started_at DESC);

ALTER TABLE scraper_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "scraper_runs readable by admins" ON scraper_runs;
CREATE POLICY "scraper_runs readable by admins"
  ON scraper_runs FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  ));

-- ========================================
-- Source: 20260416_talent_invites.sql
-- ========================================
-- Phase 7 Task 7.3: Talent Invites
-- Creates talent_invites table for employer-to-talent outreach

CREATE TABLE talent_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id uuid REFERENCES auth.users(id),
  talent_id uuid REFERENCES auth.users(id),
  job_id uuid REFERENCES job_postings(id),
  message text,
  status text DEFAULT 'sent'
    CHECK (status IN ('sent','viewed','accepted','declined')),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE talent_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "employers manage their invites"
  ON talent_invites FOR ALL USING (employer_id = auth.uid());
CREATE POLICY "talent can see invites to them"
  ON talent_invites FOR SELECT USING (talent_id = auth.uid());

-- ========================================
-- Source: 20260417_discovery_company_sources.sql
-- ========================================
-- =============================================================================
-- Discovery Company Sources
-- Migration: 20260417_discovery_company_sources.sql
--
-- Lookup table used by the greenhouse and lever adapters in discovery-agent.
-- Each row is one company board that the Discovery Agent will poll.
-- Add/remove rows to control which boards are scraped without code changes.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.discovery_company_sources (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ats             text        NOT NULL CHECK (ats IN ('greenhouse','lever','ashby')),
  company_slug    text        NOT NULL,
  display_name    text,
  enabled         boolean     DEFAULT true,
  last_polled_at  timestamptz,
  created_at      timestamptz DEFAULT now(),
  UNIQUE (ats, company_slug)
);

CREATE INDEX IF NOT EXISTS idx_discovery_company_sources_ats_enabled
  ON public.discovery_company_sources (ats, enabled);

ALTER TABLE public.discovery_company_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "discovery_company_sources readable by authenticated"
  ON public.discovery_company_sources FOR SELECT
  USING (auth.role() = 'authenticated');

-- ── Greenhouse boards (top tech employers with public job APIs) ───────────────
INSERT INTO public.discovery_company_sources (ats, company_slug, display_name) VALUES
  ('greenhouse', 'stripe',          'Stripe'),
  ('greenhouse', 'airbnb',          'Airbnb'),
  ('greenhouse', 'lyft',            'Lyft'),
  ('greenhouse', 'coinbase',        'Coinbase'),
  ('greenhouse', 'robinhood',       'Robinhood'),
  ('greenhouse', 'brex',            'Brex'),
  ('greenhouse', 'figma',           'Figma'),
  ('greenhouse', 'notion',          'Notion'),
  ('greenhouse', 'airtable',        'Airtable'),
  ('greenhouse', 'reddit',          'Reddit'),
  ('greenhouse', 'doordash',        'DoorDash'),
  ('greenhouse', 'instacart',       'Instacart'),
  ('greenhouse', 'plaid',           'Plaid'),
  ('greenhouse', 'gusto',           'Gusto'),
  ('greenhouse', 'zendesk',         'Zendesk'),
  ('greenhouse', 'hubspot',         'HubSpot'),
  ('greenhouse', 'dropbox',         'Dropbox'),
  ('greenhouse', 'twilio',          'Twilio'),
  ('greenhouse', 'hashicorp',       'HashiCorp'),
  ('greenhouse', 'cloudflare',      'Cloudflare'),
  ('greenhouse', 'mongodb',         'MongoDB'),
  ('greenhouse', 'databricks',      'Databricks'),
  ('greenhouse', 'snowflakecomputing', 'Snowflake'),
  ('greenhouse', 'confluent',       'Confluent'),
  ('greenhouse', 'datadog',         'Datadog'),
  ('greenhouse', 'github',          'GitHub'),
  ('greenhouse', 'gitlab',          'GitLab')
ON CONFLICT (ats, company_slug) DO NOTHING;

-- ── Lever boards ─────────────────────────────────────────────────────────────
INSERT INTO public.discovery_company_sources (ats, company_slug, display_name) VALUES
  ('lever', 'netflix',          'Netflix'),
  ('lever', 'shopify',          'Shopify'),
  ('lever', 'square',           'Square'),
  ('lever', 'atlassian',        'Atlassian'),
  ('lever', 'canva',            'Canva'),
  ('lever', 'intercom',         'Intercom'),
  ('lever', 'pagerduty',        'PagerDuty'),
  ('lever', 'elastic',          'Elastic'),
  ('lever', 'cloudkitchens',    'CloudKitchens'),
  ('lever', 'benchling',        'Benchling')
ON CONFLICT (ats, company_slug) DO NOTHING;

-- ========================================
-- Source: 20260417_event_bus.sql
-- ========================================
-- Phase 8 Task 8.1: Event Bus
CREATE TABLE IF NOT EXISTS platform_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  source_service text NOT NULL,
  created_at timestamptz DEFAULT now(),
  processed_at timestamptz,
  status text DEFAULT 'pending'
    CHECK (status IN ('pending','processed','failed'))
);
ALTER TABLE platform_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_platform_events_type   ON platform_events(event_type);
CREATE INDEX IF NOT EXISTS idx_platform_events_status ON platform_events(status);
DROP POLICY IF EXISTS "service role only" ON platform_events;
CREATE POLICY "service role only" ON platform_events
  USING (auth.role() = 'service_role');

-- ========================================
-- Source: 20260417_post_launch_cleanup.sql
-- ========================================
-- Post-launch cleanup
-- Safe to run once new pipeline (discovered_jobs + job_postings) is confirmed stable.
-- Drops legacy VIEW scraped_jobs and table user_opportunity_matches.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.views
    WHERE table_schema = 'public' AND table_name = 'scraped_jobs'
  ) THEN
    EXECUTE 'DROP VIEW IF EXISTS public.scraped_jobs CASCADE';
    RAISE NOTICE 'Dropped VIEW scraped_jobs';
  ELSE
    RAISE NOTICE 'scraped_jobs is not a VIEW — skipping';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'user_opportunity_matches'
  ) THEN
    EXECUTE 'DROP TABLE IF EXISTS public.user_opportunity_matches CASCADE';
    RAISE NOTICE 'Dropped TABLE user_opportunity_matches';
  ELSE
    RAISE NOTICE 'user_opportunity_matches does not exist — skipping';
  END IF;
END $$;

-- ========================================
-- Source: 20260418_bridge_jobs_to_discovered.sql
-- ========================================
-- =============================================================================
-- Bridge scraped_jobs + job_postings → discovered_jobs
-- Migration: 20260418_bridge_jobs_to_discovered.sql
--
-- WHY THIS EXISTS:
--   The frontend (OpportunityRadar, job-service.ts) reads ONLY from
--   `discovered_jobs` (per-user, relevance-scored table).
--
--   Two pipelines populate upstream tables but have no path to users:
--     1. GitHub Actions scraper  → job_postings  (every 2h, runs fine)
--     2. Discovery Agent TS fn   → scraped_jobs  (multi-board ATS adapters)
--
--   This migration creates a bridge function that:
--     a. Reads from BOTH job_postings and scraped_jobs
--     b. Matches opportunities against each user's target_titles preferences
--     c. Scores matches with a heuristic (title + recency + remote + salary)
--     d. Upserts into discovered_jobs so users immediately see results
--
--   A pg_cron job runs the bridge every 30 minutes.
--   A one-time backfill runs immediately on migration deploy.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. Register board/scraper sources missing from job_source_config
--    (FK constraint on discovered_jobs.source_name requires these rows)
-- ---------------------------------------------------------------------------
INSERT INTO job_source_config (source_name, source_type, base_url, priority, is_aggregator)
VALUES
  ('google',         'scrape', 'https://www.google.com/jobs', 75, true),
  ('zip_recruiter',  'scrape', 'https://www.ziprecruiter.com', 70, false),
  ('remoteok',       'scrape', 'https://remoteok.com',        80, false),
  ('greenhouse',     'scrape', NULL,                          85, false),
  ('lever',          'scrape', NULL,                          85, false),
  ('usajobs',        'api',    'https://data.usajobs.gov',    90, false),
  ('adzuna',         'api',    'https://api.adzuna.com',      75, false),
  ('scraper',        'scrape', NULL,                          60, false)
ON CONFLICT (source_name) DO NOTHING;


-- ---------------------------------------------------------------------------
-- 2. Helpers shared by both bridge sources
-- ---------------------------------------------------------------------------

-- Map job_postings.job_type → discovered_jobs.employment_type
CREATE OR REPLACE FUNCTION _map_job_type(p text)
RETURNS text LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT CASE lower(trim(p))
    WHEN 'fulltime'  THEN 'full_time'  WHEN 'full-time'  THEN 'full_time'
    WHEN 'full_time' THEN 'full_time'  WHEN 'parttime'   THEN 'part_time'
    WHEN 'part-time' THEN 'part_time'  WHEN 'part_time'  THEN 'part_time'
    WHEN 'contract'  THEN 'contract'   WHEN 'contractor' THEN 'contract'
    WHEN 'internship' THEN 'internship' WHEN 'intern'    THEN 'internship'
    WHEN 'temporary' THEN 'temporary'  WHEN 'temp'       THEN 'temporary'
    ELSE 'unknown'
  END;
$$;

-- Map boolean is_remote → location_type
CREATE OR REPLACE FUNCTION _map_location_type(p_remote boolean)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN p_remote IS TRUE THEN 'remote'
              WHEN p_remote IS FALSE THEN 'onsite'
              ELSE 'unknown' END;
$$;

-- Normalise scraper source string → valid job_source_config.source_name
CREATE OR REPLACE FUNCTION _norm_source(p text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE lower(trim(p))
    WHEN 'indeed'         THEN 'indeed'
    WHEN 'google'         THEN 'google'
    WHEN 'zip_recruiter'  THEN 'zip_recruiter'
    WHEN 'ziprecruiter'   THEN 'zip_recruiter'
    WHEN 'linkedin'       THEN 'linkedin'
    WHEN 'glassdoor'      THEN 'glassdoor'
    WHEN 'dice'           THEN 'dice'
    WHEN 'remoteok'       THEN 'remoteok'
    WHEN 'greenhouse'     THEN 'greenhouse'
    WHEN 'lever'          THEN 'lever'
    WHEN 'usajobs'        THEN 'usajobs'
    WHEN 'adzuna'         THEN 'adzuna'
    ELSE 'scraper'
  END;
$$;


-- ---------------------------------------------------------------------------
-- 3. Core bridge function
--    Processes both job_postings (Python scraper) and scraped_jobs (TS agent).
--    For each active user: matches title, scores, upserts to discovered_jobs.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION bridge_jobs_to_discovered(
  p_user_id        uuid    DEFAULT NULL,
  p_max_per_user   integer DEFAULT 200,
  p_lookback_hours integer DEFAULT 48     -- how far back to look in source tables
)
RETURNS TABLE (
  out_user_id  uuid,
  from_postings  integer,
  from_scraped   integer,
  skipped        integer
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_prefs         RECORD;
  v_job           RECORD;
  v_score         numeric;
  v_days_old      numeric;
  v_dedup_hash    text;
  v_batch_id      uuid;
  v_cnt_postings  integer;
  v_cnt_scraped   integer;
  v_cnt_skipped   integer;
  v_tsquery       tsquery;
  v_source_norm   text;
  v_cutoff        timestamptz;
BEGIN
  v_cutoff := now() - (p_lookback_hours || ' hours')::interval;

  FOR v_prefs IN
    SELECT
      usp.user_id,
      COALESCE(usp.target_titles, ARRAY[]::text[])              AS titles,
      usp.remote_preference,
      usp.salary_min                                             AS u_sal_min,
      usp.salary_max                                             AS u_sal_max
    FROM user_search_preferences usp
    WHERE usp.alerts_enabled = true
      AND (p_user_id IS NULL OR usp.user_id = p_user_id)
  LOOP
    v_cnt_postings := 0;
    v_cnt_scraped  := 0;
    v_cnt_skipped  := 0;
    v_batch_id     := gen_random_uuid();

    -- Build tsquery (best effort; fall back to NULL = accept all)
    BEGIN
      IF array_length(v_prefs.titles, 1) > 0 THEN
        v_tsquery := to_tsquery('english',
          array_to_string(
            ARRAY(SELECT DISTINCT
              regexp_replace(regexp_replace(unnest(v_prefs.titles), '[^a-zA-Z0-9 ]', '', 'g'), '\s+', ' | ', 'g')
            ), ' | '));
      ELSE
        v_tsquery := NULL;
      END IF;
    EXCEPTION WHEN OTHERS THEN v_tsquery := NULL;
    END;

    -- ---- SOURCE 1: job_postings (GitHub Actions Python scraper) ----
    FOR v_job IN
      SELECT
        j.external_id,
        j.title,
        j.company,
        j.location,
        j.is_remote,
        j.job_type,
        j.salary_min,
        j.salary_max,
        j.salary_currency,
        j.description,
        j.job_url      AS source_url,
        j.source,
        j.date_posted,
        j.scraped_at
      FROM job_postings j
      WHERE j.scraped_at > v_cutoff
        AND (j.expires_at IS NULL OR j.expires_at > now())
        AND (
          array_length(v_prefs.titles, 1) IS NULL
          OR array_length(v_prefs.titles, 1) = 0
          OR (v_tsquery IS NOT NULL
              AND to_tsvector('english', coalesce(j.title,'') || ' ' || coalesce(j.description,''))
                  @@ v_tsquery)
          OR EXISTS (
            SELECT 1 FROM unnest(v_prefs.titles) t(tit)
            WHERE j.title ILIKE '%' || t.tit || '%'
               OR t.tit  ILIKE '%' || j.title || '%'
          )
        )
      ORDER BY j.scraped_at DESC, j.date_posted DESC NULLS LAST
      LIMIT p_max_per_user
    LOOP
      v_days_old    := EXTRACT(EPOCH FROM (now() - COALESCE(v_job.date_posted, v_job.scraped_at))) / 86400.0;
      v_score       := _score_job(v_job.title, v_days_old, v_job.is_remote::boolean,
                                   v_job.salary_min, v_job.salary_max,
                                   v_prefs.titles, v_prefs.remote_preference,
                                   v_prefs.u_sal_min, v_prefs.u_sal_max,
                                   _norm_source(v_job.source));
      v_source_norm := _norm_source(v_job.source);
      BEGIN
        INSERT INTO discovered_jobs (
          user_id, external_id, source_name, source_url, title, title_normalized,
          company_name, description, location, location_type, salary_min, salary_max,
          salary_currency, employment_type, experience_level, posted_at,
          relevance_score, score_breakdown, score_explanation, trust_score, status,
          discovery_batch_id, first_seen_at, last_seen_at, raw_data
        ) VALUES (
          v_prefs.user_id, v_job.external_id, v_source_norm, v_job.source_url,
          v_job.title, lower(trim(v_job.title)), v_job.company, v_job.description,
          v_job.location, _map_location_type(v_job.is_remote), v_job.salary_min,
          v_job.salary_max, COALESCE(v_job.salary_currency,'USD'),
          _map_job_type(v_job.job_type), 'unknown', v_job.date_posted,
          v_score, '{}'::jsonb,
          'Score '||round(v_score)||' via scraper ('||v_source_norm||')',
          75.0, 'scored', v_batch_id, now(), now(),
          jsonb_build_object('source','job_postings','scraped_at',v_job.scraped_at)
        )
        ON CONFLICT (user_id, dedup_hash) DO UPDATE
          SET relevance_score = GREATEST(discovered_jobs.relevance_score, EXCLUDED.relevance_score),
              last_seen_at    = now();
        v_cnt_postings := v_cnt_postings + 1;
      EXCEPTION WHEN OTHERS THEN
        v_cnt_skipped := v_cnt_skipped + 1;
      END;
    END LOOP;

    -- ---- SOURCE 2: discovery_jobs (Discovery Agent TS board adapters) ----
    -- NOTE: scraped_jobs is a VIEW over job_postings (Python scraper) and must
    -- not be touched. Discovery Agent writes to discovery_jobs (real table).
    FOR v_job IN
      SELECT
        s.external_id,
        s.title,
        s.company,
        s.location,
        (s.remote_type = 'remote')                 AS is_remote,
        s.employment_type                           AS job_type,
        s.salary_min,
        s.salary_max,
        s.salary_currency,
        s.description,
        s.source_url,
        s.source_board                              AS source,
        s.posted_at                                 AS date_posted,
        s.scraped_at
      FROM discovery_jobs s
      WHERE s.scraped_at > v_cutoff
        AND (
          array_length(v_prefs.titles, 1) IS NULL
          OR array_length(v_prefs.titles, 1) = 0
          OR (v_tsquery IS NOT NULL
              AND to_tsvector('english', coalesce(s.title,'') || ' ' || coalesce(s.description,''))
                  @@ v_tsquery)
          OR EXISTS (
            SELECT 1 FROM unnest(v_prefs.titles) t(tit)
            WHERE s.title ILIKE '%' || t.tit || '%'
               OR t.tit  ILIKE '%' || s.title || '%'
          )
        )
      ORDER BY s.scraped_at DESC, s.posted_at DESC NULLS LAST
      LIMIT p_max_per_user
    LOOP
      v_days_old    := EXTRACT(EPOCH FROM (now() - COALESCE(v_job.date_posted, v_job.scraped_at))) / 86400.0;
      v_score       := _score_job(v_job.title, v_days_old, v_job.is_remote,
                                   v_job.salary_min, v_job.salary_max,
                                   v_prefs.titles, v_prefs.remote_preference,
                                   v_prefs.u_sal_min, v_prefs.u_sal_max,
                                   _norm_source(v_job.source));
      v_source_norm := _norm_source(v_job.source);
      BEGIN
        INSERT INTO discovered_jobs (
          user_id, external_id, source_name, source_url, title, title_normalized,
          company_name, description, location, location_type, salary_min, salary_max,
          salary_currency, employment_type, experience_level, posted_at,
          relevance_score, score_breakdown, score_explanation, trust_score, status,
          discovery_batch_id, first_seen_at, last_seen_at, raw_data
        ) VALUES (
          v_prefs.user_id, v_job.external_id, v_source_norm, v_job.source_url,
          v_job.title, lower(trim(v_job.title)), v_job.company, v_job.description,
          v_job.location,
          COALESCE(CASE WHEN v_job.is_remote THEN 'remote' ELSE 'onsite' END, 'unknown'),
          v_job.salary_min, v_job.salary_max, COALESCE(v_job.salary_currency,'USD'),
          COALESCE(v_job.job_type, 'unknown'), 'unknown', v_job.date_posted,
          v_score, '{}'::jsonb,
          'Score '||round(v_score)||' via discovery-agent ('||v_source_norm||')',
          85.0, 'scored', v_batch_id, now(), now(),
          jsonb_build_object('source','discovery_jobs','scraped_at',v_job.scraped_at)
        )
        ON CONFLICT (user_id, dedup_hash) DO UPDATE
          SET relevance_score = GREATEST(discovered_jobs.relevance_score, EXCLUDED.relevance_score),
              last_seen_at    = now();
        v_cnt_scraped := v_cnt_scraped + 1;
      EXCEPTION WHEN OTHERS THEN
        v_cnt_skipped := v_cnt_skipped + 1;
      END;
    END LOOP;

    out_user_id   := v_prefs.user_id;
    from_postings := v_cnt_postings;
    from_scraped  := v_cnt_scraped;
    skipped       := v_cnt_skipped;
    RETURN NEXT;
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Inline scoring helper (extracted so bridge body stays readable)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION _score_job(
  p_title          text,
  p_days_old       numeric,
  p_is_remote      boolean,
  p_sal_min        numeric,
  p_sal_max        numeric,
  p_target_titles  text[],
  p_remote_pref    text,
  p_u_sal_min      numeric,
  p_u_sal_max      numeric,
  p_source         text
) RETURNS numeric LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_title_score  numeric := 10;
  v_recency      numeric;
  v_remote       numeric := 0;
  v_salary       numeric := 0;
  v_src          numeric;
BEGIN
  -- Title match (0–40)
  IF EXISTS (SELECT 1 FROM unnest(p_target_titles) t(tit) WHERE lower(p_title) = lower(t.tit)) THEN
    v_title_score := 40;
  ELSIF EXISTS (SELECT 1 FROM unnest(p_target_titles) t(tit) WHERE lower(p_title) ILIKE '%' || lower(t.tit) || '%') THEN
    v_title_score := 30;
  ELSIF array_length(p_target_titles, 1) IS NULL OR array_length(p_target_titles, 1) = 0 THEN
    v_title_score := 20;
  END IF;

  -- Recency (0–20)
  v_recency := GREATEST(0, 20.0 * (1.0 - (COALESCE(p_days_old, 30) / 30.0)));

  -- Remote match (0–15)
  v_remote := CASE
    WHEN p_remote_pref = 'remote'  AND p_is_remote = true  THEN 15
    WHEN p_remote_pref = 'onsite'  AND p_is_remote = false THEN 15
    WHEN p_remote_pref = 'any'                              THEN  8
    ELSE 5
  END;

  -- Salary (0–15)
  IF p_u_sal_min IS NOT NULL AND p_sal_max IS NOT NULL AND p_sal_max >= p_u_sal_min THEN
    v_salary := 15;
  ELSIF p_u_sal_min IS NULL THEN
    v_salary := 5;
  END IF;

  -- Source quality (0–10)
  v_src := CASE p_source
    WHEN 'greenhouse' THEN 10  WHEN 'lever'    THEN 10
    WHEN 'usajobs'    THEN 10  WHEN 'linkedin' THEN 10
    WHEN 'indeed'     THEN  9  WHEN 'remoteok' THEN  8
    WHEN 'adzuna'     THEN  7  ELSE 4
  END;

  RETURN LEAST(100, v_title_score + v_recency + v_remote + v_salary + v_src);
END;
$$;

COMMENT ON FUNCTION bridge_jobs_to_discovered IS
  'Bridges job_postings (scraper) and scraped_jobs (discovery-agent) into '
  'discovered_jobs (user-facing feed). Run every 30 min via pg_cron.';

REVOKE EXECUTE ON FUNCTION bridge_jobs_to_discovered FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION bridge_jobs_to_discovered TO service_role;


-- ---------------------------------------------------------------------------
-- 5. pg_cron: run bridge every 30 minutes
-- ---------------------------------------------------------------------------
-- pg_cron not available — skipped
-- SELECT cron.schedule(
  'bridge-jobs-to-discovered',
  '*/30 * * * *',
  $$SELECT bridge_jobs_to_discovered()$$
);


-- ---------------------------------------------------------------------------
-- 6. Immediate backfill: run now so users see opportunities without waiting
--    Uses 30-day lookback so ALL existing scraper data is surfaced.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
  total_postings integer := 0;
  total_scraped  integer := 0;
BEGIN
  FOR r IN SELECT * FROM bridge_jobs_to_discovered(NULL, 200, 720) LOOP
    total_postings := total_postings + r.from_postings;
    total_scraped  := total_scraped  + r.from_scraped;
  END LOOP;
  RAISE NOTICE 'Backfill complete: % from job_postings + % from scraped_jobs across all users',
    total_postings, total_scraped;
END;
$$;

-- ========================================
-- Source: 20260418_event_bus_created_at_index.sql
-- ========================================
-- Phase 3: Add missing created_at index on platform_events for time-range queries
CREATE INDEX IF NOT EXISTS idx_platform_events_created_at ON platform_events(created_at);

-- ========================================
-- Source: 20260418_performance_indexes.sql
-- ========================================
-- Phase 3: Critical performance indexes
-- Covers the tables identified in production query analysis.
-- NOTE: CONCURRENTLY removed for compatibility with Supabase Management API.
-- IF NOT EXISTS makes these idempotent.

-- ── job_applications ──────────────────────────────────────────────────────────
-- user_id: used in every RLS policy and user-facing query
CREATE INDEX IF NOT EXISTS idx_job_applications_user_id
  ON public.job_applications(user_id);

-- status: filtering by pipeline stage (applied / interview / offer / rejected)
CREATE INDEX IF NOT EXISTS idx_job_applications_status
  ON public.job_applications(status);

-- applied_at: sorting by recency
CREATE INDEX IF NOT EXISTS idx_job_applications_applied_at
  ON public.job_applications(applied_at DESC);

-- composite: user + status for dashboard queries ("show me my interviews")
CREATE INDEX IF NOT EXISTS idx_job_applications_user_status
  ON public.job_applications(user_id, status);

-- ── job_postings ─────────────────────────────────────────────────────────────
-- user_id (= poster/employer): owner queries
CREATE INDEX IF NOT EXISTS idx_job_postings_user_id
  ON public.job_postings(user_id);

-- created_at: feed ordering
CREATE INDEX IF NOT EXISTS idx_job_postings_created_at
  ON public.job_postings(created_at DESC);

-- composite: status + created_at for "active postings sorted by recency"
CREATE INDEX IF NOT EXISTS idx_job_postings_status_created_at
  ON public.job_postings(status, created_at DESC);

-- ========================================
-- Source: 20260418_rls_fix_unprotected_tables.sql
-- ========================================
-- ---------------------------------------------------------------------------
-- RLS Fix: Enable row-level security on the 4 previously unprotected tables
-- Identified via audit: ingestion_runs, ingestion_sources, opportunities, proposal_queue
-- Note: app_role enum values are: admin, moderator, user, job_seeker, employer, talent
-- ---------------------------------------------------------------------------

-- 1. opportunities — public job listings ingested from external sources
--    No user_id column: all authenticated users can read; only service_role can write.
ALTER TABLE public.opportunities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read jobs" ON public.opportunities;
CREATE POLICY "Authenticated users can read jobs"
ON public.opportunities FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Service role manages jobs" ON public.opportunities;
CREATE POLICY "Service role manages jobs"
ON public.opportunities FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 2. ingestion_runs — internal pipeline run log (no user_id)
--    Admin-only read; service_role writes.
ALTER TABLE public.ingestion_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read ingestion runs" ON public.ingestion_runs;
CREATE POLICY "Admins can read ingestion runs"
ON public.ingestion_runs FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role = 'admin'
  )
);

DROP POLICY IF EXISTS "Service role manages ingestion runs" ON public.ingestion_runs;
CREATE POLICY "Service role manages ingestion runs"
ON public.ingestion_runs FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 3. ingestion_sources — registry of active job sources (no user_id)
--    Admin-only read; service_role writes.
ALTER TABLE public.ingestion_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read ingestion sources" ON public.ingestion_sources;
CREATE POLICY "Admins can read ingestion sources"
ON public.ingestion_sources FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role = 'admin'
  )
);

DROP POLICY IF EXISTS "Service role manages ingestion sources" ON public.ingestion_sources;
CREATE POLICY "Service role manages ingestion sources"
ON public.ingestion_sources FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 4. proposal_queue — failed/pending proposal processing queue
--    Talent can read their own rows; service_role manages all.
ALTER TABLE public.proposal_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Talent can read own proposal queue entries" ON public.proposal_queue;
CREATE POLICY "Talent can read own proposal queue entries"
ON public.proposal_queue FOR SELECT
TO authenticated
USING (talent_id = auth.uid());

DROP POLICY IF EXISTS "Service role manages proposal queue" ON public.proposal_queue;
CREATE POLICY "Service role manages proposal queue"
ON public.proposal_queue FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ========================================
-- Source: 20260419_ai_recovery_tables.sql
-- ========================================
-- AI Recovery Service supporting tables
-- Created for HIGH-012: ai-recovery-service Edge Function

-- Recovery rules: defines what action to take when a service fails
CREATE TABLE IF NOT EXISTS recovery_rules (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  issue       text NOT NULL,          -- pattern matched against service name / error
  condition   text NOT NULL,          -- human description of when this fires
  action      text NOT NULL,          -- action to take (restart, clear_cache, failover, etc.)
  playbook    text NOT NULL DEFAULT '',
  priority    integer NOT NULL DEFAULT 10,
  enabled     boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Seed with default rules for iCareerOS services
INSERT INTO recovery_rules (issue, condition, action, playbook, priority) VALUES
  ('job_agent',       'agent queue stalled',         'restart_agent',    'Restart job agent queue processor',      10),
  ('match_jobs',      'matching latency > 30s',      'clear_cache',      'Clear matching cache and retry',         10),
  ('ai_agent',        'anthropic timeout',           'retry_with_backoff','Retry with 5s exponential backoff',     10),
  ('billing_service', 'stripe webhook missed',       'replay_webhook',   'Replay last 10 missed Stripe webhooks',  20),
  ('discovery_agent', 'source failure > 3 attempts', 'disable_source',   'Disable failing source, alert admin',    30)
ON CONFLICT DO NOTHING;

-- Recovery attempts: log of every recovery action taken
CREATE TABLE IF NOT EXISTS recovery_attempts (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  service      text NOT NULL,
  issue        text NOT NULL,
  action       text NOT NULL,
  status       text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','success','failed')),
  initiated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at  timestamptz,
  notes        text
);

-- Daily audit reports: SLO summaries written by the daily_audit action
CREATE TABLE IF NOT EXISTS daily_audit_reports (
  id                   uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  date                 date NOT NULL UNIQUE,
  total_checks         integer NOT NULL DEFAULT 0,
  healthy_checks       integer NOT NULL DEFAULT 0,
  slo_percentage       numeric(5,2) NOT NULL DEFAULT 100,
  incidents_by_service jsonb NOT NULL DEFAULT '{}',
  patterns             jsonb NOT NULL DEFAULT '[]',
  report_generated_at  timestamptz NOT NULL DEFAULT now()
);

-- RLS: admin-only access
ALTER TABLE recovery_rules       ENABLE ROW LEVEL SECURITY;
ALTER TABLE recovery_attempts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_audit_reports  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin read recovery_rules"
  ON recovery_rules FOR SELECT
  USING (auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "Service role full access recovery_rules"
  ON recovery_rules FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access recovery_attempts"
  ON recovery_attempts FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Admin read recovery_attempts"
  ON recovery_attempts FOR SELECT
  USING (auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "Service role full access daily_audit_reports"
  ON daily_audit_reports FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Admin read daily_audit_reports"
  ON daily_audit_reports FOR SELECT
  USING (auth.jwt() ->> 'role' = 'admin');

-- ========================================
-- Source: 20260419_discovery_jobs_dedupe_constraint.sql
-- ========================================
-- 20260419_discovery_jobs_dedupe_constraint.sql
-- Replace partial unique index on discovery_jobs.dedupe_hash with a full unique
-- constraint so that PostgREST ON CONFLICT (col) DO NOTHING works correctly.
-- (PostgREST requires a non-partial, non-filtered unique index for the upsert
--  onConflict path — a WHERE clause in the index definition breaks it.)

-- Drop the partial index created in the initial migration
DROP INDEX IF EXISTS discovery_jobs_dedupe_hash_idx;

-- Add a proper full unique constraint
ALTER TABLE discovery_jobs
  ADD CONSTRAINT discovery_jobs_dedupe_hash_key UNIQUE (dedupe_hash);

-- ========================================
-- Source: 20260419_marketplace_feature_flags.sql
-- ========================================
-- Marketplace feature flags
-- Adds the 4 feature flags required by the remediation plan (TASK 2.2 / HIGH-009).
-- All are disabled by default — enable via /admin/settings once marketplace features are ready.

INSERT INTO feature_flags (key, enabled, description)
VALUES
  ('service_catalog',  false, 'Enable Fiverr-style talent service catalog for freelance offerings'),
  ('proposal_system',  false, 'Enable project proposal and bidding system'),
  ('contracts',        false, 'Enable contract lifecycle management (offers, milestones, completion)'),
  ('localization',     false, 'Enable multi-language support (i18n — en, es, fr, de)')
ON CONFLICT (key) DO UPDATE
  SET description = EXCLUDED.description;

-- ========================================
-- Source: 20260419_platform_events.sql
-- ========================================
-- Platform Events — append-only audit log for the iCareerOS agent pipeline
-- Created for HIGH-008 Phase 2: Event Logging
--
-- This table records every significant action taken by the orchestrator,
-- providing a full audit trail and the foundation for async event coordination
-- in Phase 3.  Consumers never DELETE from this table — set processed = true
-- or archive rows instead.

CREATE TABLE IF NOT EXISTS platform_events (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type   text        NOT NULL,                          -- e.g. 'job.search.completed'
  event_data   jsonb       NOT NULL DEFAULT '{}',             -- structured payload
  user_id      uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  processed    boolean     NOT NULL DEFAULT false,            -- for Phase 3 async subscribers
  source       text        NOT NULL DEFAULT 'frontend'        -- 'frontend' | 'edge-function' | 'cron'
    CHECK (source IN ('frontend', 'edge-function', 'cron'))
);

-- Query patterns: by type + time, by user + time
CREATE INDEX IF NOT EXISTS platform_events_type_published_at
  ON platform_events (event_type, published_at DESC);

CREATE INDEX IF NOT EXISTS platform_events_user_published_at
  ON platform_events (user_id, published_at DESC)
  WHERE user_id IS NOT NULL;

-- Partial index for Phase 3: quickly find events awaiting processing
CREATE INDEX IF NOT EXISTS platform_events_unprocessed
  ON platform_events (published_at ASC)
  WHERE processed = false;

-- ── Row Level Security ─────────────────────────────────────────────────────

ALTER TABLE platform_events ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (used by edge functions + cron)
CREATE POLICY "Service role full access platform_events"
  ON platform_events FOR ALL
  USING (auth.role() = 'service_role');

-- Authenticated users can insert their own events (frontend publisher)
CREATE POLICY "Authenticated users insert own events"
  ON platform_events FOR INSERT
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- Authenticated users can read their own events
CREATE POLICY "Authenticated users read own events"
  ON platform_events FOR SELECT
  USING (auth.uid() = user_id);

-- Admins can read all events
CREATE POLICY "Admin read all platform_events"
  ON platform_events FOR SELECT
  USING (auth.jwt() ->> 'role' = 'admin');

-- ========================================
-- Source: 20260420_add_job_expiry_cron.sql
-- ========================================
-- 20260420_add_job_expiry_cron.sql
-- Add daily pg_cron opportunities to clean up expired job data.
-- job_postings: expires_at is GENERATED AS (scraped_at + 7 days)
-- Diagnostics (2026-04-20): no expiry cron existed for job_postings

-- Daily cleanup at 3am UTC: delete expired job_postings
-- pg_cron not available — skipped
-- SELECT cron.schedule(
  'delete-expired-job-postings',
  '0 3 * * *',
  $$DELETE FROM public.job_postings WHERE expires_at < now()$$
);

-- 3:30am UTC: delete stale discovery_jobs staging rows (30-day retention)
-- pg_cron not available — skipped
-- SELECT cron.schedule(
  'delete-stale-discovery-jobs',
  '30 3 * * *',
  $$DELETE FROM public.discovery_jobs WHERE scraped_at < now() - interval '30 days'$$
);

-- ========================================
-- Source: 20260420_add_skill_synonyms_and_job_interactions.sql
-- ========================================
-- 20260420_add_skill_synonyms_and_job_interactions.sql
-- Add skill_synonyms table (skill normalization) and job_interactions table (user actions).
-- Both confirmed missing in Phase 0 diagnostics (2026-04-20).

-- skill_synonyms: normalizes variant skill names to canonical forms
CREATE TABLE IF NOT EXISTS public.skill_synonyms (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical   text NOT NULL,
  synonym     text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (canonical, synonym)
);

CREATE INDEX IF NOT EXISTS skill_synonyms_synonym_idx ON public.skill_synonyms (lower(synonym));
CREATE INDEX IF NOT EXISTS skill_synonyms_canonical_idx ON public.skill_synonyms (lower(canonical));

-- Seed common synonyms
INSERT INTO public.skill_synonyms (canonical, synonym) VALUES
  ('javascript', 'js'),
  ('javascript', 'ecmascript'),
  ('typescript', 'ts'),
  ('python', 'py'),
  ('react', 'reactjs'),
  ('react', 'react.js'),
  ('node.js', 'nodejs'),
  ('node.js', 'node'),
  ('postgresql', 'postgres'),
  ('postgresql', 'psql'),
  ('kubernetes', 'k8s'),
  ('machine learning', 'ml'),
  ('artificial intelligence', 'ai'),
  ('amazon web services', 'aws'),
  ('google cloud platform', 'gcp'),
  ('microsoft azure', 'azure'),
  ('continuous integration', 'ci/cd'),
  ('devops', 'dev ops'),
  ('graphql', 'graph ql'),
  ('restful api', 'rest api'),
  ('restful api', 'rest'),
  ('sql', 'structured query language'),
  ('c++', 'cpp'),
  ('objective-c', 'objc')
ON CONFLICT (canonical, synonym) DO NOTHING;

-- job_interactions: tracks user actions on opportunities (saved, applied, dismissed, etc.)
CREATE TABLE IF NOT EXISTS public.job_interactions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id          uuid,
  external_job_id text,
  source_table    text NOT NULL DEFAULT 'job_postings',
  action          text NOT NULL CHECK (action IN ('viewed', 'saved', 'applied', 'dismissed', 'shared')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  metadata        jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS job_interactions_user_id_idx ON public.job_interactions (user_id);
CREATE INDEX IF NOT EXISTS job_interactions_action_idx ON public.job_interactions (user_id, action);
CREATE INDEX IF NOT EXISTS job_interactions_job_id_idx ON public.job_interactions (job_id) WHERE job_id IS NOT NULL;

-- RLS
ALTER TABLE public.skill_synonyms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_interactions ENABLE ROW LEVEL SECURITY;

-- skill_synonyms: public read
CREATE POLICY "skill_synonyms_public_read" ON public.skill_synonyms
  FOR SELECT USING (true);

-- job_interactions: users see only their own
CREATE POLICY "job_interactions_user_select" ON public.job_interactions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "job_interactions_user_insert" ON public.job_interactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "job_interactions_user_delete" ON public.job_interactions
  FOR DELETE USING (auth.uid() = user_id);

-- ========================================
-- Source: 20260420_marketplace_projects.sql
-- ========================================
-- Phase 9: Gig Marketplace - Projects, Proposals, Contracts, Milestones
-- Complete migration with RLS policies

-- Create projects table
CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL,
  budget_min numeric NOT NULL CHECK (budget_min >= 0),
  budget_max numeric NOT NULL CHECK (budget_max >= budget_min),
  timeline_days integer NOT NULL CHECK (timeline_days > 0),
  skills_required text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('draft', 'open', 'in_progress', 'completed', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT title_not_empty CHECK (length(trim(title)) > 0),
  CONSTRAINT description_not_empty CHECK (length(trim(description)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_projects_employer_id ON projects(employer_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_created_at ON projects(created_at DESC);

-- RLS for projects
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "projects_employer_can_view_own" ON projects
  FOR SELECT USING (employer_id = auth.uid());

CREATE POLICY "projects_employer_can_create" ON projects
  FOR INSERT WITH CHECK (
    employer_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid() AND role = 'employer'
    )
  );

CREATE POLICY "projects_employer_can_update_own" ON projects
  FOR UPDATE USING (employer_id = auth.uid())
  WITH CHECK (employer_id = auth.uid());

CREATE POLICY "projects_employer_can_delete_own" ON projects
  FOR DELETE USING (
    employer_id = auth.uid()
    AND status IN ('draft', 'cancelled')
  );

CREATE POLICY "projects_talent_can_view_open" ON projects
  FOR SELECT USING (
    status = 'open'
    AND EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid() AND role = 'talent'
    )
  );

-- Create project_proposals table
CREATE TABLE IF NOT EXISTS project_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  talent_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  price numeric NOT NULL CHECK (price > 0),
  timeline_days integer NOT NULL CHECK (timeline_days > 0),
  cover_message text NOT NULL CHECK (length(trim(cover_message)) > 0 AND length(cover_message) <= 280),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'withdrawn')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_proposals_project_id ON project_proposals(project_id);
CREATE INDEX IF NOT EXISTS idx_project_proposals_talent_id ON project_proposals(talent_id);
CREATE INDEX IF NOT EXISTS idx_project_proposals_status ON project_proposals(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_project_proposals_unique_proposal ON project_proposals(project_id, talent_id)
  WHERE status != 'withdrawn';

-- RLS for project_proposals
ALTER TABLE project_proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "project_proposals_talent_can_create" ON project_proposals
  FOR INSERT WITH CHECK (
    talent_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid() AND role = 'talent'
    )
  );

CREATE POLICY "project_proposals_talent_can_view_own" ON project_proposals
  FOR SELECT USING (talent_id = auth.uid());

CREATE POLICY "project_proposals_employer_can_view" ON project_proposals
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = project_proposals.project_id
      AND projects.employer_id = auth.uid()
    )
  );

CREATE POLICY "project_proposals_talent_can_update_own" ON project_proposals
  FOR UPDATE USING (talent_id = auth.uid())
  WITH CHECK (talent_id = auth.uid() AND status != 'accepted');

CREATE POLICY "project_proposals_employer_can_accept_reject" ON project_proposals
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = project_proposals.project_id
      AND projects.employer_id = auth.uid()
    )
    AND status = 'pending'
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = project_proposals.project_id
      AND projects.employer_id = auth.uid()
    )
  );

-- Create contracts table
CREATE TABLE IF NOT EXISTS contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  proposal_id uuid NOT NULL REFERENCES project_proposals(id) ON DELETE CASCADE,
  employer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  talent_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agreed_price numeric NOT NULL CHECK (agreed_price > 0),
  agreed_timeline_days integer NOT NULL CHECK (agreed_timeline_days > 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'on_hold', 'completed', 'terminated')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contracts_project_id ON contracts(project_id);
CREATE INDEX IF NOT EXISTS idx_contracts_proposal_id ON contracts(proposal_id);
CREATE INDEX IF NOT EXISTS idx_contracts_employer_id ON contracts(employer_id);
CREATE INDEX IF NOT EXISTS idx_contracts_talent_id ON contracts(talent_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts(status);

-- RLS for contracts
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contracts_parties_can_view" ON contracts
  FOR SELECT USING (
    employer_id = auth.uid() OR talent_id = auth.uid()
  );

CREATE POLICY "contracts_employer_can_create" ON contracts
  FOR INSERT WITH CHECK (
    employer_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = contracts.project_id
      AND projects.employer_id = auth.uid()
    )
  );

CREATE POLICY "contracts_parties_can_update" ON contracts
  FOR UPDATE USING (
    employer_id = auth.uid() OR talent_id = auth.uid()
  )
  WITH CHECK (
    employer_id = auth.uid() OR talent_id = auth.uid()
  );

-- Create milestones table
CREATE TABLE IF NOT EXISTS milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'overdue')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT title_not_empty CHECK (length(trim(title)) > 0),
  CONSTRAINT description_not_empty CHECK (length(trim(description)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_milestones_contract_id ON milestones(contract_id);
CREATE INDEX IF NOT EXISTS idx_milestones_status ON milestones(status);
CREATE INDEX IF NOT EXISTS idx_milestones_due_date ON milestones(due_date);

-- RLS for milestones
ALTER TABLE milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "milestones_contract_parties_can_view" ON milestones
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM contracts
      WHERE contracts.id = milestones.contract_id
      AND (contracts.employer_id = auth.uid() OR contracts.talent_id = auth.uid())
    )
  );

CREATE POLICY "milestones_contract_parties_can_manage" ON milestones
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM contracts
      WHERE contracts.id = milestones.contract_id
      AND contracts.employer_id = auth.uid()
    )
  );

CREATE POLICY "milestones_contract_parties_can_update" ON milestones
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM contracts
      WHERE contracts.id = milestones.contract_id
      AND (contracts.employer_id = auth.uid() OR contracts.talent_id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM contracts
      WHERE contracts.id = milestones.contract_id
      AND (contracts.employer_id = auth.uid() OR contracts.talent_id = auth.uid())
    )
  );

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers for updated_at
DROP TRIGGER IF EXISTS projects_updated_at ON projects;
CREATE TRIGGER projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS project_proposals_updated_at ON project_proposals;
CREATE TRIGGER project_proposals_updated_at
  BEFORE UPDATE ON project_proposals
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS contracts_updated_at ON contracts;
CREATE TRIGGER contracts_updated_at
  BEFORE UPDATE ON contracts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS milestones_updated_at ON milestones;
CREATE TRIGGER milestones_updated_at
  BEFORE UPDATE ON milestones
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- Source: 20260422_service_catalog.sql
-- ========================================
-- Phase 10: Service Catalog + Payments + Reputation + Self-Healing + i18n
-- Service Catalog Tables Migration

CREATE TABLE IF NOT EXISTS service_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  talent_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL,
  category text NOT NULL,
  base_price numeric NOT NULL CHECK (base_price > 0),
  delivery_time_days integer NOT NULL CHECK (delivery_time_days > 0),
  revisions_included integer NOT NULL DEFAULT 1 CHECK (revisions_included > 0),
  image_url text,
  is_active boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT title_not_empty CHECK (length(trim(title)) > 0),
  CONSTRAINT description_not_empty CHECK (length(trim(description)) > 0),
  CONSTRAINT category_not_empty CHECK (length(trim(category)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_service_catalog_talent_id ON service_catalog(talent_id);
CREATE INDEX IF NOT EXISTS idx_service_catalog_status ON service_catalog(status);
CREATE INDEX IF NOT EXISTS idx_service_catalog_category ON service_catalog(category);
CREATE INDEX IF NOT EXISTS idx_service_catalog_is_active ON service_catalog(is_active);

ALTER TABLE service_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_catalog_talent_can_view_own" ON service_catalog
  FOR SELECT USING (talent_id = auth.uid());

CREATE POLICY "service_catalog_talent_can_create" ON service_catalog
  FOR INSERT WITH CHECK (
    talent_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'talent'
    )
  );

CREATE POLICY "service_catalog_talent_can_update_own" ON service_catalog
  FOR UPDATE USING (talent_id = auth.uid())
  WITH CHECK (talent_id = auth.uid());

CREATE POLICY "service_catalog_public_can_view_published" ON service_catalog
  FOR SELECT USING (is_active = true AND status = 'published');

CREATE TABLE IF NOT EXISTS service_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid NOT NULL REFERENCES service_catalog(id) ON DELETE CASCADE,
  package_name text NOT NULL,
  price numeric NOT NULL CHECK (price > 0),
  delivery_time_days integer NOT NULL CHECK (delivery_time_days > 0),
  features text[] NOT NULL DEFAULT '{}',
  description text,
  is_featured boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_packages_service_id ON service_packages(service_id);
ALTER TABLE service_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_packages_anyone_can_view_published" ON service_packages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM service_catalog
      WHERE service_catalog.id = service_packages.service_id
      AND service_catalog.is_active = true AND service_catalog.status = 'published'
    )
  );

CREATE POLICY "service_packages_talent_can_manage_own" ON service_packages
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM service_catalog
      WHERE service_catalog.id = service_packages.service_id
      AND service_catalog.talent_id = auth.uid()
    )
  );

CREATE TABLE IF NOT EXISTS catalog_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES service_packages(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES service_catalog(id) ON DELETE CASCADE,
  buyer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  talent_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_price numeric NOT NULL CHECK (order_price > 0),
  delivery_date date NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'in_progress', 'completed', 'cancelled', 'delivered')),
  payment_status text NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'processing', 'completed', 'failed', 'refunded')),
  stripe_payment_intent_id text,
  special_requests text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_catalog_orders_buyer_id ON catalog_orders(buyer_id);
CREATE INDEX IF NOT EXISTS idx_catalog_orders_talent_id ON catalog_orders(talent_id);
CREATE INDEX IF NOT EXISTS idx_catalog_orders_status ON catalog_orders(status);

ALTER TABLE catalog_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "catalog_orders_parties_can_view" ON catalog_orders
  FOR SELECT USING (buyer_id = auth.uid() OR talent_id = auth.uid());

CREATE POLICY "catalog_orders_buyer_can_create" ON catalog_orders
  FOR INSERT WITH CHECK (buyer_id = auth.uid());

CREATE POLICY "catalog_orders_parties_can_update" ON catalog_orders
  FOR UPDATE USING (buyer_id = auth.uid() OR talent_id = auth.uid())
  WITH CHECK (buyer_id = auth.uid() OR talent_id = auth.uid());

CREATE TABLE IF NOT EXISTS proposal_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  talent_id uuid,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'failed' CHECK (status IN ('failed', 'pending', 'processed')),
  error_message text,
  retry_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proposal_queue_status ON proposal_queue(status);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS service_catalog_updated_at ON service_catalog;
CREATE TRIGGER service_catalog_updated_at BEFORE UPDATE ON service_catalog
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS service_packages_updated_at ON service_packages;
CREATE TRIGGER service_packages_updated_at BEFORE UPDATE ON service_packages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS catalog_orders_updated_at ON catalog_orders;
CREATE TRIGGER catalog_orders_updated_at BEFORE UPDATE ON catalog_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS proposal_queue_updated_at ON proposal_queue;
CREATE TRIGGER proposal_queue_updated_at BEFORE UPDATE ON proposal_queue
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- Source: 20260422_support_tickets_fix_ticket_number_default.sql
-- ========================================
-- Fix ticket_number generation: drop UUID-based column default so the
-- trg_set_ticket_number trigger fires and produces sequential TKT-0001 numbers.
-- Previously the column default ('TKT-' || substr(gen_random_uuid(), 1, 8))
-- ran before the BEFORE INSERT trigger could see a NULL, preventing the
-- sequence from ever being used.

ALTER TABLE public.support_tickets ALTER COLUMN ticket_number DROP DEFAULT;

-- ========================================
-- Source: 20260425_reputation.sql
-- ========================================
-- Phase 10: Reputation System - Ratings and Reviews

CREATE TABLE IF NOT EXISTS ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rater_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ratee_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id uuid REFERENCES catalog_orders(id) ON DELETE SET NULL,
  contract_id uuid REFERENCES contracts(id) ON DELETE SET NULL,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review_text text,
  categories jsonb DEFAULT '{}',
  is_anonymous boolean NOT NULL DEFAULT false,
  helpful_count integer NOT NULL DEFAULT 0,
  unhelpful_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'flagged', 'removed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT not_self_rating CHECK (rater_id != ratee_id)
);

CREATE INDEX IF NOT EXISTS idx_ratings_rater_id ON ratings(rater_id);
CREATE INDEX IF NOT EXISTS idx_ratings_ratee_id ON ratings(ratee_id);
CREATE INDEX IF NOT EXISTS idx_ratings_rating ON ratings(rating);
CREATE INDEX IF NOT EXISTS idx_ratings_status ON ratings(status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ratings_unique_order ON ratings(rater_id, ratee_id, order_id)
  WHERE order_id IS NOT NULL AND status != 'removed';
CREATE UNIQUE INDEX IF NOT EXISTS idx_ratings_unique_contract ON ratings(rater_id, ratee_id, contract_id)
  WHERE contract_id IS NOT NULL AND status != 'removed';

ALTER TABLE ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ratings_anyone_can_view_published" ON ratings
  FOR SELECT USING (status = 'published');
CREATE POLICY "ratings_rater_can_view_own" ON ratings
  FOR SELECT USING (rater_id = auth.uid());
CREATE POLICY "ratings_ratee_can_view_own" ON ratings
  FOR SELECT USING (ratee_id = auth.uid());

CREATE POLICY "ratings_rater_can_create" ON ratings
  FOR INSERT WITH CHECK (
    rater_id = auth.uid()
    AND (
      (order_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM catalog_orders
        WHERE catalog_orders.id = ratings.order_id
        AND catalog_orders.buyer_id = auth.uid()
        AND catalog_orders.status = 'completed'
      ))
      OR
      (contract_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM contracts
        WHERE contracts.id = ratings.contract_id
        AND contracts.employer_id = auth.uid()
        AND contracts.status = 'completed'
      ))
    )
  );

CREATE POLICY "ratings_rater_can_update_own" ON ratings
  FOR UPDATE USING (rater_id = auth.uid() AND status = 'published')
  WITH CHECK (rater_id = auth.uid());

CREATE TABLE IF NOT EXISTS reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rating_id uuid NOT NULL REFERENCES ratings(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reviewee_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text,
  body text NOT NULL,
  is_verified_purchase boolean NOT NULL DEFAULT false,
  helpful_count integer NOT NULL DEFAULT 0,
  unhelpful_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'flagged', 'removed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT body_not_empty CHECK (length(trim(body)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_reviews_rating_id ON reviews(rating_id);
CREATE INDEX IF NOT EXISTS idx_reviews_reviewee_id ON reviews(reviewee_id);
CREATE INDEX IF NOT EXISTS idx_reviews_status ON reviews(status);

ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reviews_anyone_can_view_published" ON reviews
  FOR SELECT USING (status = 'published');
CREATE POLICY "reviews_reviewer_can_view_own" ON reviews
  FOR SELECT USING (reviewer_id = auth.uid());
CREATE POLICY "reviews_reviewer_can_create" ON reviews
  FOR INSERT WITH CHECK (
    reviewer_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM ratings WHERE ratings.id = reviews.rating_id AND ratings.rater_id = auth.uid()
    )
  );

CREATE TABLE IF NOT EXISTS review_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (reason IN ('spam', 'inappropriate', 'off_topic', 'misleading', 'other')),
  description text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'resolved', 'dismissed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE review_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "review_reports_reporter_can_create" ON review_reports
  FOR INSERT WITH CHECK (reporter_id = auth.uid());
CREATE POLICY "review_reports_reporter_can_view_own" ON review_reports
  FOR SELECT USING (reporter_id = auth.uid());

CREATE OR REPLACE VIEW user_reputation_summary AS
SELECT
  u.id,
  COUNT(DISTINCT r.id) as total_ratings,
  ROUND(AVG(CASE WHEN r.status = 'published' THEN r.rating END)::numeric, 2) as average_rating,
  COUNT(CASE WHEN r.rating = 5 AND r.status = 'published' THEN 1 END) as five_star_count,
  COUNT(CASE WHEN r.rating = 1 AND r.status = 'published' THEN 1 END) as one_star_count,
  MAX(r.created_at) as last_review_date
FROM auth.users u
LEFT JOIN ratings r ON u.id = r.ratee_id
GROUP BY u.id;

CREATE TABLE IF NOT EXISTS helpful_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  voter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_helpful boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_helpful_votes_unique ON helpful_votes(review_id, voter_id);
ALTER TABLE helpful_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "helpful_votes_voter_can_create" ON helpful_votes
  FOR INSERT WITH CHECK (voter_id = auth.uid());

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ratings_updated_at ON ratings;
CREATE TRIGGER ratings_updated_at BEFORE UPDATE ON ratings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS reviews_updated_at ON reviews;
CREATE TRIGGER reviews_updated_at BEFORE UPDATE ON reviews
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS review_reports_updated_at ON review_reports;
CREATE TRIGGER review_reports_updated_at BEFORE UPDATE ON review_reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE FUNCTION update_review_helpful_counts()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE reviews SET
    helpful_count = (SELECT COUNT(*) FROM helpful_votes WHERE review_id = NEW.review_id AND is_helpful = true),
    unhelpful_count = (SELECT COUNT(*) FROM helpful_votes WHERE review_id = NEW.review_id AND is_helpful = false)
  WHERE id = NEW.review_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_helpful_counts ON helpful_votes;
CREATE TRIGGER update_helpful_counts AFTER INSERT OR DELETE ON helpful_votes
  FOR EACH ROW EXECUTE FUNCTION update_review_helpful_counts();

-- ========================================
-- Source: 20260425_service_health_extend.sql
-- ========================================
-- Phase 10: Service Health Migration for AI Recovery Service

ALTER TABLE service_health
  ADD COLUMN IF NOT EXISTS retry_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS fallback_active boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_recovery_attempt timestamptz;

CREATE TABLE IF NOT EXISTS admin_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name text NOT NULL,
  alert_type text NOT NULL CHECK (alert_type IN ('critical', 'warning', 'info')),
  message text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_admin_alerts_service_name ON admin_alerts(service_name);
CREATE INDEX IF NOT EXISTS idx_admin_alerts_status ON admin_alerts(status);
CREATE INDEX IF NOT EXISTS idx_admin_alerts_severity ON admin_alerts(severity);

CREATE TABLE IF NOT EXISTS talent_stripe_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_account_id text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'restricted')),
  verification_status text DEFAULT 'unverified' CHECK (verification_status IN ('unverified', 'verified', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_talent_stripe_accounts_user_id ON talent_stripe_accounts(user_id);

CREATE TABLE IF NOT EXISTS talent_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  talent_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id uuid REFERENCES catalog_orders(id) ON DELETE SET NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  stripe_transfer_id text UNIQUE,
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_talent_payouts_talent_id ON talent_payouts(talent_id);
CREATE INDEX IF NOT EXISTS idx_talent_payouts_status ON talent_payouts(status);

ALTER TABLE admin_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_alerts_admins_can_view" ON admin_alerts
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

ALTER TABLE talent_stripe_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "talent_stripe_accounts_talent_can_view_own" ON talent_stripe_accounts
  FOR SELECT USING (user_id = auth.uid());

ALTER TABLE talent_payouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "talent_payouts_talent_can_view_own" ON talent_payouts
  FOR SELECT USING (talent_id = auth.uid());

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS admin_alerts_updated_at ON admin_alerts;
CREATE TRIGGER admin_alerts_updated_at BEFORE UPDATE ON admin_alerts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS talent_stripe_accounts_updated_at ON talent_stripe_accounts;
CREATE TRIGGER talent_stripe_accounts_updated_at BEFORE UPDATE ON talent_stripe_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS talent_payouts_updated_at ON talent_payouts;
CREATE TRIGGER talent_payouts_updated_at BEFORE UPDATE ON talent_payouts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- Source: 20260430_domain_extraction_hints.sql
-- ========================================
-- domain_extraction_hints
-- Adaptive learning table for scrape-url agent.

CREATE TABLE IF NOT EXISTS domain_extraction_hints (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  domain         text        NOT NULL,
  best_strategy  text,
  best_selector  text,
  success_count  integer     NOT NULL DEFAULT 0,
  failure_count  integer     NOT NULL DEFAULT 0,
  last_success_at  timestamptz,
  last_failure_at  timestamptz,
  last_seen_at     timestamptz NOT NULL DEFAULT now(),
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS domain_extraction_hints_domain_idx
  ON domain_extraction_hints(domain);

CREATE INDEX IF NOT EXISTS domain_extraction_hints_strategy_idx
  ON domain_extraction_hints(best_strategy);

ALTER TABLE domain_extraction_hints ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access" ON domain_extraction_hints;
CREATE POLICY "service_role_full_access" ON domain_extraction_hints
  TO service_role USING (true) WITH CHECK (true);

-- ========================================
-- Source: 20260430_extraction_cache_rpcs.sql
-- ========================================
-- Helper RPCs for adaptive extraction cache — atomic counter increments.

CREATE OR REPLACE FUNCTION increment_extraction_success(p_domain text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO domain_extraction_hints (domain, success_count, failure_count)
    VALUES (p_domain, 1, 0)
  ON CONFLICT (domain)
  DO UPDATE SET
    success_count = domain_extraction_hints.success_count + 1,
    last_seen_at  = now(),
    updated_at    = now();
END;
$$;

CREATE OR REPLACE FUNCTION increment_extraction_failure(p_domain text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO domain_extraction_hints (domain, success_count, failure_count)
    VALUES (p_domain, 0, 1)
  ON CONFLICT (domain)
  DO UPDATE SET
    failure_count = domain_extraction_hints.failure_count + 1,
    last_seen_at  = now(),
    updated_at    = now();
END;
$$;

GRANT EXECUTE ON FUNCTION increment_extraction_success(text) TO service_role;
GRANT EXECUTE ON FUNCTION increment_extraction_failure(text) TO service_role;

-- ========================================
-- Source: 20260501_job_search_agent.sql
-- ========================================
-- Job Search Agent Infrastructure
-- Tables: user_opportunity_matches, job_alerts, job_feed_log
-- RPC:    mark_job_interaction

-- user_opportunity_matches — AI fit scores per user/job
CREATE TABLE IF NOT EXISTS user_opportunity_matches (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id          uuid        NOT NULL,
  fit_score       integer     NOT NULL DEFAULT 0 CHECK (fit_score BETWEEN 0 AND 100),
  matched_skills  text[]      NOT NULL DEFAULT '{}',
  skill_gaps      text[]      NOT NULL DEFAULT '{}',
  strengths       text[]      NOT NULL DEFAULT '{}',
  red_flags       text[]      NOT NULL DEFAULT '{}',
  match_summary   text,
  effort_level    text        CHECK (effort_level IN ('easy','moderate','hard')),
  response_prob   integer     CHECK (response_prob BETWEEN 0 AND 100),
  smart_tag       text,
  is_seen         boolean     NOT NULL DEFAULT false,
  is_saved        boolean     NOT NULL DEFAULT false,
  is_ignored      boolean     NOT NULL DEFAULT false,
  is_applied      boolean     NOT NULL DEFAULT false,
  scored_at       timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, job_id)
);

CREATE INDEX IF NOT EXISTS user_opportunity_matches_user_score_idx
  ON user_opportunity_matches(user_id, fit_score DESC);

CREATE INDEX IF NOT EXISTS user_opportunity_matches_user_seen_idx
  ON user_opportunity_matches(user_id, is_seen, is_ignored);

ALTER TABLE user_opportunity_matches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_matches" ON user_opportunity_matches;
CREATE POLICY "users_own_matches" ON user_opportunity_matches
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "service_role_full_ujm" ON user_opportunity_matches;
CREATE POLICY "service_role_full_ujm" ON user_opportunity_matches
  TO service_role USING (true) WITH CHECK (true);

-- job_alerts — user alert subscriptions
CREATE TABLE IF NOT EXISTS job_alerts (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name            text        NOT NULL DEFAULT 'Job Alert',
  search_query    text,
  location        text,
  is_remote       boolean,
  job_type        text,
  min_fit_score   integer     DEFAULT 70 CHECK (min_fit_score BETWEEN 0 AND 100),
  salary_min      integer,
  frequency       text        NOT NULL DEFAULT 'daily'
                              CHECK (frequency IN ('realtime','daily','weekly')),
  is_active       boolean     NOT NULL DEFAULT true,
  last_sent_at    timestamptz,
  match_count     integer     NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS job_alerts_user_active_idx ON job_alerts(user_id, is_active);

ALTER TABLE job_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_alerts" ON job_alerts;
CREATE POLICY "users_own_alerts" ON job_alerts
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "service_role_full_alerts" ON job_alerts;
CREATE POLICY "service_role_full_alerts" ON job_alerts
  TO service_role USING (true) WITH CHECK (true);

-- job_feed_log — audit log
CREATE TABLE IF NOT EXISTS job_feed_log (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  source        text        NOT NULL,
  fetched_at    timestamptz NOT NULL DEFAULT now(),
  jobs_found    integer     NOT NULL DEFAULT 0,
  jobs_new      integer     NOT NULL DEFAULT 0,
  jobs_updated  integer     NOT NULL DEFAULT 0,
  error         text,
  duration_ms   integer
);

CREATE INDEX IF NOT EXISTS job_feed_log_source_idx ON job_feed_log(source, fetched_at DESC);

ALTER TABLE job_feed_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_feed_log" ON job_feed_log;
CREATE POLICY "service_role_feed_log" ON job_feed_log
  TO service_role USING (true) WITH CHECK (true);

-- mark_job_interaction RPC
CREATE OR REPLACE FUNCTION mark_job_interaction(
  p_user_id  uuid,
  p_job_id   uuid,
  p_action   text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO user_opportunity_matches (user_id, job_id, fit_score, is_seen, is_saved, is_ignored, is_applied)
    VALUES (
      p_user_id, p_job_id, 0,
      p_action = 'seen',
      p_action = 'saved',
      p_action = 'ignored',
      p_action = 'applied'
    )
  ON CONFLICT (user_id, job_id) DO UPDATE SET
    is_seen    = CASE WHEN p_action = 'seen'    THEN true ELSE user_opportunity_matches.is_seen END,
    is_saved   = CASE WHEN p_action = 'saved'   THEN true ELSE user_opportunity_matches.is_saved END,
    is_ignored = CASE WHEN p_action = 'ignored' THEN true ELSE user_opportunity_matches.is_ignored END,
    is_applied = CASE WHEN p_action = 'applied' THEN true ELSE user_opportunity_matches.is_applied END,
    updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION mark_job_interaction(uuid, uuid, text) TO authenticated, service_role;

-- ========================================
-- Source: 20260502_job_postings_scraper_columns.sql
-- ========================================
-- ============================================================================
-- Add scraper columns to job_postings + update scraped_jobs VIEW
--
-- Root cause: the April 13 migration (CREATE TABLE IF NOT EXISTS job_postings)
-- was silently skipped because the March 25 employer-postings table already
-- existed. So job_postings has the March 25 schema (user_id, status, etc.)
-- but lacks external_id and scraped_at, causing the Python scraper and
-- job-feeds edge function to fail on upsert.
--
-- This migration:
--   1. Adds the missing scraper columns (external_id, scraped_at, apply_url,
--      remote_type, experience_level) to the existing table
--   2. Updates scraped_jobs VIEW so scraped opportunities (external_id IS NOT NULL)
--      show up alongside active employer postings
-- ============================================================================

-- 1. Add scraper columns (IF NOT EXISTS — idempotent)
ALTER TABLE public.job_postings
  ADD COLUMN IF NOT EXISTS external_id     text,
  ADD COLUMN IF NOT EXISTS scraped_at      timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS apply_url       text,
  ADD COLUMN IF NOT EXISTS remote_type     text,
  ADD COLUMN IF NOT EXISTS experience_level text,
  ADD COLUMN IF NOT EXISTS date_posted     timestamptz;

-- Unique constraint on external_id for scraper dedup (ignore if exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'job_postings_external_id_key'
  ) THEN
    ALTER TABLE public.job_postings
      ADD CONSTRAINT job_postings_external_id_key UNIQUE (external_id);
  END IF;
END
$$;

-- Index for scraper freshness queries
CREATE INDEX IF NOT EXISTS idx_job_postings_scraped_at
  ON public.job_postings(scraped_at DESC)
  WHERE external_id IS NOT NULL;

-- 2. Re-create scraped_jobs VIEW to include both employer postings AND scraped opportunities
CREATE OR REPLACE VIEW public.scraped_jobs AS
SELECT
  jp.id,
  jp.title,
  jp.company,
  jp.location,
  COALESCE(jp.job_type, jp.remote_type)  AS job_type,
  jp.description,
  jp.external_id                          AS source_id,
  COALESCE(jp.is_remote, jp.remote_type IN ('remote', 'hybrid')) AS is_remote,
  jp.experience_level                     AS seniority,
  CASE
    WHEN jp.salary_min IS NOT NULL AND jp.salary_max IS NOT NULL
      THEN (jp.salary_min + jp.salary_max) / 2
    WHEN jp.salary_max IS NOT NULL THEN jp.salary_max
    WHEN jp.salary_min IS NOT NULL THEN jp.salary_min
    ELSE NULL
  END                                     AS market_rate,
  CASE
    WHEN jp.salary_min IS NOT NULL AND jp.salary_max IS NOT NULL
      THEN '$' || to_char(jp.salary_min, 'FM999,999') || ' - $' || to_char(jp.salary_max, 'FM999,999')
    WHEN jp.salary_max IS NOT NULL THEN 'Up to $' || to_char(jp.salary_max, 'FM999,999')
    WHEN jp.salary_min IS NOT NULL THEN 'From $' || to_char(jp.salary_min, 'FM999,999')
    ELSE NULL
  END                                     AS salary,
  50                                      AS quality_score,
  false                                   AS is_flagged,
  NULL::jsonb                             AS flag_reasons,
  NULL::jsonb                             AS compensation_breakdown,
  NULL::jsonb                             AS salary_range_estimated,
  NULL::text                              AS industry,
  jp.created_at,
  COALESCE(jp.scraped_at, jp.created_at)  AS first_seen_at,
  jp.updated_at                           AS last_seen_at,
  COALESCE(jp.job_url, jp.apply_url)      AS job_url,
  COALESCE(jp.source, 'internal')         AS source
FROM public.job_postings jp
WHERE jp.status = 'active'       -- employer-posted opportunities
   OR jp.external_id IS NOT NULL -- scraped / feed-ingested opportunities
;

GRANT SELECT ON public.scraped_jobs TO anon, authenticated;

COMMENT ON VIEW public.scraped_jobs IS
  'Unified job feed: active employer postings + externally scraped jobs. '
  'Use external_id IS NOT NULL to identify feed-ingested rows.';

-- ========================================
-- Source: 20260503_job_postings_add_job_url.sql
-- ========================================
-- Add missing job_url column to job_postings (March-25 table lacks it)
-- The scraped_jobs VIEW references jp.job_url; without this column the VIEW
-- fails with "column jp.job_url does not exist" and returns 0 rows.

ALTER TABLE public.job_postings
  ADD COLUMN IF NOT EXISTS job_url text;

-- ========================================
-- Source: 20260504_support_tickets_add_support_agent_role.sql
-- ========================================
-- Must be a separate committed transaction before support_agent can be referenced in is_staff()
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'support_agent';

-- ========================================
-- Source: 20260504_support_tickets_phase1.sql
-- ========================================
-- NOTE: This file was superseded before being applied.
-- The actual Phase 1 migrations that were applied to production are:
--   20260504_support_tickets_add_support_agent_role.sql
--   20260504_support_tickets_phase1_delta.sql
-- This file is kept for reference only.

-- ========================================
-- Source: 20260504_support_tickets_phase1_delta.sql
-- ========================================
-- ============================================================
-- Phase 1 delta: bring existing support_tickets up to spec
-- and add ticket_messages + is_staff() + triggers
-- (support_agent enum value committed in prior migration)
-- ============================================================

-- ────────────────────────────────────────────
-- 1. Alter support_tickets — add missing columns
-- ────────────────────────────────────────────

-- Make user_id nullable for email-sourced guest tickets
ALTER TABLE public.support_tickets
  ALTER COLUMN user_id DROP NOT NULL;

-- category (alongside existing request_type)
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'general'
    CHECK (category IN ('general','account','billing','bug','feature_request','other'));

-- source to distinguish web vs inbound email (bugs@icareeros.com)
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'web'
    CHECK (source IN ('web','email'));

-- guest_email for non-registered inbound email senders
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS guest_email TEXT;

-- ────────────────────────────────────────────
-- 2. Sequence-based ticket numbering
-- ────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS public.support_ticket_seq START 1;

CREATE OR REPLACE FUNCTION public.set_ticket_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.ticket_number IS NULL OR NEW.ticket_number = '' THEN
    NEW.ticket_number := 'TKT-' || LPAD(nextval('public.support_ticket_seq')::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_ticket_number ON public.support_tickets;
CREATE TRIGGER trg_set_ticket_number
  BEFORE INSERT ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.set_ticket_number();

-- ────────────────────────────────────────────
-- 3. ticket_messages table
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ticket_messages (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id        UUID        NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  user_id          UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  body             TEXT        NOT NULL,
  is_internal_note BOOLEAN     NOT NULL DEFAULT FALSE,
  is_staff_reply   BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket_id ON public.ticket_messages(ticket_id);

-- ────────────────────────────────────────────
-- 4. Bump ticket updated_at on new message
-- ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.bump_ticket_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.support_tickets SET updated_at = NOW() WHERE id = NEW.ticket_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bump_ticket_updated_at ON public.ticket_messages;
CREATE TRIGGER trg_bump_ticket_updated_at
  AFTER INSERT ON public.ticket_messages
  FOR EACH ROW EXECUTE FUNCTION public.bump_ticket_updated_at();

-- ────────────────────────────────────────────
-- 5. is_staff() — uses existing has_role() + user_roles
--    Grants access for admin or support_agent
-- ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public' AS $$
  SELECT public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'support_agent'::public.app_role);
$$;

-- ────────────────────────────────────────────
-- 6. Refresh support_tickets RLS — clean slate
-- ────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can manage all tickets"   ON public.support_tickets;
DROP POLICY IF EXISTS "Service role can manage tickets"  ON public.support_tickets;
DROP POLICY IF EXISTS "admins can manage tickets"        ON public.support_tickets;
DROP POLICY IF EXISTS "users can read own tickets"       ON public.support_tickets;
DROP POLICY IF EXISTS "Users can view own tickets"       ON public.support_tickets;
DROP POLICY IF EXISTS "Users can insert own tickets"     ON public.support_tickets;
DROP POLICY IF EXISTS "Users can update own tickets"     ON public.support_tickets;
DROP POLICY IF EXISTS "tickets_select"                   ON public.support_tickets;
DROP POLICY IF EXISTS "tickets_insert"                   ON public.support_tickets;
DROP POLICY IF EXISTS "tickets_update"                   ON public.support_tickets;

CREATE POLICY "tickets_select"
  ON public.support_tickets FOR SELECT
  USING (auth.uid() = user_id OR public.is_staff());

CREATE POLICY "tickets_insert"
  ON public.support_tickets FOR INSERT
  WITH CHECK (
    (auth.uid() = user_id AND user_id IS NOT NULL)
    OR public.is_staff()
  );

CREATE POLICY "tickets_update"
  ON public.support_tickets FOR UPDATE
  USING (public.is_staff());

-- ────────────────────────────────────────────
-- 7. RLS — ticket_messages
-- ────────────────────────────────────────────
ALTER TABLE public.ticket_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "messages_select"
  ON public.ticket_messages FOR SELECT
  USING (
    (
      EXISTS (
        SELECT 1 FROM public.support_tickets t
        WHERE t.id = ticket_id AND t.user_id = auth.uid()
      )
      AND NOT is_internal_note
    )
    OR public.is_staff()
  );

CREATE POLICY "messages_insert_user"
  ON public.ticket_messages FOR INSERT
  WITH CHECK (
    NOT is_internal_note
    AND auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = ticket_id
        AND t.user_id = auth.uid()
        AND t.status NOT IN ('resolved', 'closed')
    )
  );

CREATE POLICY "messages_insert_staff"
  ON public.ticket_messages FOR INSERT
  WITH CHECK (public.is_staff());

-- ────────────────────────────────────────────
-- 8. Additional indexes
-- ────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_support_tickets_source  ON public.support_tickets(source);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status  ON public.support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id ON public.support_tickets(user_id);