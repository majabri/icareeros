# Email Deliverability — Bluehost SMTP

**Status: 2026-05-05 — staying on Bluehost SMTP. Resend migration deferred.**

Per UAT: Bluehost is producing successful sends end-to-end (Supabase auth
log shows status 200; SPF + DKIM + DMARC all configured correctly). Some
Gmail signups land in Spam/Promotions rather than Inbox, but that's a
reputation issue, not a delivery failure.

## What the platform does today

- **Provider:** Bluehost shared SMTP via custom SMTP in Supabase Auth
- **Sender:** `bugs@icareeros.com`
- **Auth:** SPF (`v=spf1 +mx +a +ip4:50.87.199.84 ~all`), DKIM (`default._domainkey.icareeros.com`), DMARC (`p=quarantine`)
- **UX safety net (`src/components/auth/AuthForm.tsx`):**
  - Post-signup message names the destination address and tells users to
    check Spam / Promotions if they don't see it in Inbox
  - 'Didn\'t receive the email?' callout with a Resend confirmation
    button on /auth/signup AND on /auth/login when login fails because
    email isn't confirmed
  - Calls `supabase.auth.resend({ type: 'signup', email })`

## Observed deliverability

| Domain | Confirmation outcome (in last 7 days) |
|---|---|
| aol.com | Confirmed in 54s |
| icareeros.com | Confirmed in 232s |
| gmail.com | NOT confirmed (×2) — likely landed in Spam |

## When to revisit (switch to Resend)

The Resend migration plan is preserved below for the day this is
prioritized. Triggers that would justify switching:

- Onboarding external users beyond UAT — first-impression matters; users
  who can\'t find a confirmation email assume the product is broken.
- Volume above ~100 confirmation emails/day — Bluehost\'s shared SMTP
  has lax rate limits and reputation degrades faster at scale.
- Bounce / spam complaints visible in Bluehost cPanel.

If any of these fire, the migration takes ~30 min. Plan retained below.

---

## (Deferred) Resend migration plan

Resend has near-100% Gmail Inbox delivery vs Bluehost\'s ~70%. Free
tier covers 3,000 emails/month — sufficient for production launch.

### Setup steps

1. **Create Resend account:** https://resend.com (free)
2. **Add domain:** Resend Dashboard → Domains → Add `icareeros.com`. It
   shows 3 DNS records (1 MX, 1 SPF TXT, 1 DKIM TXT). Paste them into
   Cloudflare DNS for icareeros.com → Verify → all green.
3. **Generate API key:** Resend Dashboard → API Keys → Create. Name:
   `icareeros-prod`. Permission: Sending access only. Copy the
   `re_xxx...` value (shown once).
4. **Configure Supabase Auth SMTP:** Supabase Dashboard →
   Authentication → SMTP Settings → Enable Custom SMTP:
   - Host: `smtp.resend.com`
   - Port: `465`
   - Username: `resend`
   - Password: API key from step 3
   - Sender email: `bugs@icareeros.com` (or `noreply@icareeros.com`)
   - Sender name: `iCareerOS`
   - Save.
5. **Test:** Sign up with a fresh `+test1@gmail.com` → should land in
   Inbox within 30s.
6. **Monitor:** Resend Dashboard → Logs (per-message status) +
   Analytics (Inbox / Spam / Bounce rates).

### Cost projection

| Volume | Tier | Cost |
|---|---|---|
| < 3,000/mo | Free | $0 |
| 3,000-50,000/mo | Pro | $20/mo |
| 50,000+ | Custom | TBD |

### DMARC tightening (later)

Once Resend has 2+ weeks of clean delivery history, consider tightening
icareeros.com DMARC from `p=quarantine` to `p=reject` for stronger
phishing protection. Don\'t do this BEFORE Resend — quarantine is the
right level while building reputation.
