# Contributing to iCareerOS

This is the engineering-internal contributing guide. For business / product context, see the Drive workspace at https://drive.google.com/open?id=1BbNbup5P0xNGljUIUkPh_qE5hAYrc3Ob.

## Source of truth

`github.com/majabri/icareeros` is the canonical home for ALL code, configs, migrations, tests, and edge functions. Anything not in this repo does not exist as far as production is concerned. See [ADR 0001](https://drive.google.com/open?id=1BbNbup5P0xNGljUIUkPh_qE5hAYrc3Ob) for the full reasoning.

## Getting started

```bash
git clone https://github.com/majabri/icareeros.git
cd icareeros
npm install
cp .env.example .env.local   # fill in real values from Vercel dashboard
npm run dev                  # starts Next.js on localhost:3000
```

For Supabase + edge function development:

```bash
supabase login
supabase link --project-ref kuneabeiwcxavvyyfjkx
supabase functions serve     # local edge function runtime
```

## Branching workflow (per ADR 0002)

1. Branch from `main`:
   ```bash
   git checkout main && git pull
   git checkout -b feat/my-feature   # or fix/, chore/, hotfix/
   ```
2. Make changes. Keep the branch short — ship within 72 hours.
3. Push and open a PR:
   ```bash
   git push -u origin feat/my-feature
   gh pr create --fill   # or use the GitHub UI
   ```
4. Fill out the PR template (it's pre-loaded — checkboxes guide the review).
5. Wait for CI green: `test-secrets` + `Playwright E2E` are required.
6. Merge with **squash** (default).
7. Delete the branch (GitHub does this automatically if you opt in).

## What needs a PR (per ADR 0002 §2)

| Change | Needs PR? |
|---|---|
| `src/`, `supabase/`, `.github/`, `package.json`, `vercel.json` | ✅ Always |
| `docs/`, `README.md` | ❌ Direct push to `main` OK |
| `.env.example` (placeholder change) | ❌ Direct push to `main` OK |

## Hotfix exception

Only when production is broken and time matters. Use:
- Branch prefix: `hotfix/`
- PR title prefix: `[hotfix]`
- After merging, open a GitHub Issue tracking post-mortem follow-up.

CI must still pass. Branch protection allows admin bypass of review for hotfixes; it does not allow bypass of CI.

## Where things live (per ADR 0003)

| Asset | Location |
|---|---|
| Production code | This repo |
| Tests | This repo (`__tests__/`, `e2e/`) |
| Database migrations | This repo (`supabase/migrations/`) |
| Engineering docs | This repo (`docs/`) |
| Business docs / handoffs / ADRs | Google Drive (`iCareerOS/docs/`) |
| Secrets (API keys, tokens) | Vercel env vars + Supabase secrets — NEVER in any file |
| Design assets | Google Drive (`iCareerOS/shared/`) |

## Local development conventions

- TypeScript strict mode (`tsconfig.json` enforces).
- Tailwind for styling. No custom CSS modules unless absolutely necessary.
- shadcn/ui for primitives (button, card, input, etc.). Don't reinvent.
- Tests next to code (`src/services/foo.ts` + `src/services/__tests__/foo.test.ts`).
- Edge function calls use `supabase.functions.invoke("<fn>", { body })` — never raw `fetch`. Exception: SSE streaming responses (see CLAUDE.md).
- Server-side AI calls go through Next.js API routes (`src/app/api/...`); never expose `ANTHROPIC_API_KEY` to the client.

## Pre-commit (locally)

```bash
npm run lint        # ESLint
npm run type-check  # tsc --noEmit
npm test            # vitest
```

Husky runs ESLint + Prettier on staged files automatically.

## CI (in PRs)

Two required checks gate merge to `main`:
- **Test Secrets** — confirms required GitHub Actions secrets are present.
- **Playwright E2E** — runs the E2E suite against `https://icareeros.vercel.app`.

Both must pass before merge.

## Reporting bugs

If you find a bug while developing, open a GitHub Issue. If production is broken, also message Amir (jabrisolutions@gmail.com) within 1 hour.

## Questions

Engineering questions: open a GitHub Discussion or ask in the relevant PR.
Product / business questions: Amir (jabrisolutions@gmail.com).
