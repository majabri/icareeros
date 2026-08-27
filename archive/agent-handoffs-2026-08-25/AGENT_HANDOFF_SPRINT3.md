# Agent Handoff — Sprint 3

**Date:** 2026-05-13
**Session:** Sprint 3 W2 execution + Wave 4 close-out
**HEAD on main:** `0d56cae`
**Open PRs:** 0

---

## What Shipped

### PR #213 — `fix(observability): bug-inbox cron — surface GH failures + log run summary`
- Commit: `7901f61`
- Bug-inbox cron now logs a `run_summary` infrastructure_event on every invocation (even empty-inbox runs) and surfaces GitHub issue creation failures as `bug.github_create_failed` events.
- Resolves Sprint 2 UAT backlog items B2 and B9.

### PR #214 — `feat(ats): add Rippling adapter via Rippling Recruiting API (Sprint 3 W2)`
- Commit: `0d56cae`
- Rippling uses their own Rippling Recruiting ATS at `api.rippling.com/platform/api/ats/v1/board/rippling/jobs`.
- Added `"rippling"` to the ATS type union, `Rippling` to `SEED_COMPANIES`, and `scrapeRippling()` function to `supabase/functions/ingest-ats-direct/index.ts`.
- Normalizes the flat JSON array to `ScrapedJob` shape: `uuid → source_id` (as `rip-rippling-{uuid}`), `name → title`, `company = 'Rippling'`, `department.label + workLocation.label → description`, `workLocation.label → location`, `/remote/i → is_remote`, `url → apply_url`.
- Multi-location UUID deduplication handled at DB level via `onConflict: "source,source_id"` upsert.
- The API returns ~773 entries but only ~435 unique UUIDs; the upsert collapses dupes automatically.

---

## What Was Skipped

### Retool — Permanently Deferred
Retool is a client-side SPA with no public ATS board and no job links in raw HTML. Probed all major ATS providers (Greenhouse, Lever, Ashby, SmartRecruiters) — all returned 0 or 404 for Retool slugs. The `career_page` regex scraper returns 0 matches. Only viable path would be Firecrawl JS rendering but cost/complexity not justified for one company. Retool stays in the Adzuna + Google fallback pipeline.

---

## Current DB State

| Source  | Total Rows | Unique IDs | Earliest           | Latest              |
|---------|-----------|------------|---------------------|----------------------|
| ats     | 608       | 608        | 2026-05-12 04:44 UTC | 2026-05-13 21:39 UTC |
| adzuna  | 211       | 211        | 2026-05-07 16:29 UTC | 2026-05-12 17:16 UTC |
| **Total** | **819** | **819**   |                     |                      |

The 608 ATS rows include jobs from Stripe, Vercel, Anthropic, Figma, Airtable (Greenhouse), Notion, OpenAI, Linear (Ashby), and Rippling (own ATS).

---

## Cron Health Check

All 10 crons are registered in `vercel.json` with corresponding route handlers:

| Cron                    | Schedule        | Route Handler Status |
|-------------------------|-----------------|----------------------|
| `/api/cron/job-alerts`        | Daily 08:00 UTC     | OK — GET+POST pattern |
| `/api/cron/weekly-insights`   | Sunday 08:00 UTC    | OK — GET+POST pattern |
| `/api/cron/re-engagement`     | Daily 10:00 UTC     | OK — GET+POST pattern |
| `/api/cron/prefetch-jobs`     | Every 6h            | OK — GET+POST pattern |
| `/api/cron/health-check`      | Every 15min         | OK — GET+POST pattern |
| `/api/cron/cost-check`        | Daily 06:00 UTC     | OK — GET+POST pattern |
| `/api/cron/ingest-ats`        | Daily 02:00 UTC     | OK — forwards to edge fn |
| `/api/cron/check-bugs-inbox`  | Every 30min         | OK — GET+POST pattern |
| `/api/cron/discover-rss`      | Every 6h            | OK — feature-flag gated |
| `/api/cron/discover-perplexity` | Daily 14:00 UTC   | OK — feature-flag gated |

All crons have the GET-delegates-to-POST pattern (fixed in Sprint 2 PR #210). The `ingest-ats` cron forwards to Supabase edge function `ingest-ats-direct` with `dry_run: false, max_per_company: 25`.

**Note:** Vercel logs were not checked for recent run status (no Vercel MCP connected). Recommend a manual spot-check of Vercel Cron logs at `vercel.com/jabri-solutions/icareeros/settings/crons` to confirm recent successful invocations.

---

## Open Items

1. **Edge function manual redeploy needed.** PR #214 updated the source code at `supabase/functions/ingest-ats-direct/index.ts` but the Supabase edge function must be redeployed manually:
   ```
   supabase functions deploy ingest-ats-direct
   ```
   Until this runs, the live edge function is v7 (without Rippling). After deploy it becomes v8 with Rippling in the nightly cron.

2. **INGEST_CRON_SECRET** must be set in both Vercel env vars AND Supabase edge function secrets for the nightly cron bridge to authenticate.

3. **Vercel cron log spot-check** — verify recent runs of all 10 crons in the Vercel dashboard.

---

## Sprint 3 Summary

- 2 PRs merged (#213, #214), zero rollbacks
- Rippling ATS adapter wired into nightly ingest pipeline
- Retool permanently deferred (SPA, no public ATS)
- 819 total opportunities in DB (608 ATS + 211 Adzuna)
- All 10 crons verified at code level
- Tests: 592 passing (unchanged from Sprint 2 close)
