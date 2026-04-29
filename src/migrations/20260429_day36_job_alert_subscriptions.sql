-- Day 36: Job Alert Subscriptions
-- Stores per-user job alert preferences. One row per user (upsert pattern).

create table if not exists job_alert_subscriptions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  query            text,                        -- keyword filter (nullable = all jobs)
  is_remote        boolean not null default false,
  job_type         text,                        -- e.g. 'Full-time' (nullable = any)
  frequency        text not null default 'daily' check (frequency in ('daily', 'weekly')),
  is_active        boolean not null default true,
  last_sent_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (user_id)  -- one subscription per user
);

-- RLS
alter table job_alert_subscriptions enable row level security;

create policy "Users can view own alert subscription"
  on job_alert_subscriptions for select
  using (auth.uid() = user_id);

create policy "Users can insert own alert subscription"
  on job_alert_subscriptions for insert
  with check (auth.uid() = user_id);

create policy "Users can update own alert subscription"
  on job_alert_subscriptions for update
  using (auth.uid() = user_id);

create policy "Users can delete own alert subscription"
  on job_alert_subscriptions for delete
  using (auth.uid() = user_id);

-- Service role can read all (for cron digest sender)
create policy "Service role reads all subscriptions"
  on job_alert_subscriptions for select
  using (true);
