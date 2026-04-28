-- Day 5: Career OS Core Tables
-- career_os_cycles, career_os_stages, career_goals, milestones
-- cycle_id FK added to analysis_history and agent_runs
-- See DATA_MAPPING.md for full schema rationale

CREATE TABLE public.career_os_cycles (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cycle_number INT NOT NULL DEFAULT 1,
  goal         TEXT,
  status       TEXT NOT NULL DEFAULT 'active'
               CHECK (status IN ('active','completed','abandoned')),
  started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.career_os_cycles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own cycles" ON public.career_os_cycles FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.career_os_stages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id   UUID NOT NULL REFERENCES public.career_os_cycles(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stage      TEXT NOT NULL CHECK (stage IN ('evaluate','advise','learn','act','coach','achieve')),
  status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed','skipped')),
  started_at TIMESTAMPTZ,
  ended_at   TIMESTAMPTZ,
  notes      JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.career_os_stages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own stages" ON public.career_os_stages FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.career_goals (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cycle_id    UUID REFERENCES public.career_os_cycles(id) ON DELETE SET NULL,
  title       TEXT NOT NULL DEFAULT '',
  description TEXT,
  category    TEXT NOT NULL DEFAULT 'general' CHECK (category IN ('role','skill','salary','network','certification','other','general')),
  priority    INT NOT NULL DEFAULT 2 CHECK (priority BETWEEN 1 AND 3),
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','achieved','deferred','dropped')),
  target_date TIMESTAMPTZ,
  achieved_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.career_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own goals" ON public.career_goals FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.milestones (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cycle_id    UUID REFERENCES public.career_os_cycles(id) ON DELETE SET NULL,
  title       TEXT NOT NULL DEFAULT '',
  description TEXT,
  achieved_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.milestones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own milestones" ON public.milestones FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.analysis_history ADD COLUMN IF NOT EXISTS cycle_id UUID REFERENCES public.career_os_cycles(id) ON DELETE SET NULL;
ALTER TABLE public.agent_runs ADD COLUMN IF NOT EXISTS cycle_id UUID REFERENCES public.career_os_cycles(id) ON DELETE SET NULL;
