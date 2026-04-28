-- ============================================================
-- Day 10 Group 4: Platform Utility Tables
-- ============================================================

-- platform_events: system-level analytics events
CREATE TABLE IF NOT EXISTS public.platform_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type  text NOT NULL,
  event_data  jsonb NOT NULL DEFAULT '{}',
  session_id  text,
  ip_address  text,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_events_user_id    ON public.platform_events (user_id);
CREATE INDEX IF NOT EXISTS idx_platform_events_type       ON public.platform_events (event_type);
CREATE INDEX IF NOT EXISTS idx_platform_events_created_at ON public.platform_events (created_at DESC);

ALTER TABLE public.platform_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on platform_events"
  ON public.platform_events FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Users insert their own events"
  ON public.platform_events FOR INSERT
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- skill_synonyms: normalize skill names for consistent matching
CREATE TABLE IF NOT EXISTS public.skill_synonyms (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical     text NOT NULL,
  synonym       text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (canonical, synonym)
);

CREATE INDEX IF NOT EXISTS idx_skill_synonyms_canonical ON public.skill_synonyms (canonical);
CREATE INDEX IF NOT EXISTS idx_skill_synonyms_synonym   ON public.skill_synonyms (synonym);

ALTER TABLE public.skill_synonyms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read on skill_synonyms"
  ON public.skill_synonyms FOR SELECT
  USING (true);

CREATE POLICY "Service role manages skill_synonyms"
  ON public.skill_synonyms FOR ALL
  USING (auth.role() = 'service_role');

-- recovery_rules: AI recovery / retry configuration
CREATE TABLE IF NOT EXISTS public.recovery_rules (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_name     text NOT NULL UNIQUE,
  trigger_event text NOT NULL,
  action        text NOT NULL,
  config        jsonb NOT NULL DEFAULT '{}',
  is_active     boolean NOT NULL DEFAULT true,
  priority      integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.recovery_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages recovery_rules"
  ON public.recovery_rules FOR ALL
  USING (auth.role() = 'service_role');

-- ratings: user ratings of opportunities and services
CREATE TABLE IF NOT EXISTS public.ratings (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_type  text NOT NULL CHECK (target_type IN ('opportunity','gig','service','agent')),
  target_id    uuid NOT NULL,
  score        integer NOT NULL CHECK (score BETWEEN 1 AND 5),
  review       text,
  metadata     jsonb NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, target_type, target_id)
);

CREATE INDEX IF NOT EXISTS idx_ratings_user_id ON public.ratings (user_id);
CREATE INDEX IF NOT EXISTS idx_ratings_target  ON public.ratings (target_type, target_id);

ALTER TABLE public.ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own ratings"
  ON public.ratings FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Public read on ratings"
  ON public.ratings FOR SELECT
  USING (true);

-- domain_extraction_hints: parser hints for extracting domains from job descriptions
CREATE TABLE IF NOT EXISTS public.domain_extraction_hints (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain       text NOT NULL,
  hint_pattern text NOT NULL,
  hint_type    text NOT NULL DEFAULT 'keyword'
               CHECK (hint_type IN ('keyword','regex','company','url_pattern')),
  weight       numeric NOT NULL DEFAULT 1.0,
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (domain, hint_pattern)
);

CREATE INDEX IF NOT EXISTS idx_domain_hints_domain ON public.domain_extraction_hints (domain);
CREATE INDEX IF NOT EXISTS idx_domain_hints_active ON public.domain_extraction_hints (is_active);

ALTER TABLE public.domain_extraction_hints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read on domain_extraction_hints"
  ON public.domain_extraction_hints FOR SELECT
  USING (true);

CREATE POLICY "Service role manages domain_extraction_hints"
  ON public.domain_extraction_hints FOR ALL
  USING (auth.role() = 'service_role');
