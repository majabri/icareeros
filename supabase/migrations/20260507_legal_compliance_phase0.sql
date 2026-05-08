-- ─────────────────────────────────────────────────────────────────────────────
-- Day 52: Legal compliance Phase 0
-- Extend consent_kind + add dsr_requests + policy_versions
--
-- Per COWORK-BRIEF-legal-deploy-v1 reconciled with shipped state:
-- - DO NOT recreate consent_records (kept from 20260505_legal_readiness_consent)
-- - Extend the consent_kind enum so the new helper can record typed consents
-- - Add dsr_requests for legal audit trail (Phase 6)
-- - Add policy_versions to track which policy version each consent was given against
-- ─────────────────────────────────────────────────────────────────────────────

-- Extend consent_kind enum.
alter type public.consent_kind add value if not exists 'privacy_terms';
alter type public.consent_kind add value if not exists 'ai_processing';
alter type public.consent_kind add value if not exists 'marketing_email';
alter type public.consent_kind add value if not exists 'resume_upload';
alter type public.consent_kind add value if not exists 'founding_nonrefundable';

-- dsr_requests: legal audit trail for Data Subject Rights requests.
-- Layered on top of existing /api/settings/{export,delete-account}
-- (which act immediately) so we have a compliance record.
create table if not exists public.dsr_requests (
  id              bigserial primary key,
  user_id         uuid references auth.users(id) on delete set null,
  email           text not null,
  request_type    text not null,
  status          text not null default 'received',
  jurisdiction    text,
  notes           text,
  received_at     timestamptz not null default now(),
  due_by          timestamptz,
  completed_at    timestamptz
);

alter table public.dsr_requests enable row level security;

drop policy if exists "Users can view own DSR requests" on public.dsr_requests;
create policy "Users can view own DSR requests"
  on public.dsr_requests for select
  using (auth.uid() = user_id);
-- No INSERT policy: rows are created by service-role server actions.

create index if not exists idx_dsr_requests_user_id  on public.dsr_requests (user_id);
create index if not exists idx_dsr_requests_email    on public.dsr_requests (email);
create index if not exists idx_dsr_requests_received on public.dsr_requests (received_at desc);
create index if not exists idx_dsr_requests_status   on public.dsr_requests (status);

-- policy_versions: track which version of each policy is currently in effect.
create table if not exists public.policy_versions (
  id                   bigserial primary key,
  policy_type          text not null unique,
  version              text not null,
  effective_date       date not null,
  summary_of_changes   text,
  created_at           timestamptz not null default now()
);

alter table public.policy_versions enable row level security;

drop policy if exists "Anyone can read policy versions" on public.policy_versions;
create policy "Anyone can read policy versions"
  on public.policy_versions for select
  using (true);

insert into public.policy_versions (policy_type, version, effective_date, summary_of_changes)
values
  ('privacy_policy',   '1.0', current_date, 'Initial draft — lawyer review in progress'),
  ('terms_of_service', '1.0', current_date, 'Initial draft — lawyer review in progress'),
  ('founding_terms',   '1.0', current_date, 'Non-refundable founding offer terms — draft')
on conflict (policy_type) do nothing;
