-- Day 6: Rename job tables to opportunity tables
-- scraped_jobs → opportunities
-- job_applications → applications (+ cycle_id, opportunity_id)
-- learning_events.job_id → opportunity_id
-- New: user_opportunity_matches, opportunity_interactions, ignored_opportunities
ALTER TABLE public.scraped_jobs RENAME TO opportunities;
ALTER TABLE public.job_applications RENAME TO applications;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS cycle_id UUID REFERENCES public.career_os_cycles(id) ON DELETE SET NULL;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS opportunity_id UUID REFERENCES public.opportunities(id) ON DELETE SET NULL;
ALTER TABLE public.learning_events RENAME COLUMN job_id TO opportunity_id;

CREATE TABLE public.user_opportunity_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  opportunity_id UUID NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  cycle_id UUID REFERENCES public.career_os_cycles(id) ON DELETE SET NULL,
  fit_score NUMERIC, matched_skills TEXT[] DEFAULT '{}', skill_gaps TEXT[] DEFAULT '{}',
  strengths TEXT[] DEFAULT '{}', red_flags TEXT[] DEFAULT '{}', match_summary TEXT,
  effort_level TEXT CHECK (effort_level IN ('easy','moderate','hard')), response_prob NUMERIC,
  smart_tag TEXT, career_os_stage TEXT CHECK (career_os_stage IN ('evaluate','advise','learn','act','coach','achieve')),
  is_saved BOOLEAN NOT NULL DEFAULT false, is_applied BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, opportunity_id)
);
ALTER TABLE public.user_opportunity_matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own matches" ON public.user_opportunity_matches FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Service role can manage matches" ON public.user_opportunity_matches FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.opportunity_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  opportunity_id UUID NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('save','apply','dismiss','view','share')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.opportunity_interactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own interactions" ON public.opportunity_interactions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.ignored_opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  opportunity_id UUID NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  reason TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(user_id, opportunity_id)
);
ALTER TABLE public.ignored_opportunities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own ignored opportunities" ON public.ignored_opportunities FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
