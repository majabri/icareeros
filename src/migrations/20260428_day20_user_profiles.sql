-- Day 20: user_profiles — Evaluate stage entry point
-- Stores the Career OS user profile used throughout the Evaluate → Achieve cycle.

create table if not exists public.user_profiles (
  id               uuid        primary key default gen_random_uuid(),
  user_id          uuid        unique not null references auth.users(id) on delete cascade,
  full_name        text,
  current_position text,                          -- e.g. "Senior Engineer at Acme"
  target_roles     text[]      not null default '{}',  -- e.g. '{"Staff Engineer","Principal Engineer"}'
  skills           text[]      not null default '{}',  -- e.g. '{"TypeScript","React","Supabase"}'
  experience_level text        check (experience_level in ('entry','mid','senior','staff','executive')),
  location         text,
  open_to_remote   boolean     not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- RLS
alter table public.user_profiles enable row level security;

create policy "user_profiles: select own"
  on public.user_profiles for select
  using (auth.uid() = user_id);

create policy "user_profiles: insert own"
  on public.user_profiles for insert
  with check (auth.uid() = user_id);

create policy "user_profiles: update own"
  on public.user_profiles for update
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Auto-update updated_at
create or replace function public.set_updated_at()
  returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger user_profiles_updated_at
  before update on public.user_profiles
  for each row execute procedure public.set_updated_at();
