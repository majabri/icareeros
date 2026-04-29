-- ─────────────────────────────────────────────────────────────────────────────
-- Day 45: support_tickets
-- ─────────────────────────────────────────────────────────────────────────────

create type public.ticket_priority as enum ('low', 'normal', 'high', 'urgent');
create type public.ticket_status   as enum ('open', 'in_progress', 'resolved', 'closed');

create table if not exists public.support_tickets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  subject     text not null check (char_length(subject) between 5 and 200),
  body        text not null check (char_length(body) between 10 and 5000),
  priority    public.ticket_priority not null default 'normal',
  status      public.ticket_status   not null default 'open',
  admin_notes text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.support_tickets enable row level security;

-- Users: read/insert own tickets; no update/delete (admin only)
create policy "Users can read their own tickets"
  on public.support_tickets for select
  using (auth.uid() = user_id);

create policy "Users can submit tickets"
  on public.support_tickets for insert
  with check (auth.uid() = user_id);

-- Auto-update trigger
create or replace function public.update_support_tickets_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger support_tickets_updated_at
  before update on public.support_tickets
  for each row execute function public.update_support_tickets_updated_at();

create index idx_support_tickets_user_id   on public.support_tickets (user_id);
create index idx_support_tickets_status    on public.support_tickets (status);
create index idx_support_tickets_created   on public.support_tickets (created_at desc);
