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
| SMTP port | `465` (SSL) |
| IMAP port | `993` (SSL) — same mailbox, read path (bug-inbox cron) |
| Auth username | `bugs@icareeros.com` (the actual existing Bluehost mailbox) |
| Display From — Node mailer (`ALERT_FROM_EMAIL`) | `noreply@icareeros.com`, wrapped as `iCareerOS <noreply@icareeros.com>` |
| Display From — Supabase Auth (`smtp_admin_email`) | **recommended: `bugs@icareeros.com`** (see [Sender address](#sender-address-smtp_admin_email) below) |
| Display name (`smtp_sender_name`) | `NoReply iCareerOS` |

`BLUEHOST_SMTP_USER` and `ALERT_FROM_EMAIL` are intentionally distinct — the SMTP auth user must be a real mailbox (`bugs@`), while the visible "From" can be any address the relay accepts. Node mailer wraps with a display name so the raw address matches auth (`iCareerOS <bugs@…>`). Supabase Auth's GoTrue does NOT do the same wrapping — its `smtp_admin_email` is the raw From. See caveat below.

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

### The three-store model — one mailbox, three copies of the password

`bugs@icareeros.com` is ONE Bluehost mailbox. Its password lives in **three** places that must all match:

| Store | What it powers | How to update |
|---|---|---|
| **Bluehost cPanel** | the mailbox itself (source of truth) | Bluehost cPanel → Email Accounts → change password |
| **Vercel** `BLUEHOST_SMTP_PASS` | `src/lib/mailer.ts` — job alerts, digests, admin resets, DSAR intake, T-017 probe, bug-inbox IMAP | Vercel dashboard **or** management API (see [Env var reference](#env-var-reference)) |
| **Supabase Auth** `smtp_pass` | GoTrue — password reset, signup confirm, magic link | Supabase dashboard **or** management API (see [Supabase management API gotchas](#supabase-management-api-gotchas)) |

**Missing any one → silent multi-week outage.** This exact split caused the 33-day outage documented at the bottom of this file: the IMAP-side copy of the password got rotated in June, the SMTP-side didn't, all outbound email silently EAUTH-535'd for 33 days.

Order for a rotation:

1. Rotate in **Bluehost cPanel** (source of truth).
2. Update **Vercel** `BLUEHOST_SMTP_PASS`.
3. Update **Supabase Auth** `smtp_pass`.
4. Run the [verification checks below](#verification-after-rotation).

### Verification after rotation

#### 1. Fingerprint check — do Vercel and Supabase actually match?

The Vercel value is readable by-ID (encrypted type). The Supabase value reads back as **`SHA-256(plaintext).hex()`** — 64 chars. Compare the two:

```bash
# Fetch Supabase mgmt token via by-ID (see docs/COWORK_TOKEN_FETCH.md)
VCP=<vercel-token>
SBP=$(curl -s -H "Authorization: Bearer $VCP" \
  "https://api.vercel.com/v1/projects/icareeros/env/RLOeBdRQBBPVk8zb" \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["value"])')

# Compute SHA256 of Vercel's BLUEHOST_SMTP_PASS
VERCEL_HASH=$(curl -s -H "Authorization: Bearer $VCP" \
  "https://api.vercel.com/v1/projects/icareeros/env/zydLa4Et5tYDu44k" \
  | python3 -c 'import sys,json,hashlib; \
    v=json.load(sys.stdin)["value"]; \
    print(hashlib.sha256(v.encode()).hexdigest())')

# Fetch Supabase Auth smtp_pass (already the hash of the stored plaintext)
SUPABASE_HASH=$(curl -s --user-agent "curl/8.0" -H "Authorization: Bearer $SBP" \
  "https://api.supabase.com/v1/projects/kuneabeiwcxavvyyfjkx/config/auth" \
  | python3 -c 'import sys,json; print(json.load(sys.stdin).get("smtp_pass",""))')

# Compare
[ "$VERCEL_HASH" = "$SUPABASE_HASH" ] && echo "✓ MATCH" || echo "✗ MISMATCH"
```

**Do NOT mistake the 64-char Supabase value for a stale credential.** It's not the password; it's `SHA256(password).hex()`. This was proven with a sentinel test 2026-07-14: PATCH-ing `smtp_pass: "SENTINEL_TEST_1234"` produced a different 64-char hash on read than PATCH-ing the real password. Same-input-always-same-hash. Different inputs yield different hashes.

#### 2. Live end-to-end — T-017 probe

Trigger the SMTP health probe (Vercel dashboard → Crons → `/api/cron/smtp-health-check` → Run Now), wait ~30s, then query:

```sql
SELECT created_at, event_type, payload->>'error' AS error
FROM public.infrastructure_events
WHERE source = 'smtp-cron'
ORDER BY created_at DESC LIMIT 1;
```

Expected: `event_type = 'smtp.ok'`. If `smtp.send_failed` with `error_code = 'EAUTH'`, the password does not match on the Vercel side. Fix Vercel `BLUEHOST_SMTP_PASS`, re-run.

Note: `smtp.ok` only confirms Vercel-side send. It does **not** confirm Supabase Auth's side. See fingerprint check above for that.

### Supabase management API gotchas

These four cost several hours during the 2026-07-14 recovery. Document all four so the next rotation is a checklist, not a debug session.

#### 1. Atomic config block — always send the FULL SMTP + rate-limit set

`PATCH /v1/projects/{ref}/config/auth` treats the SMTP block **atomically**. Sending a partial body (e.g. just `smtp_pass`) wipes **every unmentioned field** to default. On 2026-07-14 this wiped the whole SMTP block (Supabase silently fell back to `noreply@mail.app.supabase.io`) **and** collapsed `rate_limit_email_sent` from 300 down to 2 (users hit "email rate limit exceeded" after 1–2 sends).

**Always send the complete block together.** Known-good PATCH body (replace `<PLAINTEXT_PASSWORD>` at send time — never commit the real value):

```json
{
  "smtp_admin_email":     "bugs@icareeros.com",
  "smtp_sender_name":     "NoReply iCareerOS",
  "smtp_host":            "mail.icareeros.com",
  "smtp_port":            "465",
  "smtp_user":            "bugs@icareeros.com",
  "smtp_pass":            "<PLAINTEXT_PASSWORD>",
  "smtp_max_frequency":   60,
  "rate_limit_email_sent": 300
}
```

#### 2. `smtp_port` must be a STRING

`"smtp_port": 465` (integer) returns `HTTP 400 {"message":"smtp_port: Expected string, received number"}`. Use `"smtp_port": "465"`.

#### 3. Cloudflare blocks Python-`urllib`

`api.supabase.com` returns `HTTP 403` with body `error code: 1010` (Cloudflare WAF fingerprint block) to the default `Python-urllib/*` user-agent. Use `curl` (its default UA `curl/*` passes) **or** set a browser-like `User-Agent` header explicitly. The by-ID `GET` calls, `execute_sql` calls, and edge-function deploys all work fine — the block appears to hit specifically on Python's default UA.

#### 4. Auth logs are dashboard-only

`auth.audit_log_entries` is **empty** on this project (verified: 0 rows lifetime as of 2026-07-14). GoTrue's actual SMTP send outcomes — success, EAUTH, rate-limit rejects — are only visible via **Supabase Dashboard → Project → Logs → Auth Logs**. Filter for `smtp` to see send events. No public API endpoint exposes this stream (`/v1/projects/.../analytics/endpoints/auth.logs` returns 404).

### Rate limit note — `rate_limit_email_sent` must be 300

The project runs with `rate_limit_email_sent: 300` (bumped from the default in May 2026 to survive the auth-lockout `/token` storm). If it silently drops — the most common cause is a partial PATCH per gotcha #1 above — users hit "email rate limit exceeded" after just 1–2 sends. Verify after **any** auth-config change:

```bash
curl -s --user-agent "curl/8.0" -H "Authorization: Bearer $SBP" \
  "https://api.supabase.com/v1/projects/kuneabeiwcxavvyyfjkx/config/auth" \
  | python3 -c 'import sys,json; print(json.load(sys.stdin).get("rate_limit_email_sent"))'
# Expected: 300
```

If it comes back as `2`, `4`, or `30` (any small integer), PATCH the full atomic block above with `"rate_limit_email_sent": 300` included.

### Sender address (`smtp_admin_email`)

**Recommended value: `bugs@icareeros.com`** — the real, auth-matching mailbox.

`smtp_sender_name` provides the friendly display name (`NoReply iCareerOS`), which is what most email clients render prominently. Recipients see `NoReply iCareerOS <bugs@icareeros.com>`.

**Do NOT set `smtp_admin_email` to a non-existent mailbox** like `NoReply@icareeros.com` unless it's confirmed to exist on Bluehost. Two failure modes to be aware of:

- Some relays enforce **From = auth-user**. Bluehost is lenient today, but that can change.
- Even if the relay accepts a mismatched From, bounces route to the From-address. If it's not a real mailbox, bounce reports go nowhere.

Node mailer sidesteps this by wrapping the display name in the From header (`iCareerOS <bugs@…>`), so the raw address matches auth. Supabase Auth's GoTrue does not do the same wrapping — whatever's in `smtp_admin_email` is the raw From. Keep it as the real mailbox.

### Env var reference

The five consolidated Vercel env vars for the mailbox — all `encrypted` type, all readable by-ID (see `docs/COWORK_TOKEN_FETCH.md § Bluehost mailbox credentials`):

| Var | Vercel env-var id | Value |
|---|---|---|
| `BLUEHOST_SMTP_HOST` | `d9HUPM4xWFXwGba6` | `mail.icareeros.com` |
| `BLUEHOST_SMTP_USER` | `m47hCh0LIX6Isv4n` | `bugs@icareeros.com` |
| `BLUEHOST_SMTP_PASS` | `zydLa4Et5tYDu44k` | (12-char credential — do not commit) |
| `BLUEHOST_SMTP_PORT` | `E96rFhN8KoaWwoh5` | `465` |
| `BLUEHOST_IMAP_PORT` | `h8TILJiwURdEJRTo` | `993` |

`ALERT_FROM_EMAIL` (`VC2eD4zmdmxMXRXt`, `plain` type, `noreply@icareeros.com`) is the display From for the Node mailer only — NOT a credential.

**Historical note:** the `BUGS_EMAIL_*` env-var family (which powered the IMAP read path) was deleted 2026-07-14 (PR #376). Both SMTP send and IMAP read now use the single `BLUEHOST_SMTP_*` family. See migration history at the bottom of this file.

### Still-open items

- **Bluehost `cloudfilter` rewrites `Message-ID` after DKIM signing.** DKIM signature validation fails on receiving servers; mail may land in spam. Ticket open with Bluehost as of the June-July 2026 outage cycle. This is the one genuine Bluehost-side issue we have no fix for on our end. Session memory: `feedback_bluehost_cloudfilter_breaks_dkim`.
- **BIMI record pending** — SPF and DMARC are aligned, DKIM breaks in transit (see above). BIMI to be published after `p=reject` soak is confirmed stable (>30 days of clean forensic reports).

### Migration history — the drift that caused the 2026 outage

- **2026-04-29** — `BLUEHOST_SMTP_*` family created for the send path (nodemailer via `src/lib/mailer.ts`).
- **2026-05-13** — Separate `BUGS_EMAIL_*` family created for the IMAP read path (bug-inbox cron). Same mailbox, second copy of credentials, nothing kept them in sync.
- **2026-05-26** — `rate_limit_email_sent` bumped from default to 300 to survive `/token` storm (memory: `project_auth_rate_limits_bumped_2026-05-26`).
- **2026-06-23** — Mailbox password rotated in Bluehost. `BUGS_EMAIL_PASSWORD` updated (IMAP kept working). **`BLUEHOST_SMTP_PASS` was NOT updated.** All outbound email started silently failing with `EAUTH 535`.
- **33 days** of dead email flows: password resets, signup confirmations, job alerts, re-engagement, weekly insights, admin resets, T-017 self-probes, DSAR intake channel.
- **2026-07-14** — Root cause identified via T-017 alerts (Amir got locked out personally, reported it). Vercel `BLUEHOST_SMTP_PASS` corrected. IMAP cron repointed at the SMTP family (PR #376) — `BUGS_EMAIL_*` family retired. Structural fix in code: one credential, both consumers.
- **2026-07-14** (later) — Supabase Auth `smtp_pass` rotation via management API surfaced four gotchas (see [Supabase management API gotchas](#supabase-management-api-gotchas)). Partial PATCH silently wiped the SMTP block and collapsed `rate_limit_email_sent` from 300 → 2, causing "email rate limit exceeded" errors on resend. Fixed atomically.
