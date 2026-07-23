-- ═════════════════════════════════════════════════════════════════════════
-- ⚠️  ALREADY APPLIED IN PROD ON 2026-07-23 — DO NOT RE-RUN
-- ═════════════════════════════════════════════════════════════════════════
--
-- Platform applied this migration inline on 2026-07-23 to unblock the
-- enrich-jobs v9 deploy from PR #401 after that PR's "no migration
-- required" claim was found to be wrong (see also fix/jobs-desc-fetch-
-- hardening PR body for the post-mortem). Recorded in
-- supabase_migrations.schema_migrations as version 20260723131008,
-- statement text byte-identical to this file.
--
-- This file is committed to git AFTER the fact so the migration appears
-- in `supabase/migrations/` for future replay against a fresh database.
-- Running `supabase db push` against prod is a no-op because
-- supabase_migrations already lists this version.
--
-- ═════════════════════════════════════════════════════════════════════════
--
-- Extend the CHECK constraint on ats_jobs.enrichment_status to accept the
-- two new states introduced by the #401 detailFetchers state machine:
--
--   needs_description — row queued for per-posting description fetch
--   description_failed — non-retryable or budget-exhausted failure
--
-- Existing states preserved: pending | complete | failed. Code paths for
-- these three are unchanged.
--
-- Applied 2026-07-23 to unblock enrich-jobs v9 deploy. #401's commit
-- message asserted "no migration required" — this is a gap Platform is
-- filling inline. A follow-up code PR will add this same migration to
-- supabase/migrations/ so it appears in git history.

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
