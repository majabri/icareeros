# Changelog

Notable shipped work. Most recent first.

---

## 2026-05-20 — Platform shell, theme parity, landing system overhaul

**`main` HEAD after this run: `93c9f03`**

Wave of landing-system work, the unified platform shell, and a series of
polish/cleanup merges since the 2026-05-18 entry. Listed newest first.

### Landing system (root domain — Platform-owned)

- **#273** `feat/landing-tighten-spacing` — tighten root-page spacing; hero 60vh, sections 4rem padding.
- **#272** `feat/cycle-color-reorder-flash` — landing cycle color reorder (coral→2, gold→3, green→4) + connector flash on stage advance.
- **#271** `feat/landing-comprehensive-review` — comprehensive landing pass: animation fix + per-stage branding application + copy review.
- **#270** `feat/landing-transparent-constellation` — sections go transparent over the constellation; mid-body CTA cleanup; per-stage chip refinement.
- **#269** `feat/collapse-subdomain-landings` — collapse the subdomain landings (jobs.* / hire.*) back into root domain (PR B of 2). Both subdomains now redirect through the root.
- **#268** `feat/landing-polish-and-content-lift` — root polish + content lifted up from the legacy subdomain landings.
- **#267** `feat/platform-talent-os` — rebuild the hiring side around the **Talent OS** framework (Design / Select / Integrate / Support / Develop / Retain).
- **#266** `feat/platform-landing-deep-sections` — split the root landing into deep `#platform` / `#job-seekers` / `#hiring-teams` sections.
- **#265** `chore/sync-claude-md-7ce8bba` — in-repo CLAUDE.md sync to mid-wave HEAD.
- **#264** `feat/platform-landing-copy` — three-domain copy overhaul; Career OS framing locked in across the brand.
- **#263** `feat/platform-landing-alignment` — three-domain landing alignment (social proof removed; per-domain heading + CTA alignment).

### Platform shell + theme parity

- **#262** `feat/unified-platform-shell` — single `PlatformShell` wraps both subdomain layouts (ConstellationBackground + AppTopBar with tagline + sidebar slot + mobile-drawer state). Jobs supplies its specialised `AppSidebar` via the `customSidebar` prop; hire renders the config-driven flat nav from `HIRE_CONFIG`. Hire-side surfaces migrated from hardcoded navy to theme-aware CSS variables so light/dark mode renders identically across both platforms. Plus 10 orphan files removed.

### Auth + email

- **#261** `fix/sender-copy-bugs-at` — signup success-message sender label corrected from `noreply@` → `bugs@icareeros.com` to match the real SMTP Sender Email.
- **#260** `docs/sync-state-60f5b56` — last full CHANGELOG + PLATFORM_OVERVIEW sync (covered #252–#259).

---


## 2026-05-18 — Three-domain platform + admin overhaul

**`main` HEAD after this run: `60f5b56`**

The platform is now a three-host product served from one Next.js app:

- **`icareeros.com`** — marketing, auth (signup + login), shared confirmation routes.
- **`jobs.icareeros.com`** — job-seeker Career OS dashboard.
- **`hire.icareeros.com`** — employer recruiter app (Find Talent, candidate detail, invites, company profile).

Today's work consolidates and hardens that architecture and ships a redesigned admin user-management surface.

### Subdomain rename and clean URLs

- **PR #252** — Phase 3 recruiter shell shipped (sidebar, candidate detail, invite outreach, employer-trusted block-list, /settings/privacy discoverability toggle, /hired/dashboard candidate search). DNS-facing strings renamed `hired.icareeros.com` → `hire.icareeros.com`. Internal codebase rename `(hired)→(hire)` route group, `/hired/*→/hire/*` nested folder, `/api/hired/*→/api/hire/*`, `HiredShell→HireShell`, Platform literal `'hired'→'hire'`. Middleware now 308-redirects `/hire/*` → `/*` on `hire.*` host and rewrites the bare path back to `/hire/*` internally — users always see `hire.icareeros.com/dashboard`, never `/hire/dashboard`.
- **PR #253** — Auth subdomain login loop closed: browser Supabase client + `/auth/callback` + `/auth/confirm` now scope cookies to `.icareeros.com` on production hosts so a session on `icareeros.com` is valid on every subdomain.
- **PR #255** — Code reads `NEXT_PUBLIC_HIRE_URL` (matches the Vercel env var name after the rename) with `NEXT_PUBLIC_HIRED_URL` kept as a back-compat fallback.

### Auth fixes and registration centralization

- **PR #252 (cont.)** — Signup propagates the chosen role via `raw_user_meta_data`; the `handle_new_user_role()` trigger reads it (`COALESCE(NEW.raw_user_meta_data->>'role', 'job_seeker')`). Removed the broken client-side `user_roles` upsert (silently rejected by RLS) and the empty `catch {}` that swallowed every backend error. Errors now surface to the user.
- **PR #254** — SMTP user vs display From distinction explicit in `mailer.ts` doc-comments and `.env.example`. Signup success copy softened — points at the existing Resend-confirmation button instead of promising delivery.
- **PR #258** — Resend.com (the SaaS) confirmed not integrated; `docs/EMAIL_DELIVERABILITY.md` rewritten to lock in Bluehost SMTP as the permanent transactional channel. The `supabase.auth.resend()` SDK call + the "Resend confirmation email" UI button stay (they dispatch through Bluehost). New middleware redirect: `/auth/signup` on `hire.*` or `jobs.*` 308s to `https://icareeros.com/auth/signup?role={employer|job_seeker}` — registration lives only on the root domain. AuthForm's "Sign up free" link on the login page is absolute → root.

### Admin user-management surface

- **PR #256** — Dual user-table: `/admin/users` partitions accounts by `user_roles.role` into two tabs (Jobs Users + Hire Users) with live count badges. New REST API:
  - `GET /api/admin/hire-users`
  - `PATCH /api/admin/hire-users/[id]/plan`
  - `DELETE /api/admin/hire-users/[id]`
  - `POST /api/admin/hire-users/[id]/reset-password`
  All gated by `requirePermission`, service-role client, audit-logged. Wrong-tab safety re-checks `user_roles.role` server-side. Schema migration `extend_subscription_plan_enum_employer_tiers` adds `growth` and `enterprise` to the `subscription_plan` enum.
- **PR #257** — Third tab "Admins": accounts where `profiles.admin_role IS NOT NULL` OR legacy `profiles.role='admin'`. 5-tier role badge. Single action: Send password reset (no plan change, no delete — admin deletion still lives in the super-admin Roles surface). New API:
  - `GET /api/admin/admin-users`
  - `POST /api/admin/admin-users/[id]/reset-password`
  Internal Users/Admins toggle in `UsersAdminPanel` is hidden via a `hideAdminsTab` prop so admin handling lives in exactly one place.
- **PR #259** — Fourth tab "All Users": read-only combined overview. Columns Email · Role badge (Jobs User / Hire User / Admin) · Plan · Joined · Confirmed. Search + count badge. No per-row actions — those stay in the specialized tabs.
  - `GET /api/admin/all-users`

### Net result on `main`

```
60f5b56  feat(admin): All Users 4th tab on /admin/users (#259)
5d2c9cd  fix(email,auth): no Resend.com integration; signup-on-root only (#258)
130a65a  feat(admin): Admins tab on /admin/users (#257)
a97337f  feat(admin): dual user-table — Jobs Users + Hire Users tabs (#256)
7bfc904  fix(env): code reads NEXT_PUBLIC_HIRE_URL (#255)
6f20dbd  fix(smtp): SMTP auth user vs. display From (#254)
76462ae  fix(auth): close the subdomain login loop (#253)
255aad2  feat(hire): Phase 3 — recruiter shell, candidate search, invites + auth fixes (#252)
```

### Known open items

- **Stripe UAT** — May 31 product decision deadline; products not yet live in production.
- **Supabase Dashboard → Auth → SMTP Settings** — toggle is ON but live signup tests still surface "Error sending confirmation email". Use the "Send test email" button to surface the exact Bluehost error code; the code path is verified correct.
- **DMARC** — currently `p=quarantine`; promote to `p=reject` once Bluehost has 2+ weeks of clean delivery.
- **azjobs retirement** — repo archived, Supabase project paused; pending final DNS sweep to confirm nothing references the old project.
