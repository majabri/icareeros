-- ─────────────────────────────────────────────────────────────────────────────
-- 20260509_job_search_quality_v1.sql — Multi-source job discovery + quality scoring
-- Source: docs/JOB-DISCOVERY-IMPLEMENTATION-SUMMARY-2026-05-05.md
-- Three tables to back the search-jobs / ingest-job-boards edge functions
-- and the future quality-analyzer. RLS-on by default; service-role writes;
-- authenticated reads only on rows the edge function attaches to user-visible jobs.
-- Already applied to prod kuneabeiwcxavvyyfjkx on 2026-05-09 via Supabase MCP
-- apply_migration. This file backports the SQL into the repo for parity.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. job_quality_scores — composite quality result attached to a job_posting.
CREATE TABLE IF NOT EXISTS public.job_quality_scores (
  job_posting_id    uuid PRIMARY KEY REFERENCES public.job_postings(id) ON DELETE CASCADE,
  quality_score     integer NOT NULL CHECK (quality_score BETWEEN 0 AND 100),
  tier1_structural  jsonb   NOT NULL DEFAULT '{}'::jsonb,
  tier2_legitimacy  jsonb   NOT NULL DEFAULT '{}'::jsonb,
  tier3_ai_analysis jsonb   NOT NULL DEFAULT '{}'::jsonb,
  confidence_level  real    NOT NULL CHECK (confidence_level BETWEEN 0 AND 1),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_quality_scores_score
  ON public.job_quality_scores (quality_score DESC);
CREATE INDEX IF NOT EXISTS idx_job_quality_scores_updated
  ON public.job_quality_scores (updated_at DESC);

ALTER TABLE public.job_quality_scores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service role manages job_quality_scores" ON public.job_quality_scores;
CREATE POLICY "service role manages job_quality_scores"
  ON public.job_quality_scores FOR ALL
  USING  (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "authenticated reads job_quality_scores" ON public.job_quality_scores;
CREATE POLICY "authenticated reads job_quality_scores"
  ON public.job_quality_scores FOR SELECT
  TO authenticated
  USING (true);

-- 2. company_validations — 30-day-cached company validation lookups.
CREATE TABLE IF NOT EXISTS public.company_validations (
  company_name      text PRIMARY KEY,
  exists            boolean NOT NULL,
  website_url       text,
  website_active    boolean,
  linkedin_url      text,
  glassdoor_url     text,
  employee_count    integer,
  founded_year      integer,
  industry          text,
  validation_source text,
  confidence        real CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
  created_at        timestamptz NOT NULL DEFAULT now(),
  expires_at        timestamptz NOT NULL DEFAULT (now() + interval '30 days')
);

CREATE INDEX IF NOT EXISTS idx_company_validations_expires
  ON public.company_validations (expires_at);

ALTER TABLE public.company_validations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service role manages company_validations" ON public.company_validations;
CREATE POLICY "service role manages company_validations"
  ON public.company_validations FOR ALL
  USING  (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "authenticated reads company_validations" ON public.company_validations;
CREATE POLICY "authenticated reads company_validations"
  ON public.company_validations FOR SELECT
  TO authenticated
  USING (true);

-- 2b. View alias for legacy callers that reference `company_validation_cache`
--     (the deployed edge fn `scrape-jobs-ats` uses both names). Keep the view
--     read-only — writes always go through public.company_validations.
CREATE OR REPLACE VIEW public.company_validation_cache AS
  SELECT * FROM public.company_validations;

-- 3. job_quality_feedback — user reports that close the model-improvement loop.
CREATE TABLE IF NOT EXISTS public.job_quality_feedback (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  job_posting_id  uuid REFERENCES public.job_postings(id) ON DELETE CASCADE,
  feedback_type   text NOT NULL CHECK (feedback_type IN ('accurate','false_positive','false_negative')),
  user_comments   text,
  original_score  integer CHECK (original_score IS NULL OR original_score BETWEEN 0 AND 100),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_quality_feedback_user
  ON public.job_quality_feedback (user_id);
CREATE INDEX IF NOT EXISTS idx_job_quality_feedback_posting
  ON public.job_quality_feedback (job_posting_id);

ALTER TABLE public.job_quality_feedback ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users insert their own feedback" ON public.job_quality_feedback;
CREATE POLICY "users insert their own feedback"
  ON public.job_quality_feedback FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "users read their own feedback" ON public.job_quality_feedback;
CREATE POLICY "users read their own feedback"
  ON public.job_quality_feedback FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "service role manages job_quality_feedback" ON public.job_quality_feedback;
CREATE POLICY "service role manages job_quality_feedback"
  ON public.job_quality_feedback FOR ALL
  USING  (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

NOTIFY pgrst, 'reload schema';
