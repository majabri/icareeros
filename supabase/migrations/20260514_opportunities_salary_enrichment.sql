-- 2026-05-14 — Salary enrichment columns for /api/cron/enrich-salaries
--
-- 1,043 of 1,296 opportunities currently have NULL salary because the
-- ATS / WWR / Remotive sources don't expose pay data in their payloads.
-- Adzuna's salary-histogram endpoint can give us a useful p25-p75 range
-- per (title, location) pair. The cron processes a batch nightly and
-- writes the inferred range here.
--
-- Two columns + a partial index to make "find the next batch to enrich"
-- a fast indexed lookup.

ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS last_salary_enrichment_at timestamptz,
  ADD COLUMN IF NOT EXISTS salary_source             text;

-- Partial index for the cron's selection query:
--   "rows where we still need to try enrichment, oldest first"
-- Once last_salary_enrichment_at is set the row drops out of the index, so
-- it scales to millions of opportunities without bloating.
CREATE INDEX IF NOT EXISTS opportunities_salary_enrichment_pending_idx
  ON public.opportunities (first_seen_at DESC NULLS LAST)
  WHERE last_salary_enrichment_at IS NULL
    AND salary_min IS NULL
    AND salary_max IS NULL;

-- Comment for future maintainers + admins reading via /admin/opportunities
COMMENT ON COLUMN public.opportunities.last_salary_enrichment_at IS
  'Timestamp of the most recent /api/cron/enrich-salaries attempt. Set even on enrichment-failed rows so we do not retry endlessly. Use salary_source to distinguish hits vs misses.';

COMMENT ON COLUMN public.opportunities.salary_source IS
  'Where the salary_min/salary_max came from. Examples: adzuna_native, adzuna_histogram, manual, enrichment_failed.';
