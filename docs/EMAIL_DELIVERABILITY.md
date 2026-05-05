# Email Deliverability — Migrate from Bluehost SMTP to Resend

## The problem

Account-confirmation emails reliably reach `aol.com` and `icareeros.com`
addresses but get silently filtered or sent to Spam by Gmail. Pattern
verified in production (May 2026):

| Domain          | Confirmed? |
|-----------------|------------|
| aol.com         | ✓ (54 sec) |
| icareeros.com   | ✓ (232 sec) |
| gmail.com       | ❌ never (multiple addresses)  |

**Root cause:** the icareeros.com domain has correct SPF + DKIM + DMARC
on paper, but Bluehost's shared SMTP IPs have weak sender reputation
with Gmail. New domains routed through low-reputation shared IPs land
in Spam ~80% of the time.

## The fix — switch to Resend

Resend is a modern transactional-email service. It owns reputable IP
ranges, signs every message with DKIM aligned to your domain, and
publishes deliverability stats. Free tier covers UAT and early
production at no cost.

| | Bluehost SMTP | Resend |
|---|---|---|
| Inbox delivery (Gmail) | ~60–80% | ~99% |
| Free tier | Bundled w/ hosting | 3,000 emails/mo, 100/day |
| Setup time | Already done (broken) | ~30 min |
| Dedicated IP option | ❌ | ✓ ($20/mo plan) |

## Setup steps

### 1. Create the Resend account
- Sign up at https://resend.com (free)
- Verify your account email

### 2. Add the icareeros.com domain
- Resend Dashboard → Domains → Add Domain → enter `icareeros.com`
- Resend shows 3 DNS records:
  - 1× MX (for return-path / bounce handling)
  - 1× TXT (SPF — `v=spf1 include:amazonses.com ~all` or similar)
  - 1× TXT (DKIM — `resend._domainkey ...`)
- Add all three to Cloudflare DNS for `icareeros.com`
- Click **Verify** in Resend → wait ~2 min → all green

### 3. Generate an API key
- Resend Dashboard → API Keys → **Create API Key**
- Name: `icareeros-prod`
- Permission: **Sending access** only
- Copy the key (`re_xxx...`) — shown once

### 4. Configure Supabase Auth to use Resend SMTP
- Open Supabase Dashboard → Authentication → SMTP Settings
- Enable Custom SMTP
- Fill in:
  - **Host:** `smtp.resend.com`
  - **Port:** `465`
  - **Username:** `resend`
  - **Password:** your API key from step 3
  - **Sender email:** `noreply@icareeros.com` (or `bugs@icareeros.com` to match current)
  - **Sender name:** `iCareerOS`
- Save

### 5. Update Vercel env vars (optional cleanup)
The app code doesn't directly send transactional emails — Supabase Auth
handles it. But we have these legacy Bluehost vars from when we tested:
- `BLUEHOST_SMTP_HOST`
- `BLUEHOST_SMTP_PORT`
- `BLUEHOST_SMTP_USER`
- `BLUEHOST_SMTP_PASS`

Action: rename to `EMAIL_SMTP_*` once Resend is the primary, then
swap values. Keep Bluehost configured on the cPanel side as a backup
MX for inbound mail to `bugs@icareeros.com`.

### 6. Test
- Go to /auth/signup
- Sign up with a fresh `+test1@gmail.com` Gmail address
- Check Gmail Inbox (NOT Spam) — should arrive within 30 sec
- Click confirm link → should land on /auth/confirmed

### 7. Monitor
- Resend Dashboard → Logs — see every email sent + delivery status
- Resend Dashboard → Analytics — Inbox vs Spam vs Bounce rates

## DMARC tuning (separate task)

Current DMARC: `p=quarantine; pct=100`. Once Resend is live and
deliverability is proven for 2 weeks, consider tightening to
`p=reject` for stronger phishing protection. Don't do this BEFORE
Resend — quarantine is the right level while building reputation.

## Cost projection

| Volume | Resend tier | Cost |
|---|---|---|
| < 3,000/mo (UAT phase) | Free | $0 |
| 3,000–50,000/mo (growth) | Pro | $20/mo |
| 50,000+ (scale) | Custom | TBD |
