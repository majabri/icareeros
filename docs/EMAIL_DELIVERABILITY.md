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
