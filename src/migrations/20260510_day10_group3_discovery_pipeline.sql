-- ============================================================
-- Day 10 Group 3: Discovery Pipeline Tables
-- ============================================================

-- raw_jobs: raw scraped job data before normalization
CREATE TABLE IF NOT EXISTS public.raw_jobs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source        text NOT NULL,
  source_id     text,
  raw_data      jsonb NOT NULL DEFAULT '{}',
  url           text,
  scraped_at    timestamptz NOT NULL DEFAULT now(),
  processed     boolean NOT NULL DEFAULT false,
  processed_at  timestamptz,
  error         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS raw_jobs_source_source_id_uidx
  ON public.raw_jobs (source, source_id)
  WHERE source_id IS NOT NULL;

ALTER TABLE public.raw_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on raw_jobs"
  ON public.raw_jobs FOR ALL
  USING (auth.role() = 'service_role');

-- discovery_jobs: normalized discovery results ready for matching
CREATE TABLE IF NOT EXISTS public.discovery_jobs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_job_id      uuid REFERENCES public.raw_jobs(id) ON DELETE SET NULL,
  opportunity_id  uuid REFERENCES public.opportunities(id) ON DELETE SET NULL,
  title           text NOT NULL,
  company         text NOT NULL,
  location        text,
  url             text NOT NULL,
  source          text NOT NULL,
  source_id       text,
  description     text,
  job_type        text,
  is_remote       boolean DEFAULT false,
  salary_min      numeric,
  salary_max      numeric,
  posted_at       timestamptz,
  quality_score   numeric DEFAULT 0,
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','accepted','rejected','duplicate')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_discovery_jobs_status   ON public.discovery_jobs (status);
CREATE INDEX IF NOT EXISTS idx_discovery_jobs_source   ON public.discovery_jobs (source);
CREATE INDEX IF NOT EXISTS idx_discovery_jobs_created  ON public.discovery_jobs (created_at DESC);

ALTER TABLE public.discovery_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on discovery_jobs"
  ON public.discovery_jobs FOR ALL
  USING (auth.role() = 'service_role');

-- discovery_company_sources: maps companies to their source configs
CREATE TABLE IF NOT EXISTS public.discovery_company_sources (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company     text NOT NULL,
  source      text NOT NULL,
  source_url  text,
  is_active   boolean NOT NULL DEFAULT true,
  priority    integer NOT NULL DEFAULT 0,
  last_scraped_at timestamptz,
  metadata    jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company, source)
);

CREATE INDEX IF NOT EXISTS idx_disc_company_sources_company ON public.discovery_company_sources (company);
CREATE INDEX IF NOT EXISTS idx_disc_company_sources_active  ON public.discovery_company_sources (is_active);

ALTER TABLE public.discovery_company_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on discovery_company_sources"
  ON public.discovery_company_sources FOR ALL
  USING (auth.role() = 'service_role');

-- job_source_config: configuration for each job scraper/source
CREATE TABLE IF NOT EXISTS public.job_source_config (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_name     text NOT NULL UNIQUE,
  is_active       boolean NOT NULL DEFAULT true,
  fetch_interval_minutes integer NOT NULL DEFAULT 60,
  base_url        text,
  config          jsonb NOT NULL DEFAULT '{}',
  rate_limit_rpm  integer NOT NULL DEFAULT 30,
  last_run_at     timestamptz,
  last_run_status text,
  error_count     integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.job_source_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on job_source_config"
  ON public.job_source_config FOR ALL
  USING (auth.role() = 'service_role');

-- query_cache: caches job search query results
CREATE TABLE IF NOT EXISTS public.query_cache (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key    text NOT NULL UNIQUE,
  query_hash   text NOT NULL,
  result       jsonb NOT NULL DEFAULT '{}',
  hit_count    integer NOT NULL DEFAULT 0,
  expires_at   timestamptz NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_query_cache_expires ON public.query_cache (expires_at);
CREATE INDEX IF NOT EXISTS idx_query_cache_key     ON public.query_cache (cache_key);

ALTER TABLE public.query_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on query_cache"
  ON public.query_cache FOR ALL
  USING (auth.role() = 'service_role');

-- user_job_agents: user-configured automated job search agents
CREATE TABLE IF NOT EXISTS public.user_job_agents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name            text NOT NULL,
  is_active       boolean NOT NULL DEFAULT true,
  search_criteria jsonb NOT NULL DEFAULT '{}',
  schedule        text NOT NULL DEFAULT 'daily',
  last_run_at     timestamptz,
  next_run_at     timestamptz,
  run_count       integer NOT NULL DEFAULT 0,
  jobs_found      integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_job_agents_user_id ON public.user_job_agents (user_id);
CREATE INDEX IF NOT EXISTS idx_user_job_agents_active  ON public.user_job_agents (is_active);

ALTER TABLE public.user_job_agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own agents"
  ON public.user_job_agents FOR ALL
  USING (auth.uid() = user_id);

-- user_salary_snapshots: historical salary data per user
CREATE TABLE IF NOT EXISTS public.user_salary_snapshots (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_title      text NOT NULL,
  location        text,
  years_exp       numeric,
  current_salary  numeric,
  market_p25      numeric,
  market_p50      numeric,
  market_p75      numeric,
  market_p90      numeric,
  currency        text NOT NULL DEFAULT 'USD',
  source          text NOT NULL DEFAULT 'ai_estimate',
  snapshot_date   date NOT NULL DEFAULT CURRENT_DATE,
  metadata        jsonb NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_salary_snapshots_user_id ON public.user_salary_snapshots (user_id);
CREATE INDEX IF NOT EXISTS idx_salary_snapshots_date    ON public.user_salary_snapshots (snapshot_date DESC);

ALTER TABLE public.user_salary_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see their own salary snapshots"
  ON public.user_salary_snapshots FOR ALL
  USING (auth.uid() = user_id);

-- ============================================================
-- Performance indexes on existing tables
-- NOTE: opportunities uses first_seen_at (not created_at)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_applications_user_id        ON public.applications (user_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_first_seen_at ON public.opportunities (first_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_opportunities_company       ON public.opportunities (company);
CREATE INDEX IF NOT EXISTS idx_agent_runs_user_id          ON public.agent_runs (user_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_status           ON public.agent_runs (status);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id       ON public.notifications (user_id);
