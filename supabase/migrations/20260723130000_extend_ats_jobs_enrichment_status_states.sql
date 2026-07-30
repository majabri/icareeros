-- Extend ats_jobs.enrichment_status CHECK to accept #401's new state values.
--
-- ⚠ ALREADY APPLIED on prod via mgmt-API on 2026-07-23 during the enrich-jobs
--   v9 deploy. This file exists ONLY so the change appears in git history
--   and fresh-branch deploys don't reintroduce the outdated 3-value
--   constraint. Applying this file to a project that already has the fix
--   is idempotent — the DROP IF EXISTS + ADD keeps the same shape.
--
-- Background: #401 introduced the detailFetchers state machine, which
-- transitions rows through two new statuses that the pre-existing CHECK
-- constraint didn't allow:
--
--   needs_description   — row queued for per-posting description fetch
--   description_failed  — non-retryable or budget-exhausted failure
--
-- #401's commit message stated "no migration required"; that assertion
-- missed the CHECK constraint on public.ats_jobs.enrichment_status. The
-- seed UPDATE for the smoke batch failed on 2026-07-23 with:
--
--   23514: new row for relation "ats_jobs" violates check constraint
--          "ats_jobs_enrichment_status_check"
--
-- Platform patched inline via mgmt-API apply_migration (name
-- "extend_ats_jobs_enrichment_status_states"). This code-PR file is the
-- git-history record of that same change.
--
-- Existing states preserved: pending | complete | failed. All existing
-- code paths for these three are unchanged.

ALTER TABLE public.ats_jobs
  DROP CONSTRAINT IF EXISTS ats_jobs_enrichment_status_check;

ALTER TABLE public.ats_jobs
  ADD CONSTRAINT ats_jobs_enrichment_status_check
  CHECK (enrichment_status = ANY (ARRAY[
    'pending'::text,
    'complete'::text,
    'failed'::text,
    'needs_description'::text,
    'description_failed'::text
  ]));
