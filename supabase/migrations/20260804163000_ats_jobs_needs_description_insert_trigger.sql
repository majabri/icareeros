-- ═════════════════════════════════════════════════════════════════════════
-- ⏳ NOT YET APPLIED — Platform applies as part of fix/jobs-ingest-identity-
-- and-breaker (v12 rework, PR #406). Ships alongside the code change that
-- removes `enrichment_status` from GH/SR/WD ingest payloads.
-- ═════════════════════════════════════════════════════════════════════════
--
-- BEFORE INSERT trigger that assigns `enrichment_status = 'needs_description'`
-- to freshly-ingested rows from greenhouse / smartrecruiters / workday whose
-- description is empty at ingest time.
--
-- ─────────────────────────────────────────────────────────────────────────
-- Why a trigger, not the code payload
-- ─────────────────────────────────────────────────────────────────────────
--
-- The code path uses `.upsert(rows, { onConflict: 'source, apply_url' })`
-- which translates to `INSERT ... ON CONFLICT DO UPDATE SET <payload_cols>`.
-- The SET clause runs on both the initial INSERT (row doesn't exist) AND
-- on the CONFLICT UPDATE (row exists). The payload cannot distinguish
-- these two cases — supabase-js sends the same SQL for both.
--
-- Prior attempts:
--   - v12 first shape (commit 5bc78bb, this branch): payload wrote
--     enrichment_status='needs_description'. On INSERT this set the
--     correct value. On UPDATE (every 4h refresh) this clobbered
--     completed rows back to needs_description → 46,342-orphan
--     re-enqueue loop confirmed by Platform's 2026-08-04 sweep.
--   - v12 second shape (commit 4dc3600): SELECT-then-merge helper that
--     preserved completed status. Correct outcome but wrong shape —
--     inverted the bug rather than removing the vector. Platform's
--     preferred approach: omit enrichment_status from the payload
--     entirely, so refresh CAN'T clobber a column it doesn't SET.
--
-- Omitting enrichment_status from the payload leaves it to the column
-- default ('pending') on INSERT. This trigger runs BEFORE INSERT to
-- upgrade the default to 'needs_description' for the three sources
-- whose list endpoints don't return descriptions.
--
-- BEFORE INSERT ONLY (not BEFORE UPDATE) — a completed row that gets
-- re-INSERTed (impossible under the unique constraint on
-- (source, apply_url), so ON CONFLICT UPDATE fires instead) would
-- retrigger, but ON CONFLICT UPDATE is technically an UPDATE event, so
-- the BEFORE INSERT trigger doesn't fire. Verified: PostgreSQL fires
-- BEFORE INSERT triggers only when the row is actually inserted, and
-- fires BEFORE UPDATE triggers only when ON CONFLICT UPDATE resolves
-- to an update. No overlap.
--
-- Ashby + lever stay untouched (their list endpoints return non-empty
-- descriptions; column default 'pending' + skills-extraction phase does
-- the right thing).
--
-- ─────────────────────────────────────────────────────────────────────────
-- Definition
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ats_jobs_set_needs_description()
RETURNS TRIGGER AS $$
BEGIN
  -- Only the three sources whose list endpoints don't return descriptions.
  -- Only when description is empty (NULL or '') — respect a valid inline
  -- description if the vendor ever changes their API to include one.
  -- Only when status is the default 'pending' — respect an explicit
  -- value from the ingest code path (e.g. rare cases where the caller
  -- pre-computes a different status).
  IF NEW.source IN ('greenhouse', 'smartrecruiters', 'workday')
     AND (NEW.description IS NULL OR NEW.description = '')
     AND NEW.enrichment_status = 'pending'
  THEN
    NEW.enrichment_status := 'needs_description';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ats_jobs_set_needs_description_trg ON public.ats_jobs;

CREATE TRIGGER ats_jobs_set_needs_description_trg
  BEFORE INSERT ON public.ats_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.ats_jobs_set_needs_description();

-- ─────────────────────────────────────────────────────────────────────────
-- Post-apply verification (Platform runbook)
-- ─────────────────────────────────────────────────────────────────────────
--
-- Confirm trigger is installed:
--   SELECT tgname, tgtype FROM pg_trigger WHERE tgname = 'ats_jobs_set_needs_description_trg';
--   Expected: 1 row with tgtype flagged for BEFORE INSERT.
--
-- Verify BEFORE INSERT behavior:
--   BEGIN;
--   INSERT INTO ats_jobs (source, apply_url, company, title, description)
--     VALUES ('greenhouse', 'https://test/1', 'test', 't', '');
--   SELECT enrichment_status FROM ats_jobs WHERE apply_url = 'https://test/1';
--   -- Expected: 'needs_description'
--   ROLLBACK;
--
-- Verify BEFORE INSERT does NOT re-fire on ON CONFLICT UPDATE:
--   INSERT ... same values, then repeat the INSERT. On the second
--   INSERT the row exists → conflict → UPDATE path taken → trigger
--   doesn't fire. If the existing row is at 'complete', it stays.
