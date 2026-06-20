-- PENDING: not yet applied to prod Supabase (kuneabeiwcxavvyyfjkx).
-- Apply via Supabase MCP `apply_migration` after PR merges to main.
--
-- Brief B3 Task 14 — pipeline status expansion.
-- Adds 3 new statuses to the applications.status CHECK constraint:
--   screening, final_round, accepted
-- ("researching" already existed in the constraint; only the UI didn't expose it
-- as a step on the funnel until now.)
--
-- Approach: drop the existing CHECK and re-add a widened one. The column type
-- is text, not a Postgres enum, so this is a pure constraint swap; no enum
-- migration is required.
--
-- Table name correction (chore/jobs-migration-cleanup): the canonical table in
-- prod is `public.applications`. An earlier draft of this file targeted
-- `public.job_applications`, which is the stale name in src/types/database.ts.
-- All app-code queries use .from("applications"); the migration follows suit.

ALTER TABLE public.applications
  DROP CONSTRAINT IF EXISTS applications_status_check;

ALTER TABLE public.applications
  ADD CONSTRAINT applications_status_check
  CHECK (
    status IN (
      'researching',
      'applying',
      'applied',
      'screening',
      'interviewing',
      'final_round',
      'offer',
      'accepted',
      'rejected',
      'withdrawn'
    )
  );
