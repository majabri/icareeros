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
