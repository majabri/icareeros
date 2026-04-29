# Agent Handoff — 2026-04-29b (Day 32 Complete)

**Project:** iCareerOS — Next.js 15 rebuild (github.com/majabri/icareeros)
**Session scope:** Day 32 — Observability: Sentry + BetterStack + k6 load test baseline
**Written:** 2026-04-29
**Prior handoff:** docs/AGENT_HANDOFF_20260429.md (Day 31 — Stripe, Admin toggle, DNS, Landing page)

---

## Session Summary

### PR backlog cleared (start of session)
PRs that were open at session start, now merged:

| PR | Branch | Commit | What |
|----|--------|--------|------|
| #23 | `day-28-cycle-reset-ux` | `b1ab0de` | CycleSummaryPanel + next-cycle auto-start |
| #24 | `day-29-remove-vercel-cli` | `c7fba60` | Remove vercel devDep → 0 Dependabot vulns |

DNS cutover also completed this session: both Cloudflare CNAME records (`@` and `www`) now point to `ff08b36cbd436317.vercel-dns-016.com` (proxy OFF).

---

## Day 32: Observability

### Branch / PR
- **Branch:** `day32-observability`
- **PR:** [#29](https://github.com/majabri/icareeros/pull/29) — awaiting CI
- **Commit:** `f915d8e`

### Files added / changed

| File | Change | Purpose |
|------|--------|---------|
| `sentry.client.config.ts` | New | Browser Sentry init: traces (10%/100%), session replay (1%/100% on error), masked PII |
| `sentry.server.config.ts` | New | Node.js Sentry init: ignores NEXT_NOT_FOUND + NEXT_REDIRECT |
| `sentry.edge.config.ts` | New | Edge runtime Sentry init (for `/api/health`, middleware) |
| `next.config.js` | Modified | Wrapped with `withSentryConfig()`: source maps, `/monitoring` tunnel, auto-instrumentation |
| `src/app/global-error.tsx` | New | Next.js 15 global error boundary: captures to Sentry, shows digest ID, Try again/Go home |
| `src/app/api/health/route.ts` | New | Edge-runtime GET endpoint; returns `{status, service, timestamp, version}`; BetterStack monitor target |
| `src/app/api/health/__tests__/health.test.ts` | New | 4 unit tests: status ok, ISO timestamp, 200 status, Cache-Control header |
| `src/__tests__/sentry.test.ts` | New | 5 existence tests: 3 config files + global-error.tsx + withSentryConfig in next.config.js |
| `scripts/load-test.js` | New | k6 script: 10 VUs, 50s; p95 targets health<200ms / landing<800ms / login<600ms |
| `docs/observability-setup.md` | New | Complete Sentry, BetterStack, k6 setup guide with step-by-step instructions |
| `.env.example` | Modified | Added NEXT_PUBLIC_SENTRY_DSN, SENTRY_DSN, SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT, NEXT_PUBLIC_APP_ENV, BETTERSTACK_API_KEY |
| `.gitignore` | Modified | Added `scripts/load-test-results.json` |
| `package.json` / `package-lock.json` | Modified | Added `@sentry/nextjs` |

### Test results
- **Unit tests:** 87/87 passing (+9 new from Day 32)
- **TypeScript:** 0 errors (`npx tsc --noEmit`)
- **npm audit:** 0 vulnerabilities

---

## Current Repo State

| Item | State |
|------|-------|
| `main` HEAD | `c7fba60` (Day 29: remove vercel devDep) |
| Open PRs | PR #29 (day32-observability) — CI running |
| Unit tests | 87/87 ✅ |
| TypeScript | 0 errors ✅ |
| npm audit | 0 vulnerabilities ✅ |
| DNS | icareeros.com → Vercel icareeros project (both @ and www) ✅ |

---

## Action Required After PR #29 Merges

### 1. Sentry project setup (one-time, ~10 min)

1. Go to [sentry.io](https://sentry.io) → New Project → **Next.js**
2. Name: `icareeros`, org: `jabri-solutions`
3. Copy the **DSN** from Settings → Client Keys
4. In Vercel `icareeros` project → Settings → Environment Variables, add:

| Variable | Value | Env |
|----------|-------|-----|
| `NEXT_PUBLIC_SENTRY_DSN` | `https://xxx@oXXX.ingest.sentry.io/XXXXX` | Production + Preview |
| `SENTRY_DSN` | same DSN | Production + Preview |
| `SENTRY_AUTH_TOKEN` | from Sentry Auth Tokens (scope: project:releases + org:read) | Production + Preview |
| `SENTRY_ORG` | `jabri-solutions` | Production + Preview |
| `SENTRY_PROJECT` | `icareeros` | Production + Preview |
| `NEXT_PUBLIC_APP_ENV` | `production` (prod) / `staging` (preview) | Per environment |

5. Trigger a Vercel redeploy — source maps will upload on first build with `SENTRY_AUTH_TOKEN`

### 2. BetterStack uptime monitor (one-time, ~5 min)

1. Go to [betterstack.com](https://betterstack.com) → Uptime → New Monitor
2. URL: `https://icareeros.com/api/health`
3. Check every **30 seconds**, 2 confirmation failures before alert
4. Assert body contains `"status":"ok"`
5. Alert: email `majabri714@gmail.com`

### 3. Run load test baseline (after domain is live)

```bash
k6 run scripts/load-test.js -e BASE_URL=https://icareeros.com
```

Record the p95 numbers from `scripts/load-test-results.json` as your production baseline.

---

## Next Sprint (Week 7)

Based on the 100% completion roadmap (`docs/icareeros_100pct_completion_roadmap.md`):

| Priority | Task | Estimated effort |
|----------|------|-----------------|
| P0 | User profile page (`/profile` onboarding flow) | 1 day |
| P0 | Job search wired to real data (`/jobs` → opportunityAggregator) | 1 day |
| P1 | Salary enrichment for null-salary jobs (azjobs ~43.6%) | 1 day |
| P1 | Executive role source expansion in azjobs | 1 day |
| P2 | Stripe products/pricing activation (blocked: Amir decision 2026-05-31) | — |
| P3 | LinkedIn/Indeed API keys (blocked: provisioning) | — |

**Recommended next:** Wire `/jobs` page to real `opportunityAggregator` data and ship the `/profile` onboarding entry point for the Evaluate stage.
