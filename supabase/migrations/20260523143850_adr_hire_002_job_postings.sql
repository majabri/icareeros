-- ADR-HIRE-002: Stage 01 Design cross-side write path
-- Approved by Amir 2026-05-22 (ADR-HIRE-002 v1.1 — Drive 1ZWFXw3_m_2Y_RprdKj_e0Is9G7Alkbtm)
-- Applied to prod (kuneabeiwcxavvyyfjkx) 2026-05-23 by Platform Cowork.
-- Platform Cowork executes. hire Cowork never touches migrations.
--
-- Deviation from brief: the brief's trigger + backfill INSERTed `created_at`
-- on `opportunities`, but that column does not exist on the table (verified
-- against information_schema 2026-05-23 — opportunities has `updated_at`,
-- `posted_at`, `first_seen_at`, `discovered_at`, `verified_at`, but no
-- `created_at`). `created_at` removed from both INSERT lists.
--
-- Deviation from brief: `ADD CONSTRAINT IF NOT EXISTS` is not valid Postgres
-- syntax for non-FK constraints; the UNIQUE constraint on
-- `opportunities.job_posting_id` is added via a DO block keyed on
-- pg_constraint for replay safety.

-- ── D2: published_at ──────────────────────────────────────────────────────
alter table job_postings
  add column if not exists published_at timestamptz;

-- ── D3: RLS ───────────────────────────────────────────────────────────────
alter table job_postings enable row level security;

drop policy if exists "employer_own_posts" on job_postings;
create policy "employer_own_posts" on job_postings
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── D5: indexes on job_postings ───────────────────────────────────────────
create index if not exists idx_job_postings_status_created
  on job_postings (status, created_at desc);

create index if not exists idx_job_postings_user_id
  on job_postings (user_id);

-- ── D1: add job_posting_id FK on opportunities ────────────────────────────
alter table opportunities
  add column if not exists job_posting_id uuid
  references job_postings(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'opportunities_job_posting_id_unique'
  ) then
    alter table opportunities
      add constraint opportunities_job_posting_id_unique
      unique (job_posting_id);
  end if;
end $$;

create index if not exists idx_opportunities_job_posting_id
  on opportunities (job_posting_id)
  where job_posting_id is not null;

-- ── D1: mirror trigger ────────────────────────────────────────────────────
create or replace function sync_job_posting_to_opportunities()
returns trigger language plpgsql security definer as $$
begin
  if NEW.status = 'open' then
    insert into opportunities (
      job_posting_id,
      source,
      title,
      company,
      description,
      location,
      job_type,
      is_remote,
      salary_min,
      salary_max,
      is_active,
      quality_score,
      verification_status,
      posted_at,
      updated_at
    ) values (
      NEW.id,
      'employer',
      NEW.title,
      NEW.company,
      NEW.description,
      NEW.location,
      NEW.job_type,
      NEW.is_remote,
      NEW.salary_min,
      NEW.salary_max,
      true,
      0.85,
      'employer_posted',
      now(),
      now()
    )
    on conflict (job_posting_id) do update set
      title       = excluded.title,
      company     = excluded.company,
      description = excluded.description,
      location    = excluded.location,
      job_type    = excluded.job_type,
      is_remote   = excluded.is_remote,
      salary_min  = excluded.salary_min,
      salary_max  = excluded.salary_max,
      is_active   = true,
      updated_at  = now();

    -- Set published_at on first publish
    if OLD.status is distinct from 'open' then
      update job_postings
        set published_at = now()
        where id = NEW.id;
    end if;

  elsif NEW.status in ('closed', 'filled') then
    update opportunities
      set is_active = false, updated_at = now()
      where job_posting_id = NEW.id;
  end if;

  return NEW;
end;
$$;

drop trigger if exists sync_job_posting_to_opportunities on job_postings;
create trigger sync_job_posting_to_opportunities
  after insert or update on job_postings
  for each row execute function sync_job_posting_to_opportunities();

-- ── D1: initial backfill ──────────────────────────────────────────────────
-- Zero rows expected today; included for replay safety.
insert into opportunities (
  job_posting_id, source, title, company, description,
  location, job_type, is_remote, salary_min, salary_max,
  is_active, quality_score, verification_status, posted_at,
  updated_at
)
select
  id, 'employer', title, company, description,
  location, job_type, is_remote, salary_min, salary_max,
  true, 0.85, 'employer_posted',
  coalesce(published_at, created_at),
  now()
from job_postings
where status = 'open'
on conflict (job_posting_id) do nothing;

-- ── D9: recruiter_invites FK + index ─────────────────────────────────────
alter table recruiter_invites
  add column if not exists job_posting_id uuid
  references job_postings(id);

create index if not exists idx_recruiter_invites_job_posting_id
  on recruiter_invites (job_posting_id)
  where job_posting_id is not null;
