# Email Deliverability — iCareerOS

**Status:** Bluehost SMTP is the permanent transactional-email channel. There is no Resend (the product) integration, no plan to migrate, and the previous `supabase.auth.resend()` re-attempt button has been removed from the UI.

## Transactional email path

Every outbound email goes through Bluehost SMTP, dispatched in one of two ways:

| Trigger | Sender | How |
|---|---|---|
| Supabase Auth confirmation + recovery emails | Supabase Auth (gotrue) | Auth → SMTP Settings configured with Bluehost. |
| App-initiated emails (job alerts, admin support replies, admin-initiated password resets) | Our Node mailer | `src/lib/mailer.ts` → `nodemailer` against the same Bluehost SMTP relay. |

## Bluehost SMTP config (live)

| | |
|---|---|
| Host | `mail.icareeros.com` (env: `EMAIL_HOST`) |
| SMTP port | `465` (SSL) (env: `EMAIL_SMTP_PORT`) |
| IMAP port | `993` (SSL) (env: `EMAIL_IMAP_PORT`) |
| Auth username | `bugs@icareeros.com` (env: `EMAIL_USER` — the actual existing Bluehost mailbox) |
| Auth password | env: `EMAIL_PASSWORD` — shared between SMTP send + IMAP read |
| Display From (`ALERT_FROM_EMAIL` env + Supabase Sender Email field) | `noreply@icareeros.com` |

`EMAIL_USER` and `ALERT_FROM_EMAIL` are intentionally distinct — the SMTP auth user must be a real mailbox (`bugs@`), while the visible "From" can be any address the relay accepts (`noreply@`).

## Signup confirmation flow

1. User submits the form at **icareeros.com/auth/signup** (subdomains redirect here — see middleware).
2. `supabase.auth.signUp({ email, password, options: { data: { role }, emailRedirectTo: "https://icareeros.com/auth/confirm" } })` is called.
3. Supabase Auth queues the confirmation email through its configured Bluehost SMTP relay.
4. User clicks the email link → `/auth/confirm` verifies the token, signs the user out (auth-hygiene posture), and bounces to `/auth/login?confirmed=true`.
5. Sign-in → middleware redirects employer accounts to `hire.icareeros.com/dashboard`, job seekers to `jobs.icareeros.com/dashboard`.

## Re-attempt policy

There is **no** "Resend confirmation email" button. If a user reports their email never arrived:

1. Tell them to check Spam/Promotions.
2. If still missing, they sign up again with the same email — gotrue treats the second `signUp` call on an unconfirmed account as a fresh send through Bluehost SMTP. (gotrue's rate limit applies — typically 60 s cooldown per email.)
3. If they still don't receive, the admin "Send password reset" action in `/admin/users` works as an alternate path (different email type, separate template — recovery, not signup confirmation).

## Why not Resend.com?

Bluehost SMTP is already paid-for as part of the existing hosting plan, has a working `noreply@icareeros.com` sender, and reaches Gmail at acceptable rates with proper SPF/DKIM/DMARC alignment. Adding a third-party ESP would create another vendor, another bill, and another set of credentials to rotate. Revisit only if outbound volume crosses ~1,000 messages/day, gmail spam-folder rate climbs above ~10 %, or marketing wants per-campaign metrics that Bluehost doesn't expose.

## Credential Rotation

`bugs@icareeros.com` is one mailbox used by two protocols (SMTP send, IMAP read). It has ONE password, stored in ONE place per system.

When the mailbox password changes, update it in exactly TWO places:

1. **Vercel** — `EMAIL_PASSWORD` env var
   https://vercel.com/jabri-solutions/icareeros/settings/environment-variables
2. **Supabase Auth SMTP** — the `smtp_pass` field
   https://supabase.com/dashboard/project/kuneabeiwcxavvyyfjkx/settings/auth

Both must match the mailbox password exactly. Missing either one causes a silent multi-week outage — this happened June–July 2026 (33 days, 9 email flows dead — password resets, signup confirmations, job alerts, re-engagement, weekly insights, support tickets, admin resets, DSAR intake, T-017 self-probes).

### Verification after rotation

Trigger the SMTP health probe (Vercel dashboard → Crons → `/api/cron/smtp-health-check` → Run Now), then check:

```sql
SELECT created_at, event_type, payload->>'error' AS error
FROM public.infrastructure_events
WHERE source = 'smtp-cron'
ORDER BY created_at DESC LIMIT 1;
```

Expected: `event_type = 'smtp.ok'`. If `smtp.send_failed` with `error_code = 'EAUTH'`, the password does not match.

### Env vars

| Var | Type | Purpose |
|---|---|---|
| `EMAIL_HOST` | plain | `mail.icareeros.com` |
| `EMAIL_USER` | encrypted | `bugs@icareeros.com` |
| `EMAIL_PASSWORD` | encrypted | shared SMTP+IMAP credential |
| `EMAIL_SMTP_PORT` | plain | `465` |
| `EMAIL_IMAP_PORT` | plain | `993` |
| `ALERT_FROM_EMAIL` | plain | display From (`noreply@icareeros.com`) — **NOT** a credential |

Type rationale: HOST/PORT aren't secrets, `plain` so they're debuggable via the Vercel dashboard and readable via the API. USER/PASSWORD are `encrypted` — readable by Cowork sessions via the by-ID API endpoint per `docs/COWORK_TOKEN_FETCH.md`. `sensitive` type is intentionally avoided because it returns empty strings via the API, which is exactly how the 2026 outage went undetected for 33 days.

### Migration history

- 2026-04-29 — Original `BLUEHOST_SMTP_*` family created for send path.
- 2026-05-13 — Second `BUGS_EMAIL_*` family created for IMAP read path (bug-inbox cron). Same mailbox, separate credential copies.
- 2026-06-23 — Mailbox password rotated. `BUGS_EMAIL_PASSWORD` updated (IMAP continued working). `BLUEHOST_SMTP_PASS` NOT updated. All outbound email started failing silently with `EAUTH 535`.
- 2026-07-14 — Consolidated both families into unified `EMAIL_*`. One credential, one source of truth, drift now structurally impossible.

