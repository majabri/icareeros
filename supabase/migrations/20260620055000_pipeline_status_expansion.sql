-- PENDING: not yet applied to prod Supabase (kuneabeiwcxavvyyfjkx).
-- Apply via Supabase MCP `apply_migration` after PR merges to main.
--
-- Brief Task 14 — pipeline status expansion.
-- Adds 3 new statuses to the job_applications.status CHECK constraint:
--   screening, final_round, accepted
-- ("researching" already existed in the constraint; only the UI didn't expose it
-- as a step on the funnel until now.)
--
-- Approach: drop the existing CHECK and re-add a widened one. The column type
-- is text, not a Postgres enum, so this is a pure constraint swap; no enum
-- migration is required.

ALTER TABLE public.job_applications
  DROP CONSTRAINT IF EXISTS job_applications_status_check;

ALTER TABLE public.job_applications
  ADD CONSTRAINT job_applications_status_check
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
