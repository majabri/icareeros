# Platform overview — three-domain architecture

**Status:** authoritative as of `main` HEAD `93c9f03` (2026-05-20).

iCareerOS is a single Next.js 15 application served on three production hosts.

**Updates since 2026-05-18:**
- Unified `PlatformShell` is now the single shell wrapper for both subdomain layouts (PR #262). Jobs supplies its specialised `AppSidebar` via the `customSidebar` slot; hire renders a config-driven flat nav from `HIRE_CONFIG`. Theme-aware CSS variables drive surface, text, and border colours on both platforms so light/dark mode renders identically.
- Subdomain landings (jobs.* and hire.*) collapsed back into the root domain landing surface (PR #269). Unauthenticated traffic to those subdomain home routes now redirects to the relevant section anchor on `icareeros.com`.
- Hiring side rebranded around the **Talent OS** 6-stage framework (Design → Select → Integrate → Support → Develop → Retain) (PR #267).
- Landing cycle palette aligned to the per-stage colors used across the product (teal, coral, gold, green, slate, light teal) (PR #272).
- Auth: signup success copy now matches the real SMTP Sender Email `bugs@icareeros.com` (PR #261). No Resend.com integration — Bluehost SMTP remains the permanent transactional channel.

There is one deployment, one codebase, one Supabase project, and one auth-cookie scope. Hosts are differentiated at the edge by the middleware, and the user lands in the right experience based on a combination of the URL host they hit and the role(s) recorded against their account.

```
┌───────────────────────────────────────────────────────────────────┐
│  icareeros.com         (root)          → marketing + auth         │
│  jobs.icareeros.com    (job seeker)    → Career OS app            │
│  hire.icareeros.com    (employer)      → Find Talent recruiter app│
└───────────────────────────────────────────────────────────────────┘
```

All three terminate at the same Vercel project (`prj_hH16cZnF…`) and run the same Next bundle. The split is enforced exclusively in middleware.

## DNS and Vercel

| Host | Vercel domain | Role |
|---|---|---|
| `icareeros.com` | Primary | Marketing pages, `/auth/signup`, `/auth/login`, `/auth/confirm`, `/auth/callback`, `/admin/*` |
| `jobs.icareeros.com` | Alias | Job-seeker app (`/dashboard`, `/mycareer/*`, `/evaluate`, `/advise`, `/learn`, `/act`, `/coach`, `/achieve`, etc.) |
| `hire.icareeros.com` | Alias | Employer app (`/dashboard`, `/candidates/[id]`, `/jobs`, `/invites`, `/profile`) |
| Env override (`NEXT_PUBLIC_HIRE_URL`) | `https://hire.icareeros.com` | Used by middleware + `postLoginDestination()` |
| Env override (`NEXT_PUBLIC_JOBS_URL`) | `https://jobs.icareeros.com` | Same |
| Env override (`NEXT_PUBLIC_ROOT_URL`) | `https://icareeros.com` | Used by `emailRedirectTo` so every confirmation link lands on root |

`NEXT_PUBLIC_HIRED_URL` is kept as a back-compat fallback (the variable was renamed to `…_HIRE_URL` after the subdomain rename; code reads both).

## Middleware behaviour (`src/middleware.ts`)

The middleware runs on every request, sets an `x-platform: jobs | hire | root` header for downstream server components, and performs four host-aware behaviours:

1. **Signup centralization.** On `hire.*` or `jobs.*`, a hit to `/auth/signup` is 308-redirected to `https://icareeros.com/auth/signup?role={employer|job_seeker}`. Registration only happens on the root domain.
2. **Clean `hire.*` URL surface.** On `hire.*`, any path starting with `/hire/` is 308-redirected to the same path with the prefix stripped (`/hire/dashboard` → `/dashboard`), then an internal rewrite turns the bare path back into `/hire/<x>` so Next routes into the `(hire)` route group folder. Net effect: the user always sees `hire.icareeros.com/dashboard`, never `/hire/dashboard`.
3. **Auth protection.** Unauthenticated users hitting protected paths (`/dashboard`, `/mycareer`, `/jobs`, `/admin`, etc.) are bounced to `/auth/login?redirect=…`. The list lives at the top of the file (`PROTECTED`, `ADMIN_PROTECTED`).
4. **Post-login routing.** When an authenticated user hits `/auth/login` or `/auth/signup`, the middleware reads `user_roles` and routes them: `admin → /admin`; dual role → `/auth/choose-platform`; `employer-only → https://hire.icareeros.com/dashboard`; `job_seeker (default) → https://jobs.icareeros.com/dashboard`.

## Auth cookie cross-subdomain setup

Auth cookies are scoped to `.icareeros.com` on production hosts so a session created on any one host is valid on every other. The browser-side scope is set in `src/lib/supabase.ts::resolveBrowserCookieDomain()`; the server-side scope is set in `src/lib/supabase-cookie-options.ts::withCrossSubdomainCookie()` and applied wherever `createServerClient` is constructed (`/auth/callback`, `/auth/confirm`, middleware).

On `localhost:3000` and `*.vercel.app` previews, cookies stay per-host (no `Domain=` attribute). The check is hostname-based, not `NODE_ENV`-based, because Vercel preview deploys run with `NODE_ENV=production` and would otherwise inherit the production cookie scope.

## Role model

| Source | Lives in | Values | Used by |
|---|---|---|---|
| User-type role | `public.user_roles.role` (1:1 with `auth.users`) | `job_seeker` \| `employer` \| `recruiter` \| `admin` \| `support_agent` \| `moderator` | Middleware post-login routing; `/admin/users` tabs; row-level filters |
| Admin tier | `public.profiles.admin_role` | `super_admin` \| `admin` \| `support_l2` \| `support_l1` \| `viewer` | `requirePermission()` server helper; admin-panel role badge |
| Legacy admin flag | `public.profiles.role` | `'admin'` (back-compat only) | Falls back to `super_admin` in `requirePermission()` when no explicit `admin_role` |

The `handle_new_user_role` trigger fires AFTER INSERT on `auth.users` (`SECURITY DEFINER`) and writes the role chosen at signup:

```sql
INSERT INTO public.user_roles (user_id, role)
VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'role', 'job_seeker'))
ON CONFLICT (user_id) DO NOTHING;
```

The role is propagated from the signup form via `supabase.auth.signUp({ options: { data: { role } } })`. The trigger is `SECURITY DEFINER` so it bypasses RLS — no client-side `user_roles` upsert is needed.

## Signup flow end-to-end

The signup form is identical for both roles; only the `data.role` value differs.

```
1. User clicks 'Sign up' on the landing page (icareeros.com)
   → /auth/signup?role=job_seeker or ?role=employer
   → If they click 'Sign up' from hire.* or jobs.* /auth/login,
     the middleware 308-redirects to icareeros.com/auth/signup?role=…

2. Page renders <AuthForm mode="signup" initialRole={parsedFromUrl} />
   → Role card pre-selected from the URL param
   → Email/password/consent fields gated behind a card selection

3. User submits — AuthForm.handleSubmit calls:
     supabase.auth.signUp({
       email, password,
       options: {
         data: { role: selectedRole },                  // "job_seeker" | "employer"
         emailRedirectTo: `${rootUrl}/auth/confirm`,    // always icareeros.com
       },
     })

4. Supabase Auth (gotrue):
   - Inserts auth.users row with raw_user_meta_data.role = …
   - Fires the on_auth_user_created_role trigger
     → INSERT into public.user_roles (user_id, role) — server-side
   - Queues the confirmation email through the configured SMTP relay
     (Bluehost — see docs/EMAIL_DELIVERABILITY.md)
   - If SMTP succeeds → returns ok; AuthForm shows 'Check your inbox …'
   - If SMTP fails    → returns error 'Error sending confirmation email'
                        AND rolls back the user creation (no DB row remains)

5. App-side: recordSignupConsent server action writes 3 consent_records
   rows using SUPABASE_SERVICE_ROLE_KEY (bypasses RLS).

6. User clicks the email link → /auth/confirm verifies the token_hash,
   signs them out (auth-hygiene posture: an email link verifies an email
   address, not user identity), and bounces to /auth/login?confirmed=true.

7. User signs in on icareeros.com/auth/login. AuthForm's post-login
   handler reads user_roles + profiles.admin_role and computes the
   destination via postLoginDestination():
     admin                            → /admin
     employer + job_seeker (dual)     → /auth/choose-platform
     employer only                    → https://hire.icareeros.com/dashboard
     job_seeker (default)             → https://jobs.icareeros.com/dashboard
```

The same decision table runs in middleware on the subsequent request, which makes the redirect resilient to a client-side navigation race.

## Per-host route ownership

| Folder | Owns URLs on |
|---|---|
| `src/app/(app)/*` | `jobs.icareeros.com` |
| `src/app/(hire)/hire/*` (rewritten from `/`) | `hire.icareeros.com` |
| `src/app/(admin)/admin/*` | All hosts (admin gate enforces) |
| `src/app/auth/*` | Mostly `icareeros.com`; subdomains redirect /auth/signup to root |
| `src/app/*` (root) | Marketing pages on `icareeros.com` |

## Email pipeline

Two paths, both ending at Bluehost SMTP (`mail.icareeros.com:465`, auth user `bugs@icareeros.com`, display From `noreply@icareeros.com`):

1. **Supabase Auth (gotrue)** — confirm-signup, password recovery, magic links. Configured in `Auth → SMTP Settings` in the Supabase Dashboard.
2. **Our Node mailer** (`src/lib/mailer.ts`, nodemailer) — job alerts, admin support replies, admin-initiated password resets via `auth.admin.generateLink`.

There is no Resend.com integration. See `docs/EMAIL_DELIVERABILITY.md` for the full rationale.

## Reference

- `src/middleware.ts` — host detection, redirects, rewrites, auth gates, rate limit.
- `src/lib/platform-host.ts` — `platformFromHost()` and `isProductionHost()` helpers (unit-tested).
- `src/lib/supabase.ts` — browser client with cross-subdomain cookie domain.
- `src/lib/supabase-cookie-options.ts` — `withCrossSubdomainCookie()` server helper.
- `src/lib/auth/postLoginDestination.ts` — shared role-based destination decision.
- `src/components/auth/AuthForm.tsx` — signup + login UI, role selector, post-signup redirect.
- `src/app/auth/signup/page.tsx`, `src/app/auth/login/page.tsx`, `src/app/auth/confirm/route.ts`, `src/app/auth/callback/route.ts` — the auth surface.
