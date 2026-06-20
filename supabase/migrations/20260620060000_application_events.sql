-- PENDING: not yet applied to prod Supabase (kuneabeiwcxavvyyfjkx).
-- Apply via Supabase MCP `apply_migration` after PR merges to main.
--
-- Application audit log.
-- FK target: public.applications (verified against production 2026-06-19,
-- confirmed by chore/jobs-migration-cleanup audit — every app-code query
-- uses .from("applications")).

CREATE TABLE IF NOT EXISTS public.application_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  application_id UUID REFERENCES public.applications(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS application_events_user_idx
  ON public.application_events(user_id);

CREATE INDEX IF NOT EXISTS application_events_application_idx
  ON public.application_events(application_id);

ALTER TABLE public.application_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'application_events'
      AND policyname = 'Users manage own events'
  ) THEN
    CREATE POLICY "Users manage own events"
      ON public.application_events
      FOR ALL
      USING (auth.uid() = user_id);
  END IF;
END $$;
