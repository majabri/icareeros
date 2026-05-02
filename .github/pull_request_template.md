<!--
Per ADR 0002: every non-trivial change goes through a PR with this template.
Doc-only PRs can short-circuit by deleting all but the title and a one-line summary.
-->

## What

<!-- One-paragraph summary. What does this PR change and why? -->

## Type

- [ ] `feat` — new user-visible capability
- [ ] `fix` — bug fix
- [ ] `chore` — refactor / dependency / internal cleanup
- [ ] `hotfix` — P0 production fix (note: see ADR 0002 §7 for hotfix exception rules)
- [ ] `docs` — documentation only

## Risk

- [ ] Touches `supabase/migrations/` (DB schema change — irreversible without rollback migration)
- [ ] Touches `src/middleware.ts` (auth or routing — affects every request)
- [ ] Touches `next.config.js` or `vercel.json` (deploy config)
- [ ] Touches secrets handling (env vars, `.env.example`)
- [ ] None of the above (low-risk feature/fix)

## Manual test

<!-- What did you verify locally or in preview? Be specific.
     "Logged in as majabri714@gmail.com on Vercel preview, confirmed Y."
     Empty is OK if the change is trivial; say so explicitly. -->

## Checklist

- [ ] CI passing (test-secrets + Playwright E2E)
- [ ] `npx tsc --noEmit` clean
- [ ] If schema change: rollback migration written or marked unnecessary in PR description
- [ ] If new env var: added to `.env.example` with placeholder value + comment
- [ ] If new edge function: deployed to Supabase via `supabase functions deploy`
- [ ] If middleware change: tested both authenticated and unauthenticated paths
- [ ] Updated relevant doc (`docs/`, ADR, or handoff if scope warrants)

## Closes

<!-- "Closes #123" if this resolves a tracked issue. Optional. -->
