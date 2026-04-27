# Week 2 Checklist — PostgreSQL Schema & Orchestrator Foundation
**Branch:** week-2-postgres-setup
**Target dates:** May 4–8, 2026
**Estimated effort:** 14 hours

---

## Day 4 (May 4, 2h) — Supabase Staging Project Setup

- [ ] Create new Supabase project: `icareeros-staging`
- [ ] Record project ref in `.env.example` and GitHub Secrets
- [ ] Apply the 20 foundation migrations from `src/migrations/`
  ```bash
  supabase db push --db-url $STAGING_DB_URL
  ```
- [ ] Verify all tables created, RLS enabled on every user-facing table
- [ ] Run `supabase gen types typescript` → `src/types/database.ts`
- [ ] Commit: `"Week 2 Day 4: Staging Supabase schema applied"`

## Day 5 (May 5, 2h) — Career OS Core Tables

- [ ] Write migration: `career_os_cycles` table (see DATA_MAPPING.md)
- [ ] Write migration: `career_os_stages` table (6 stages: evaluate→achieve)
- [ ] Write migration: `career_goals` table (user goals per cycle)
- [ ] Add `cycle_id` FK column to: `analysis_history`, `agent_runs`, `milestones`
- [ ] Write RLS policies for all 3 new tables
- [ ] Apply to staging, verify with test insert
- [ ] Commit: `"Week 2 Day 5: Career OS cycle/stage schema"`

## Day 6 (May 6, 2h) — Opportunity Table Renames

- [ ] Write migration: rename `jobs` → `opportunities`
- [ ] Write migration: rename `user_job_matches` → `user_opportunity_matches`
- [ ] Write migration: rename `job_applications` → `applications` + add `cycle_id`
- [ ] Write migration: rename `job_interactions` → `opportunity_interactions`
- [ ] Write migration: rename `job_scores` → `opportunity_scores`
- [ ] Write migration: rename `ignored_jobs` → `ignored_opportunities`
- [ ] Update FK constraints in all dependent tables
- [ ] Apply to staging, verify no broken FK refs
- [ ] Commit: `"Week 2 Day 6: Rename job tables to opportunity tables"`

## Day 7 (May 7, 2h) — Orchestrator Service Skeleton

- [ ] Create `src/orchestrator/` directory
- [ ] Scaffold `src/orchestrator/careerOsOrchestrator.ts`:
  - `startCycle(userId)` — creates a new career_os_cycles row
  - `advanceStage(cycleId, stage)` — updates career_os_stages
  - `completeCycle(cycleId)` — marks cycle as completed
- [ ] Scaffold `src/orchestrator/stageRouter.ts`:
  - Routes each stage to the appropriate service
- [ ] Scaffold `src/orchestrator/eventLogger.ts`:
  - Writes to `platform_events` on every stage transition
- [ ] Add unit test stubs in `src/orchestrator/__tests__/`
- [ ] Commit: `"Week 2 Day 7: Orchestrator service skeleton"`

## Day 8 (May 8, 2h) — 3 AI Function Stubs (Evaluate, Advise, Act)

- [ ] `src/services/ai/evaluateService.ts`
  - `evaluateCareerProfile(userId)` → calls `extract-profile-fields` edge fn
  - Returns: skills[], gaps[], marketFit score
- [ ] `src/services/ai/adviseService.ts`
  - `generateAdvice(userId, evaluationResult)` → calls `career-path-analysis` edge fn
  - Returns: recommendedPaths[], nextActions[]
- [ ] `src/services/ai/actService.ts`
  - `triggerAction(userId, action)` → calls `run-job-agent` edge fn
  - Returns: jobsFound, applicationsQueued
- [ ] Export all 3 from `src/services/ai/index.ts`
- [ ] Commit to branch: `"Week 2 Day 8: AI function stubs (Evaluate/Advise/Act)"`

## Day 9 (May 9, 2h) — Event Logging Schema & PR Polish

- [ ] Write migration: extend `platform_events` with `career_os_stage` column
- [ ] Write migration: create `career_os_event_log` view (joins cycles + stages + events)
- [ ] Update `src/orchestrator/eventLogger.ts` to use new schema
- [ ] Finalize PR description with:
  - Schema diagram link (or ASCII art)
  - List of all migrations applied
  - Testing instructions for reviewer
  - Checklist of breaking changes (none expected)
- [ ] Self-review: read all changed files, fix any TODOs left over
- [ ] Request Amir review on PR — do NOT merge without approval

---

## Deliverables by end of Week 2

- [ ] Staging Supabase project live with complete schema
- [ ] Career OS tables: `career_os_cycles`, `career_os_stages`, `career_goals`
- [ ] Opportunity table renames complete (no more `jobs` table)
- [ ] Orchestrator skeleton: `startCycle`, `advanceStage`, `completeCycle`
- [ ] 3 AI stubs: Evaluate, Advise, Act
- [ ] Event logging wired to stage transitions
- [ ] PR reviewed and approved by Amir

---

## Definition of Done

- All migrations applied to staging with no errors
- TypeScript compiles with `npm run type-check` — 0 errors
- `npm run lint` — 0 errors
- PR approved by Amir before merge to main
