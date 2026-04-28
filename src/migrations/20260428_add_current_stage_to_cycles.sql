-- Add current_stage column to career_os_cycles
-- The orchestrator uses this to know which stage is active in the cycle.
-- advanceStage() updates this after each stage completes.

ALTER TABLE public.career_os_cycles
  ADD COLUMN IF NOT EXISTS current_stage text NOT NULL DEFAULT 'evaluate';

COMMENT ON COLUMN public.career_os_cycles.current_stage IS
  'The stage currently being worked on. One of: evaluate, advise, learn, act, coach, achieve.';
