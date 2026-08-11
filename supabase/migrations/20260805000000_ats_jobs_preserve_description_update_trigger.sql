-- ═════════════════════════════════════════════════════════════════════════
-- Applied to prod (kuneabeiwcxavvyyfjkx) via Supabase mgmt API on
-- 2026-08-05 by Platform Cowork. PR to route this file into git is
-- pending (Amir routes).
-- ═════════════════════════════════════════════════════════════════════════
--
-- BEFORE UPDATE trigger that refuses to blank a filled description.
--
-- ─────────────────────────────────────────────────────────────────────────
-- Why this trigger exists
-- ─────────────────────────────────────────────────────────────────────────
--
-- PR #406 removed `enrichment_status` from the GH/SR/WD ingest payload
-- (via 20260804163000_ats_jobs_needs_description_insert_trigger.sql),
-- closing the orphan-factory vector where refresh ticks reset completed
-- rows back to needs_description.
--
-- However the same ingest payload still writes `description` on the
-- ON CONFLICT UPDATE SET clause:
--   - Workday: description="" (hard-coded — the CXS list endpoint
--     returns no description)
--   - Greenhouse: description=stripHtml(j.content ?? "") — the
--     /boards/{org}/jobs list endpoint typically omits `content`, so
--     this evaluates to "" too. The per-posting endpoint has the content.
--   - SmartRecruiters: description=stripHtml(p.jobAd?.sections?
--     .jobDescription?.text ?? "") — `?embed=jobAd` populates this,
--     so SR is normally OK.
--
-- With `enrichment_status` now sticky at 'complete' post-#406, the
-- description clobber becomes a silent bug: complete workday rows
-- would lose their fetched descriptions on every 4h refresh tick,
-- and enrich-jobs (which filters `enrichment_status IN ('pending',
-- 'needs_description')`) would never re-enrich them.
--
-- This trigger closes the vector at the database layer without
-- requiring a code change to the ingest function. It only fires when
-- the payload tries to write NULL / '' description over an existing
-- non-empty description; genuine description updates (non-empty →
-- different non-empty) pass through untouched.
--
-- ─────────────────────────────────────────────────────────────────────────
-- Definition
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ats_jobs_preserve_description()
RETURNS TRIGGER AS $$
BEGIN
  -- Only guard against blanking: NEW is empty AND OLD had content.
  -- Real updates (both non-empty, even if different) pass through.
  -- Row inserts don't fire this trigger (BEFORE UPDATE only).
  IF (NEW.description IS NULL OR NEW.description = '')
     AND OLD.description IS NOT NULL AND OLD.description <> ''
  THEN
    NEW.description := OLD.description;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ats_jobs_preserve_description_trg ON public.ats_jobs;

CREATE TRIGGER ats_jobs_preserve_description_trg
  BEFORE UPDATE ON public.ats_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.ats_jobs_preserve_description();

-- ─────────────────────────────────────────────────────────────────────────
-- Post-apply verification (Platform runbook — all 3 passed 2026-08-05)
-- ─────────────────────────────────────────────────────────────────────────
--
-- (a) trigger installed BEFORE UPDATE:
--   SELECT tgname, tgtype FROM pg_trigger WHERE tgname = 'ats_jobs_preserve_description_trg';
--   Expected: tgtype=19 (ROW|BEFORE|UPDATE), tgenabled='O'.
--
-- (b) empty payload preserves existing description:
--   BEGIN;
--   INSERT INTO ats_jobs (source, apply_url, company, title, description, enrichment_status)
--     VALUES ('workday', 'https://test/1', 'test', 't', 'real content', 'complete');
--   INSERT INTO ats_jobs (source, apply_url, company, title, description)
--     VALUES ('workday', 'https://test/1', 'test', 't', '')
--     ON CONFLICT (source, apply_url) DO UPDATE
--       SET company = EXCLUDED.company, title = EXCLUDED.title,
--           description = EXCLUDED.description;
--   SELECT description FROM ats_jobs WHERE apply_url = 'https://test/1';
--   -- Expected: 'real content' (preserved).
--   ROLLBACK;
--
-- (c) genuine description update still writes normally:
--   BEGIN;
--   INSERT INTO ats_jobs (source, apply_url, company, title, description, enrichment_status)
--     VALUES ('workday', 'https://test/2', 'test', 't', 'original', 'complete');
--   INSERT INTO ats_jobs (source, apply_url, company, title, description)
--     VALUES ('workday', 'https://test/2', 'test', 't', 'updated real content')
--     ON CONFLICT (source, apply_url) DO UPDATE SET description = EXCLUDED.description;
--   SELECT description FROM ats_jobs WHERE apply_url = 'https://test/2';
--   -- Expected: 'updated real content' (written).
--   ROLLBACK;
