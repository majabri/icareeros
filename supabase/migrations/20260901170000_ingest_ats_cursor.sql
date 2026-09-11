-- ─────────────────────────────────────────────────────────────────────────────
-- #425 (P0) — ingest-ats-direct chained continuation.
--
-- `ingest-ats-direct` fanned all 5 ATS sources out via a single top-level
-- `Promise.allSettled` and NEVER completed a single invocation in prod —
-- every run hit the 150s edge-function wall-clock limit and was killed
-- (504). Everything after the fan-out (the 48h stale-job deactivation
-- sweep, the priority-lane enrich-jobs chain-kick, the rolled-up
-- inserted/errors counts) never ran. 95% of the corpus was falsely
-- marked active as a result.
--
-- Fix: adopt the bounded-slice + self-chain pattern `enrich-jobs` already
-- uses (see MAX_CHAIN_DEPTH in supabase/functions/enrich-jobs/index.ts).
-- Each invocation processes sources in order (greenhouse -> lever ->
-- ashby -> workday -> smartrecruiters) until a time budget is exhausted,
-- persists progress here, and self-chains. The stale-job sweep + the
-- enrich-jobs kick only run once a full cycle (all 5 sources) completes.
--
-- Singleton row (id = 1) — a single global ingest cycle runs at a time.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ingest_ats_cursor (
  id              smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  source_index    int NOT NULL DEFAULT 0,   -- index into the ordered source list
  item_index      int NOT NULL DEFAULT 0,   -- index into the current source's company/tenant list
  chain_depth     int NOT NULL DEFAULT 0,   -- self-invoke depth for the in-progress cycle
  detail          jsonb NOT NULL DEFAULT '{}'::jsonb, -- cumulative { source: { upserted, errors: [] } } for the in-progress cycle
  run_started_at  timestamptz,              -- set when a fresh cycle begins, cleared on completion
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ingest_ats_cursor ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service role manages ingest_ats_cursor"
  ON public.ingest_ats_cursor;
CREATE POLICY "service role manages ingest_ats_cursor"
  ON public.ingest_ats_cursor FOR ALL
  TO service_role
  USING  (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "admins read ingest_ats_cursor"
  ON public.ingest_ats_cursor;
CREATE POLICY "admins read ingest_ats_cursor"
  ON public.ingest_ats_cursor FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.user_id = auth.uid() AND profiles.role = 'admin'
    )
  );

NOTIFY pgrst, 'reload schema';
