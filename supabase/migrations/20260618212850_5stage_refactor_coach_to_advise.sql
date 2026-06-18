-- PENDING: requires Platform Chat review before applying to production.
--
-- 2026-06-18 — 5-stage Career OS refactor (PR #feat/jobs-5stage-refactor).
--
-- Migrates existing career-OS data to match the application's new 5-stage
-- type union: evaluate, advise, learn, act, achieve (coach removed).
--
-- Scope (intentionally narrow):
--
--   1. career_os_cycles.current_stage = 'coach' → 'advise'
--      Coach is now a sub-feature of Advise; cycles that were sitting on
--      "Coach" should resume on Advise.
--
--   2. career_os_stages: we intentionally DO NOT migrate stage='coach' rows
--      in this script. The /coach page (and the /api/career-os/coach-brief
--      and /api/career-os/coach-session endpoints) still write to
--      career_os_stages with stage='coach' as their storage convention.
--      Forcing that data into stage='advise' here would collide with
--      Advise's own AI output notes shape and break briefing reads.
--
--      The brief's draft includes a second UPDATE for career_os_stages —
--      it has been deliberately omitted from this migration. Re-introduce
--      it ONLY after coach-brief + coach-session API routes are migrated
--      to read/write from stage='advise' with a nested key
--      (e.g. notes.coachBrief). That work is a follow-up coordination
--      with Platform Chat at the time the API routes are restructured.
--
-- Apply only AFTER:
--   - PR feat/jobs-5stage-refactor merges to main
--   - Vercel rolls the new UI/types to production
--   - Platform Chat signs off on the cycle-status flip
--
-- This file is RECORD-ONLY at PR time. The migration runner (Supabase CLI
-- or wherever Platform Chat applies migrations) is what runs it later.

BEGIN;

UPDATE public.career_os_cycles
   SET current_stage = 'advise'
 WHERE current_stage = 'coach';

COMMIT;
