-- Create user_role enum
CREATE TYPE public.user_role AS ENUM ('user', 'moderator', 'admin');

-- Add role column to profiles, default everyone to 'user'
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role public.user_role NOT NULL DEFAULT 'user';

-- Seed azadmin as 'admin'
UPDATE public.profiles
SET role = 'admin'
WHERE email = 'azadmin@icareeros.com';
