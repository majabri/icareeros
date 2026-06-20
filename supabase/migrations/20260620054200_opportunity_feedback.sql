-- PENDING: not yet applied to prod Supabase (kuneabeiwcxavvyyfjkx).
-- Apply via Supabase MCP `apply_migration` after PR merges to main.
--
-- Brief Task 10 — opportunity_feedback table.
--
-- Tracks per-user, per-opportunity action signals so the aggregator can
-- boost/penalize fit_score for similar postings on the next search:
--   saved | applied | tracked  -> signal = "positive"  (+10 to fit)
--   dismissed | hidden         -> signal = "negative"  (-15 to fit)

CREATE TABLE IF NOT EXISTS public.opportunity_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_url text,
  company text,
  source text,
  action text NOT NULL,
  signal text NOT NULL CHECK (signal IN ('positive','negative')),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS opportunity_feedback_user_created_idx
  ON public.opportunity_feedback (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS opportunity_feedback_user_company_idx
  ON public.opportunity_feedback (user_id, lower(company));

CREATE INDEX IF NOT EXISTS opportunity_feedback_user_url_idx
  ON public.opportunity_feedback (user_id, lower(job_url));

ALTER TABLE public.opportunity_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "opportunity_feedback_select_own" ON public.opportunity_feedback;
CREATE POLICY "opportunity_feedback_select_own"
  ON public.opportunity_feedback
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "opportunity_feedback_insert_own" ON public.opportunity_feedback;
CREATE POLICY "opportunity_feedback_insert_own"
  ON public.opportunity_feedback
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "opportunity_feedback_delete_own" ON public.opportunity_feedback;
CREATE POLICY "opportunity_feedback_delete_own"
  ON public.opportunity_feedback
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
