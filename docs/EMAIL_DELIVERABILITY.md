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
| Host | `mail.icareeros.com` |
| Port | `465` (SSL) |
| Auth username | `bugs@icareeros.com` (the actual existing Bluehost mailbox) |
| Display From (`ALERT_FROM_EMAIL` env + Supabase Sender Email field) | `noreply@icareeros.com` |

`BLUEHOST_SMTP_USER` and `ALERT_FROM_EMAIL` are intentionally distinct — the SMTP auth user must be a real mailbox (`bugs@`), while the visible "From" can be any address the relay accepts (`noreply@`).

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

`bugs@icareeros.com` is one Bluehost mailbox used by two protocols (SMTP send, IMAP read). It has ONE password, stored in ONE place per system. The env vars have been consolidated as of 2026-07-14 so both protocols read the same values — drift is now structurally impossible in code.

### Env vars (single shared credential)

| Var | Type | Value / purpose |
|---|---|---|
| `BLUEHOST_SMTP_HOST` | plain | `mail.icareeros.com` (shared: SMTP + IMAP) |
| `BLUEHOST_SMTP_USER` | encrypted | `bugs@icareeros.com` (shared: SMTP + IMAP auth) |
| `BLUEHOST_SMTP_PASS` | encrypted | mailbox password (shared: SMTP + IMAP auth) |
| `BLUEHOST_SMTP_PORT` | encrypted | `465` (SSL, SMTP-only) |
| `BLUEHOST_IMAP_PORT` | encrypted | `993` (SSL, IMAP-only) |
| `ALERT_FROM_EMAIL` | plain | display From (`noreply@icareeros.com`) — **NOT** a credential |

The two `_PORT` vars are distinct because SMTP-SSL (465) and IMAP-SSL (993) are legitimately different values. `HOST`, `USER`, and `PASS` are shared across both protocols — one value each.

**Type rationale:** `encrypted` (NOT `sensitive`). `sensitive` returns empty strings via the Vercel API — Cowork sessions cannot verify credentials programmatically, which is how the June 2026 outage went undetected for 33 days. `encrypted` is API-readable via the by-ID endpoint per `docs/COWORK_TOKEN_FETCH.md`, so future automation can spot-check.

### When the mailbox password rotates — update TWO places

The same password must be updated in **exactly two** places:

1. **Vercel** — `BLUEHOST_SMTP_PASS` env var
   https://vercel.com/jabri-solutions/icareeros/settings/environment-variables
2. **Supabase Auth SMTP** — the `smtp_pass` field
   https://supabase.com/dashboard/project/kuneabeiwcxavvyyfjkx/settings/auth

Both must match the mailbox password exactly. Missing either one causes a silent multi-week outage.

### Verification after rotation

Trigger the SMTP health probe (Vercel dashboard → Crons → `/api/cron/smtp-health-check` → Run Now), wait ~30s, then query:

```sql
SELECT created_at, event_type, payload->>'error' AS error
FROM public.infrastructure_events
WHERE source = 'smtp-cron'
ORDER BY created_at DESC LIMIT 1;
```

Expected: `event_type = 'smtp.ok'`. If `smtp.send_failed` with `error_code = 'EAUTH'`, the password does not match. Fix Vercel + Supabase, re-run.

### Migration history — the drift that caused the 2026 outage

- **2026-04-29** — `BLUEHOST_SMTP_*` family created for the send path (nodemailer via `src/lib/mailer.ts`).
- **2026-05-13** — Separate `BUGS_EMAIL_*` family created for the IMAP read path (bug-inbox cron). Same mailbox, second copy of credentials, nothing kept them in sync.
- **2026-06-23** — Mailbox password rotated in Bluehost. `BUGS_EMAIL_PASSWORD` updated (IMAP kept working). **`BLUEHOST_SMTP_PASS` was NOT updated.** All outbound email started silently failing with `EAUTH 535`.
- **33 days** of dead email flows: password resets, signup confirmations, job alerts, re-engagement, weekly insights, admin resets, T-017 self-probes, DSAR intake channel.
- **2026-07-14** — Root-cause identified via T-017 alerts (Amir got locked out personally, reported it). Password re-supplied to `BLUEHOST_SMTP_PASS`. IMAP cron repointed at the SMTP family — `BUGS_EMAIL_*` retired. Structural fix: one credential, both consumers.

