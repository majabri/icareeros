-- ─────────────────────────────────────────────────────────────────────────────
-- Day 43: email_preferences
-- Stores per-user email notification preferences and unsubscribe tokens.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.email_preferences (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  weekly_insights   boolean not null default true,
  job_alerts        boolean not null default true,
  marketing         boolean not null default false,
  unsubscribe_token uuid not null default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (user_id)
);

-- RLS
alter table public.email_preferences enable row level security;

create policy "Users can read their own email preferences"
  on public.email_preferences for select
  using (auth.uid() = user_id);

create policy "Users can insert their own email preferences"
  on public.email_preferences for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own email preferences"
  on public.email_preferences for update
  using (auth.uid() = user_id);

-- Auto-update trigger
create or replace function public.update_email_preferences_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger email_preferences_updated_at
  before update on public.email_preferences
  for each row execute function public.update_email_preferences_updated_at();

-- Index for cron queries (select all users who want weekly insights)
create index if not exists idx_email_preferences_weekly_insights
  on public.email_preferences (weekly_insights)
  where weekly_insights = true;
