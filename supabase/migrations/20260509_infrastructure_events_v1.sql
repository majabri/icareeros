-- ─────────────────────────────────────────────────────────────────────────────
-- ADR-005 (defaults) Phase 1 — Infrastructure event log.
-- Renamed from the brief's `platform_events` to `infrastructure_events` to
-- avoid colliding with the existing `public.platform_events` user-analytics
-- table (0 rows, but still). The webhook receivers + cron probes write here.
-- See docs/AGENT_HANDOFF_20260509a.md §2.3.
-- Already applied to prod kuneabeiwcxavvyyfjkx on 2026-05-09 via Supabase MCP
-- apply_migration. This file backports the SQL into the repo for parity.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.infrastructure_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source        text NOT NULL,
  event_type    text NOT NULL,
  severity      text NOT NULL DEFAULT 'info'
    CHECK (severity IN ('info','warning','error','critical')),
  payload       jsonb,
  resolved_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_infrastructure_events_source_created
  ON public.infrastructure_events (source, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_infrastructure_events_severity_resolved
  ON public.infrastructure_events (severity, resolved_at);

ALTER TABLE public.infrastructure_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service role manages infrastructure_events"
  ON public.infrastructure_events;
CREATE POLICY "service role manages infrastructure_events"
  ON public.infrastructure_events FOR ALL
  TO service_role
  USING  (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "admins read infrastructure_events"
  ON public.infrastructure_events;
CREATE POLICY "admins read infrastructure_events"
  ON public.infrastructure_events FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.user_id = auth.uid() AND profiles.role = 'admin'
    )
  );

NOTIFY pgrst, 'reload schema';
