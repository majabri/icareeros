---
slug: cookies
lastUpdated: 2026-05-05
locale: en
---

# Cookie Policy

**Last updated:** 2026-05-05
**Effective:** [Date P0 PR ships]
**Version:** 1.0 (DRAFT — pending counsel review)


## 1. What cookies are

Cookies are small text files that a website places on your device. Similar technologies — local storage, session storage, pixels, SDKs — work the same way for the purposes of this policy and we treat them together as "**cookies**" below.

We use cookies to keep you signed in, remember your preferences, monitor errors, and (with your consent) measure how the Service is used so we can improve it.

---

## 2. How we ask for your consent

When you first visit `icareeros.com`, you see a **cookie banner** with three equally-prominent choices: **Reject all**, **Customize**, or **Accept all**. Strictly necessary cookies are always on (without them the Service cannot function). Functional, analytics, and marketing cookies are **off by default** and only set after you opt in.

You can change your choice at any time by clicking **Cookie preferences** in the footer of any page.

We re-prompt for consent every **12 months**, and immediately if our cookie usage materially changes.

We do not use "cookie walls" — i.e., we will not block access to the Service if you reject non-essential cookies.

---

## 3. Cookies we use

We group cookies into four categories. The lifetimes shown are typical; the actual values are observable in your browser's developer tools.

### 3.1 Strictly necessary (always on)

These are required for the Service to function and are exempt from consent under the ePrivacy Directive.

| Cookie | Set by | Purpose | Lifetime |
|---|---|---|---|
| `sb-access-token` | Supabase Auth | Authenticates your session | Session (refreshed periodically) |
| `sb-refresh-token` | Supabase Auth | Allows session refresh without re-login | ~1 week |
| `__Host-csrf` (or similar) | iCareerOS | CSRF protection on form submissions | Session |
| `_vercel_jwt` | Vercel | Edge routing and access control on protected routes | Short-lived |
| `cc_consent` | iCareerOS | Stores your cookie preferences | 12 months |

### 3.2 Functional (consent required)

These remember your choices to improve your experience.

| Cookie | Set by | Purpose | Lifetime |
|---|---|---|---|
| `i18n_lang` | iCareerOS | Remembers your language preference (en/es/fr/de) | 12 months |
| `theme` | iCareerOS | Remembers light/dark theme preference | 12 months |
| `last_route` | iCareerOS | Returns you to the last page in the Career OS cycle | 30 days |

### 3.3 Analytics (consent required)

These help us understand how the Service is used in aggregate. We do not use them to identify you personally or build a marketing profile.

| Cookie / SDK | Set by | Purpose | Lifetime |
|---|---|---|---|
| Vercel Analytics (when enabled) | Vercel | Aggregate page-view counts and core web vitals | Up to 24h, no persistent ID |
| Sentry session-replay (when enabled) | Sentry | Diagnostic replay on error events only, with PII masking | Up to 90 days on Sentry servers |

We do **not** currently use Google Analytics, Meta Pixel, LinkedIn Insight Tag, or similar advertising-focused trackers.

### 3.4 Marketing (consent required)

We do not currently use marketing cookies. If we add advertising or remarketing in the future, we will update this policy and re-prompt for consent **at least 30 days in advance**.

---

## 4. Third-party cookies

Some cookies are set by services we use (Supabase, Vercel, Sentry, Stripe). These third parties have their own privacy and cookie policies — links live in our **[Privacy Policy](/legal/privacy)** §6.1.

When you make a payment (when billing is live), Stripe sets cookies on the iframe used to collect card details. Those are essential to processing your payment securely.

---

## 5. Managing your preferences

You can manage cookie preferences in three ways:

1. **In the iCareerOS banner** — click "Cookie preferences" in the footer of any page to re-open the granular toggles.
2. **In your browser** — most browsers let you block cookies entirely or per-site. Doing this will disable strictly-necessary cookies and the Service will not work properly.
3. **Browser-level "Do Not Track" / GPC** — we honor the **Global Privacy Control (GPC)** signal where required by US state law (CCPA/CPRA, Colorado, Connecticut). When detected, we treat it as an opt-out of "sale" and "sharing" (we don't sell or share, but the signal is recorded for compliance).

Mobile and platform-level controls (iOS App Tracking Transparency, Android equivalent) apply when we ship native apps; the Service is currently web-only.

---

## 6. Changes to this policy

We update this policy when our cookie usage changes. Material changes are communicated by an updated banner prompt and an email to registered users **at least 30 days in advance**.

---

## 7. Contact

Questions about this policy: **privacy@icareeros.com**.
