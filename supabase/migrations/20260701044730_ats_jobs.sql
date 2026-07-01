-- PENDING: requires Platform Chat review before applying to production.
-- feat/jobs-ats-aggregation Phase 2B — centralised ATS aggregation table.
--
-- Backing store for the ingest-ats-direct edge function. Every ~4h that
-- function fans out across the curated company list on 9 ATS platforms and
-- upserts every open posting here. Search queries then hit this table
-- (via /api/jobs/search-db) instead of doing live fan-out on every request.

CREATE TABLE IF NOT EXISTS public.ats_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,
  external_id TEXT,
  company TEXT NOT NULL,
  title TEXT NOT NULL,
  location TEXT,
  description TEXT,
  apply_url TEXT NOT NULL,
  salary_min INTEGER,
  salary_max INTEGER,
  salary_currency TEXT DEFAULT 'USD',
  department TEXT,
  employment_type TEXT,
  remote BOOLEAN DEFAULT false,
  posted_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ DEFAULT now(),
  is_active BOOLEAN DEFAULT true,
  raw JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(source, apply_url)
);

CREATE INDEX IF NOT EXISTS ats_jobs_company_idx ON public.ats_jobs(company);
CREATE INDEX IF NOT EXISTS ats_jobs_title_idx
  ON public.ats_jobs USING gin(to_tsvector('english', title));
CREATE INDEX IF NOT EXISTS ats_jobs_active_idx
  ON public.ats_jobs(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS ats_jobs_source_idx ON public.ats_jobs(source);
CREATE INDEX IF NOT EXISTS ats_jobs_posted_at_idx ON public.ats_jobs(posted_at DESC);
