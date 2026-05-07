# iCareerOS — Engineering CLAUDE.md (in-repo)

> **Where you are:** the canonical source of truth for the iCareerOS platform.
> Repo: `github.com/majabri/icareeros` · Live: `https://icareeros.com` · Staging: `https://icareeros.vercel.app`
>
> For business / product context, the workspace docs live in Google Drive:
> `https://drive.google.com/open?id=1BbNbup5P0xNGljUIUkPh_qE5hAYrc3Ob`

## First read

1. `docs/CONTRIBUTING.md` — branching, PR workflow, env setup
2. `docs/ARCHITECTURE.md` (TBD) — high-level system map
3. The 3 ADRs in the Drive workspace under `iCareerOS/docs/adr/` — define repo topology, branching, where things live

## Quick rules

- **All code goes here, not in Drive.** Per ADR 0001.
- **Every non-trivial change goes through a PR.** Per ADR 0002. The exception list is short — see CONTRIBUTING.
- **Secrets never appear in any file.** They live in Vercel + Supabase + GitHub Actions secrets. If a token ever appears in chat, revoke it immediately.
- **Edge function calls use `supabase.functions.invoke()`** — never raw `fetch`. Exception: SSE streaming responses.
- **AI calls go through Next.js API routes** (`src/app/api/...`). `ANTHROPIC_API_KEY` stays server-side.

## Environments

| Component | Value |
|---|---|
| Framework | Next.js 15.5.15 (App Router) + TypeScript 5 |
| Backend | Supabase (Postgres, Edge Functions, Auth) |
| Hosting | Vercel (jabri-solutions team, project `prj_hH16cZnF3MC2DwJ7UIFVFE0tLhCe`) |
| Supabase prod | `kuneabeiwcxavvyyfjkx` |
| Payments | Stripe (test mode, `acct_1TK0yp2K7LVuzb7t`) |
| AI | Anthropic Claude (Haiku 4.5 / Sonnet 4.6 / Opus 4.7) |
| Email — transactional | Bluehost SMTP |
| Observability | Sentry, BetterStack, Langfuse |
| i18n | en, es, fr, de |

## Quick commands

```bash
npm install                   # bootstrap
npm run dev                   # local Next.js on :3000
npm run lint                  # ESLint
npm run type-check            # tsc --noEmit
npm test                      # vitest
npm run test:e2e              # Playwright (against live Vercel)

supabase link --project-ref kuneabeiwcxavvyyfjkx
supabase db push              # apply migrations
supabase functions serve      # local edge fn runtime
```

## Owner / escalation

- Code owner: `@majabri` (see `.github/CODEOWNERS`)
- Decisions: Amir Jabri (jabrisolutions@gmail.com)
- Production incidents: page Amir within 1 hour


---

## Current state (as of 2026-05-07)

**HEAD on `main`:** `b60c770` — Phase 6 in progress.
**Last full handoff:** `docs/AGENT_HANDOFF_20260507d.md` (Phase 5 complete).
**Test suite:** 466/466 unit tests passing (Vitest); E2E suite via Playwright.

### Active features (Phase 1-5 shipped)

- Six-stage Career OS dashboard ring — strict completion gates per stage
- On-demand Coaching Brief (Haiku 4.5)
- Adzuna pre-fetch cron + on-demand `/jobs` search + fit-scoring (Haiku 4.5)
- Stripe activation pipeline (4-tier: free / starter $9.99 / standard $18.99 / pro $29.99)
  + Founding Lifetime $89 + 3 add-ons. **Inactive until Stripe env vars + webhook are configured.**
- Coach Mode B (interactive Sonnet 4.6 chat with token tracking, soft warning at 40 messages, hard cap at 60)
- Interview Simulator (SSE streaming, prompt caching)
- Evaluate completeness (LinkedIn gap analysis, 10-question skills assessment)
- Achieve loop trigger (offer accepted → +100 XP → close cycle → open next, atomic Postgres function)
- Empty-state UX pass (OnboardingCta, per-stage CTAs, opportunities-loading callout, milestone empty state)
- Application pipeline (`/applications` CRUD + Track button on `/jobs`)
- Legal pages: Privacy, Terms, AI Disclosure (DRAFT — pending counsel review)

### Env vars — confirmed in Vercel

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
ANTHROPIC_API_KEY
ADZUNA_APP_ID
ADZUNA_APP_KEY
GEMINI_API_KEY                      # resume parser fallback
CRON_SECRET                         # /api/cron/prefetch-jobs auth
CONSENT_IP_SALT                     # legal — consent_records IP hashing
NEXT_PUBLIC_BASE_URL                # used by Stripe checkout return URLs
NEXT_PUBLIC_MONETIZATION_ENABLED    # currently `false` — flip to `true` to activate paid plans
```

### Env vars — pending (set before billing/observability launch)

```
# Stripe — see docs/AGENT_HANDOFF_20260507d.md for full list (17 vars)
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
STRIPE_PRICE_{STARTER,STANDARD,PRO}_{MONTHLY,ANNUAL}        # 6 server-side
STRIPE_PRICE_{SPRINT,INTERVIEW_WEEK,NEGOTIATION_PACK,FOUNDING_LIFETIME}  # 4 server-side
NEXT_PUBLIC_STRIPE_PRICE_*          # NEXT_PUBLIC_-prefixed copies for the client checkout

# Email + observability
SUPABASE_SERVICE_ROLE_KEY           # required by /api/stripe/webhook + /api/jobs/{agent,search}
SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS
SENTRY_DSN
LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY
```

### Feature flags (Supabase `feature_flags` table — NOT in Vercel)

| key | value | purpose |
|---|---|---|
| `monetization_enabled` | `false` | Master switch for plan-gated routes. When false, every gate fails open. Mirrors `NEXT_PUBLIC_MONETIZATION_ENABLED` for server-side reads. |
| `founding_seats_remaining` | `100` | Capped seat counter for the Founding Lifetime $89 SKU. Decremented atomically by `/api/stripe/webhook` on `checkout.session.completed`. UI hides the offer when value reaches 0. |

### Stripe webhook endpoint to register (when activating)

```
https://icareeros.com/api/stripe/webhook

Events:
  checkout.session.completed
  customer.subscription.created
  customer.subscription.updated
  customer.subscription.deleted
  invoice.payment_failed
```

### Open launch blockers (see AGENT_HANDOFF_20260507d.md for full list)

P0 (manual, blocks production):
- Set the 17 Stripe env vars above + register webhook
- Add `SUPABASE_SERVICE_ROLE_KEY` (required by Stripe webhook + /jobs upsert pipeline)
- Add SMTP, Sentry, Langfuse env vars
- Counsel review of `/legal/{privacy,terms,ai-disclosure}` content (currently DRAFT)
- Flip `NEXT_PUBLIC_MONETIZATION_ENABLED=true`

P1: production verification dry-runs of Stripe checkout, Coach Mode B caps, /applications, /interview, /jobs fit-scoring.

P2 (carry-forward debt): `career_os_event_log` is a VIEW (not a table); `offers` table is dead code; promotion/certification milestone UI not yet built; Adzuna budget guard.
