-- Day 36: job_alert_subscriptions
-- One row per user; stores their preferred query, remote toggle, job type, and digest frequency.

create table if not exists job_alert_subscriptions (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references auth.users(id) on delete cascade,
  query         text,
  is_remote     boolean     not null default false,
  job_type      text,
  frequency     text        not null default 'daily'
                              check (frequency in ('daily', 'weekly')),
  is_active     boolean     not null default true,
  last_sent_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id)
);

-- RLS
alter table job_alert_subscriptions enable row level security;

create policy "Users can read own alert subscription"
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

-- Service role can read all (needed by cron digest sender)
create policy "Service role reads all alert subscriptions"
  on job_alert_subscriptions for select
  using (true);

-- Keep updated_at current
create or replace function update_job_alert_subscriptions_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_job_alert_subscriptions_updated_at
  before update on job_alert_subscriptions
  for each row execute procedure update_job_alert_subscriptions_updated_at();
