-- ─────────────────────────────────────────────────────────────────────────────
-- Day 50: Legal readiness — consent ledger + ToS acceptance timestamp
-- ─────────────────────────────────────────────────────────────────────────────

-- consent_records: append-only ledger of cookie + ToS consent choices.
create type public.consent_kind as enum ('cookie', 'tos');

create table if not exists public.consent_records (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users(id) on delete set null,
  session_id      text,
  recorded_at     timestamptz not null default now(),
  schema_version  smallint not null default 1,
  kind            public.consent_kind not null default 'cookie',
  necessary       boolean not null default true,
  functional      boolean not null,
  analytics       boolean not null,
  marketing       boolean not null,
  gpc_detected    boolean not null default false,
  ip_hash         text,
  user_agent      text
);

alter table public.consent_records enable row level security;

-- Users can read their own consent records (GDPR Art. 15).
create policy "Users can read their own consent records"
  on public.consent_records for select
  using (auth.uid() = user_id);

-- Inserts come from the service role on POST /api/consent.
-- No user-facing INSERT policy (anon inserts are explicitly disallowed at the table level).

create index idx_consent_records_user_id   on public.consent_records (user_id);
create index idx_consent_records_recorded  on public.consent_records (recorded_at desc);
create index idx_consent_records_kind      on public.consent_records (kind);

-- ToS acceptance timestamp on user_profiles.
alter table public.user_profiles
  add column if not exists accepted_terms_at timestamptz;

comment on column public.user_profiles.accepted_terms_at is
  'When the user accepted /legal/terms and /legal/privacy. Required at signup.';
