# iCareerOS — UAT Checklist (Day 63)

**Test account:** `majabri714@gmail.com` / `FitCheck2026!`  
**Staging URL:** https://icareeros.vercel.app  
**Tested by:** Amir Jabri  
**Date:** ___________

---

## 0. Pre-flight

| # | Check | ✅ |
|---|---|---|
| 0.1 | Vercel deployment is green (no build errors) | |
| 0.2 | Supabase `kuneabeiwcxavvyyfjkx` is online (Health → API working) | |
| 0.3 | ANTHROPIC_API_KEY is set in Vercel env (Settings → Environment Variables) | |
| 0.4 | BLUEHOST_SMTP_* env vars are set (needed for email tests) | |
| 0.5 | SUPABASE_SERVICE_ROLE_KEY is set (needed for Admin panel) | |

---

## 1. Auth

| # | Action | Expected | ✅ |
|---|---|---|---|
| 1.1 | Visit `/auth/signup` — create a NEW test account | Redirects to `/dashboard` | |
| 1.2 | Check inbox for welcome email | Welcome email received | |
| 1.3 | Log out (↩ in nav) | Redirects to `/` | |
| 1.4 | Log back in with test account | Redirects to `/dashboard` | |
| 1.5 | Visit `/dashboard` while logged out (incognito) | Redirects to `/auth/login` | |

---

## 2. Career OS Dashboard

| # | Action | Expected | ✅ |
|---|---|---|---|
| 2.1 | Dashboard loads | Shows 6 stage cards (Evaluate → Achieve) | |
| 2.2 | Click "Evaluate" → fill profile form → Submit | Stage card shows AI response | |
| 2.3 | Click "Advise" → Trigger | AI career advice appears | |
| 2.4 | Click "Learn" → Trigger | Learning path recommendations appear | |
| 2.5 | Click "Act" → Trigger | Action plan appears | |
| 2.6 | Click "Coach" → Trigger | Coaching feedback appears | |
| 2.7 | Click "Achieve" → Trigger | Achievement milestones appear | |
| 2.8 | Cycle resets correctly after "Achieve" | New cycle shown | |

---

## 3. Jobs (/jobs)

| # | Action | Expected | ✅ |
|---|---|---|---|
| 3.1 | `/jobs` loads | Opportunity cards visible | |
| 3.2 | Search for "Product Manager" | Filtered results appear | |
| 3.3 | Click "Get Fit Score" on any card | Score % badge appears | |
| 3.4 | Click "Get Salary Range" | Salary estimate appears | |
| 3.5 | Click "Write Outreach" | Outreach email draft appears | |
| 3.6 | Click "Generate Cover Letter" | Cover letter modal opens | |
| 3.7 | Set a job alert (bell icon) | "Alert saved" confirmation | |

---

## 4. Interview Simulator (/interview)

| # | Action | Expected | ✅ |
|---|---|---|---|
| 4.1 | Enter role + company → Start | Questions stream in | |
| 4.2 | Type an answer → Submit | AI feedback appears | |
| 4.3 | Complete all questions | Feedback panel shown | |
| 4.4 | "View History" tab | Previous sessions listed | |

---

## 5. Resume Builder (/resume)

| # | Action | Expected | ✅ |
|---|---|---|---|
| 5.1 | Upload a PDF or paste text | Content parsed, preview shown | |
| 5.2 | Click "AI Rewrite" | Improved version appears | |
| 5.3 | Diff view shows changes | Before/after highlighted | |
| 5.4 | "Download .txt" | File downloads | |
| 5.5 | Version history shows previous uploads | History list visible | |

---

## 6. Offer Desk (/offers)

| # | Action | Expected | ✅ |
|---|---|---|---|
| 6.1 | "Add Offer" → fill form → Save | Offer card appears | |
| 6.2 | Click "Get Negotiation Strategy" | Strategy panel opens | |
| 6.3 | Edit offer | Updates saved | |
| 6.4 | Delete offer | Offer removed | |

---

## 7. Recruiter Assistant (/recruiter)

| # | Action | Expected | ✅ |
|---|---|---|---|
| 7.1 | Paste a job description (50+ chars) | "Analyse" button enables | |
| 7.2 | Click "Analyse Job Description" | Analysis panel appears with must-haves, screening Qs | |
| 7.3 | Short JD (<50 chars) | Analyse button stays disabled | |

---

## 8. Support (/support)

| # | Action | Expected | ✅ |
|---|---|---|---|
| 8.1 | Submit a support ticket | "Submitted" confirmation | |
| 8.2 | Ticket appears in "My Tickets" list | Status: open | |

---

## 9. Settings

| # | Action | Expected | ✅ |
|---|---|---|---|
| 9.1 | `/settings/email` → toggle weekly insights | Preference saved | |
| 9.2 | `/settings/account` → "Export my data" | JSON file downloads | |
| 9.3 | `/settings/billing` loads | Plan shown correctly | |

---

## 10. Admin (/admin) — use admin account

| # | Action | Expected | ✅ |
|---|---|---|---|
| 10.1 | `/admin` loads (logged in as admin) | Analytics cards visible | |
| 10.2 | Feature flags panel | Flags togglable | |
| 10.3 | Open tickets panel | Support tickets listed | |
| 10.4 | User table | Users with plan shown | |

---

## 11. i18n / Language

| # | Action | Expected | ✅ |
|---|---|---|---|
| 11.1 | Switch to Spanish (ES) | Nav labels switch to Spanish | |
| 11.2 | Switch to French (FR) | Nav labels switch to French | |
| 11.3 | Switch to German (DE) | Nav labels switch to German | |
| 11.4 | Switch back to English (EN) | Labels restored | |

---

## 12. Accessibility & Mobile

| # | Action | Expected | ✅ |
|---|---|---|---|
| 12.1 | Tab through landing page | Focus ring visible on all interactive elements | |
| 12.2 | Press Tab → "Skip to main content" appears | Skip link visible on focus | |
| 12.3 | Resize to 375px viewport | Nav collapses gracefully, no overflow | |
| 12.4 | Dashboard at 375px | Cards stack vertically | |

---

## 13. Security & Errors

| # | Action | Expected | ✅ |
|---|---|---|---|
| 13.1 | `curl -I https://icareeros.vercel.app` | `X-Frame-Options: DENY` in response headers | |
| 13.2 | POST to `/api/recruiter` without auth | 401 Unauthorized | |
| 13.3 | `/dashboard` in incognito | Redirects to login | |

---

## UAT Sign-off

| Item | Status |
|---|---|
| All P0 checks (Auth, Dashboard, Jobs) | ☐ Pass / ☐ Fail |
| All P1 checks (Interview, Resume, Offers) | ☐ Pass / ☐ Fail |
| All P2 checks (Admin, i18n, a11y) | ☐ Pass / ☐ Fail |
| **Overall: Ready for DNS cutover?** | ☐ Yes / ☐ No — see bugs below |

### Bugs found during UAT

| # | Page | Description | Severity |
|---|---|---|---|
| | | | |

---

*Generated by iCareerOS Day 63 UAT — icareeros.com*
