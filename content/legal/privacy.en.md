---
slug: privacy
lastUpdated: 2026-05-05
locale: en
---

# Privacy Policy

**Last updated:** 2026-05-05
**Effective:** [Date P0 PR ships]
**Version:** 1.0 (DRAFT — pending counsel review)


## 1. Who we are

iCareerOS ("**iCareerOS**", "**we**", "**us**", "**our**") is a career operating system that helps you evaluate your career, get advice, learn new skills, take action, receive coaching, and achieve career goals. The service is operated by **iCareerOS LLC**, a Michigan-registered limited liability company.

Contact us about this policy:

- Privacy questions and data subject requests: **privacy@icareeros.com**
- Legal notices: **legal@icareeros.com**
- EU GDPR contact: **dpo@icareeros.com**

For the purposes of EU/UK GDPR, **iCareerOS LLC is the data controller** for personal data we process about you when you use iCareerOS as an end user. When iCareerOS is used by an employer or recruiter to evaluate you (B2B customers, when launched), we may act as a processor on the employer's instructions; in that case the employer is the controller and you should also consult their privacy notice.

---

## 2. Scope of this policy

This policy explains how we collect, use, share, and protect personal data when you:

- visit `icareeros.com` or any subdomain;
- create an iCareerOS account or sign in;
- import a résumé, edit your career profile, or use any feature in the Career OS cycle (Evaluate → Advise → Learn → Act → Coach → Achieve);
- contact us via email or in-app support.

It does **not** apply to third-party websites we link to (each has its own policy) or to data you provide directly to an employer that uses iCareerOS as a customer (their privacy notice governs).

---

## 3. What personal data we collect

### 3.1 Data you give us directly

| Category | Examples | Where in the product |
|---|---|---|
| Account identity | Name, email, phone, password (hashed), avatar | Sign up; `/settings/account` |
| Career identity | Headline, summary, current location, LinkedIn URL, work history, education, certifications, skills, portfolio links | `/mycareer/profile` |
| Résumé content | Uploaded résumé file (PDF/DOCX/DOC/TXT) and the parsed structured fields, plus the original raw text | `/mycareer/profile` import |
| Job-search activity | Saved jobs, job descriptions you paste in for fit-checks, application tracking notes | `/jobs`, `/resume` |
| Coaching & interview content | Mock interview transcripts, AI-generated feedback you save, cover letters, outreach messages | `/interview`, `/resume`, etc. |
| Preferences | Search criteria, target roles, salary range, locations, plan preferences | `/mycareer/preferences`, `/settings/email` |
| Support & feedback | Support tickets you submit, free-text feedback | `/settings/support` |
| Payment information | Card details are collected directly by **Stripe**; we never see or store full card numbers. We retain a Stripe customer ID and last-four/brand for receipts only. (When billing is enabled.) | `/settings/billing` |

### 3.2 Data we collect automatically

| Category | Examples | Purpose |
|---|---|---|
| Device & log data | IP address, browser type, OS, language, referrer, timestamps, page URLs, errors | Operate, secure, and debug the service |
| Cookies & similar | Session cookies (auth), functional cookies, optional analytics cookies — see Cookie Policy | See Cookie Policy |
| AI interaction logs | Inputs, model outputs, latency, success/failure, anonymized identifiers | Improve quality, debug, monitor cost. We **do not use your inputs to train Anthropic's foundation models** — see §6.3. |

### 3.3 Data from third parties

We currently do not buy personal data from data brokers or enrich your profile from third-party sources. If we add a feature that does (for example, public LinkedIn enrichment), we will update this policy and notify you in advance.

### 3.4 Sensitive categories (special category data under GDPR)

iCareerOS is **not designed** to collect special category data (racial or ethnic origin, political opinions, religious beliefs, trade-union membership, genetic data, biometric data, health data, sex life, sexual orientation). You should not enter such data into your profile, résumé, or chat with our AI features. If we discover special-category data in your account, we will treat it under GDPR Art. 9 protections and you may request its deletion.

We **do not** collect biometric identifiers (face geometry, voiceprints, fingerprints). If we ever add a video-interview feature that processes such data, we will require your explicit consent first and update this policy.

### 3.5 Children's data

iCareerOS is not intended for users under **16 years of age** (or the higher digital-consent age in your country). We do not knowingly collect data from children. If you believe a child has provided us data, contact privacy@icareeros.com and we will delete it.

---

## 4. Why we process your data — and our lawful basis

| Purpose | Lawful basis (GDPR) | CCPA "business purpose" |
|---|---|---|
| Provide the service you signed up for (account, profile, AI coaching, job matching) | Contract (Art. 6(1)(b)) | Performing services |
| Send transactional emails (verification, password reset, billing receipts, security alerts) | Contract (Art. 6(1)(b)) | Performing services |
| Send marketing emails | Consent (Art. 6(1)(a)) — separate opt-in | (Disclosed; you may opt out at any time.) |
| Improve the product, debug errors, monitor performance | Legitimate interests (Art. 6(1)(f)) | Quality assurance, security |
| Detect and prevent fraud or abuse | Legitimate interests (Art. 6(1)(f)) | Security |
| Comply with legal obligations (tax, subpoenas, regulator requests) | Legal obligation (Art. 6(1)(c)) | Legal obligations |
| Anonymized aggregate analytics for business reporting | Legitimate interests (Art. 6(1)(f)) | Internal analytics |

You can object to any "legitimate interests" processing — see §9.

---

## 5. AI and automated decision-making

iCareerOS uses AI extensively. **You have a right to know how it works and to ask for a human review.** A more detailed disclosure lives at `https://icareeros.com/legal/ai-disclosure`. The summary:

- Models we use: Anthropic Claude (Sonnet 4.6 for most reasoning, Haiku 4.5 for lightweight tasks). Specific model used per feature is documented in the AI disclosure.
- Where AI is involved: résumé parsing, fit-score generation, cover-letter drafting, interview simulation, career-path advice, recruiter screening assistance, support-ticket classification.
- **No fully automated decision has legal or similarly significant effects on you within iCareerOS.** Fit scores and recommendations are advisory; they do not auto-reject candidates or auto-accept job applications.
- When iCareerOS is used by employer customers (B2B, future), the employer remains responsible for human review of any hiring decision. We will require this contractually.
- You can request a human review of any AI output that materially affects you (e.g., a fit score) by emailing privacy@icareeros.com.

We treat hiring/career AI as **high-risk under EU AI Act Annex III §4** and design accordingly.

---

## 6. Who we share your data with

We do not sell your personal data. We share it only with the categories below.

### 6.1 Service providers (sub-processors)

We rely on the following sub-processors. The current list, country, and purpose is maintained at `https://icareeros.com/legal/subprocessors` (P1 — pending). As of this version:

| Sub-processor | What they process | Where | Why |
|---|---|---|---|
| **Supabase** | Database, authentication, storage | US | Core data storage |
| **Vercel** | Application hosting, edge logs | US | Hosting |
| **Anthropic** | Prompts and completions for Claude models | US | AI features |
| **Perplexity** | Search queries for live job/market data | US | Job search enrichment |
| **Langfuse** | LLM trace metadata for debugging | US (EU region available) | LLM observability |
| **Sentry** | Error events (PII-scrubbed) | US | Error monitoring |
| **BetterStack** | Uptime probes, log drain | EU | Reliability monitoring |
| **Bluehost SMTP** | Outbound transactional email | US | Transactional email |
| **Stripe** *(when billing live)* | Payment information, customer records | US/IE | Payments |

We sign data-processing agreements with each sub-processor where required, and they are bound to use your data only on our instructions and consistent with this policy.

### 6.2 Other recipients

- **Employers and recruiters (when B2B is live)** — only data you explicitly choose to share with them (e.g., when applying for a job through iCareerOS).
- **Legal and regulatory bodies** — when required by law (subpoena, court order, regulator request) we may disclose data, and we will notify you unless legally prohibited.
- **Acquirers** — if iCareerOS is acquired or merged, your data may transfer to the successor entity. Successor will be bound by terms at least as protective as this policy, and we will notify you.
- **Aggregated / anonymized data** — we may share data that has been aggregated or de-identified such that it can no longer reasonably be linked to you, without restriction.

### 6.3 What we do NOT do

- We do **not** sell your personal data (CCPA/CPRA "sale" or "share").
- We do **not** rent, license, or trade your data with third-party advertisers.
- We do **not** allow Anthropic, Supabase, or our other sub-processors to use your data to train their general-purpose models. (This is a contractual default for paid Anthropic API customers and is the standard for our other vendors. We verify periodically.)
- We do **not** match you to jobs based on protected characteristics (race, gender, age, religion, etc.). Profile fields used for matching are skills, experience, education, location, and stated preferences.

---

## 7. International data transfers

iCareerOS is hosted in the **United States** (Vercel + Supabase US regions). If you access iCareerOS from the EU, UK, Canada, or any other jurisdiction, your data is transferred to the US.

We rely on the following transfer safeguards under GDPR Chapter V:

- **EU/UK Standard Contractual Clauses (SCCs)** with each US-based sub-processor.
- **Supplementary measures** including encryption in transit (TLS 1.3) and at rest (AES-256), and minimum-necessary access controls.
- **Transfer Impact Assessments (TIAs)** completed prior to onboarding each US sub-processor and revisited periodically.

You may request a copy of the relevant SCCs by emailing privacy@icareeros.com.

---

## 8. How long we keep your data

| Data | Retention |
|---|---|
| Active account profile data | While your account is active |
| Account marked for deletion | Soft-deleted for 30 days, then hard-deleted (so you can recover from accidental deletion) |
| Résumé raw text (`career_profiles.raw_text`) | 90 days from last update; structured fields are retained for the life of the account |
| Job-search activity, saved jobs | While account active |
| AI interaction logs (Langfuse) | 90 days |
| Error logs (Sentry) | 90 days |
| Support tickets | 2 years from resolution (for quality and dispute resolution) |
| Billing records (Stripe + our records) | 7 years (US tax and accounting requirement) |
| Email engagement / suppression list | While email program active; suppression list is permanent unless you re-subscribe |
| Marketing consent records | 3 years after withdrawal (to prove past consent was valid) |

When the retention period ends, data is hard-deleted from primary systems and removed from backups in the next backup-rotation cycle (typically within 35 days).

---

## 9. Your rights

Subject to local law, you have the following rights regarding your personal data:

| Right | What it means | How to exercise |
|---|---|---|
| **Access** | Get a copy of the personal data we hold about you | Use the export tool at `/settings/account` or email privacy@icareeros.com |
| **Rectification** | Correct inaccurate or incomplete data | Edit on `/settings/account` and `/mycareer/profile`; or email us |
| **Erasure ("right to be forgotten")** | Delete your account and personal data | Use "Delete account" at `/settings/account` or `/settings/security`; or email us |
| **Restriction** | Limit processing in certain cases | Email privacy@icareeros.com |
| **Objection** | Object to processing based on legitimate interests, including profiling | Email privacy@icareeros.com |
| **Portability** | Receive your data in a portable format (JSON) | Use `/settings/account` data export, or email us |
| **Withdraw consent** | Withdraw any consent you previously gave (e.g., marketing) | Email link in every marketing email; banner re-prompt for cookies; email privacy@icareeros.com |
| **Lodge a complaint** | Complain to a supervisory authority | EU/UK: your local DPA. US: your state Attorney General. We'd appreciate a chance to resolve first. |

**California-specific rights (CCPA/CPRA, when threshold is met):** in addition to the above, you may request to know the specific pieces of personal information collected about you in the past 12 months, the categories of sources, the purposes, and the categories of third parties to whom we disclosed it; you may opt out of "sale" or "sharing" (we do not sell or share, but the toggle is provided at `/settings/account` for completeness); you may not be discriminated against for exercising any right. Designated agents may submit requests on your behalf with verifiable proof of authorization.

**Quebec residents (Law 25):** you also have the right to be informed of decisions made exclusively by automated processing, the right to data portability in a structured commonly-used technological format, and the right to data localization information for transfers outside Quebec.

We will respond within **30 days** (GDPR / Law 25) or **45 days** (CCPA, extendable once by 45 days) of receiving a verifiable request. We may need to verify your identity before fulfilling.

---

## 10. Security

We protect your data through layered controls:

- TLS 1.3 in transit; AES-256 at rest (Supabase default).
- Row-level security (RLS) on every user-facing database table.
- Role-based access for our own staff; "principle of least privilege."
- Hashed passwords (bcrypt via Supabase Auth).
- Error and uptime monitoring with PII scrubbing.
- Regular security review of new features.

No system is perfectly secure. If we ever discover a personal-data breach that is likely to result in a risk to your rights and freedoms, we will notify the relevant supervisory authority within 72 hours and notify affected users without undue delay, as required by GDPR Art. 33–34.

---

## 11. Cookies

See our **[Cookie Policy](/legal/cookies)** for the full list of cookies, what they do, and how to manage them. Briefly: strictly necessary cookies are always on; functional, analytics, and marketing cookies are off by default and require your consent.

---

## 12. Changes to this policy

We may update this policy from time to time. Material changes (those that meaningfully affect your rights or how we use your data) will be communicated by email and an in-app notice **at least 30 days before they take effect**. Non-material changes (clarifications, formatting, vendor name corrections) take effect on posting. The "Last updated" date at the top always reflects the latest version. Past versions are available on request.

---

## 13. Region-specific addenda

### 13.1 European Economic Area, United Kingdom

The iCareerOS LLC contact above acts as the GDPR controller. Until we appoint a formal EU representative under Art. 27 (required when we have substantial EU users or systematic monitoring), `dpo@icareeros.com` is the contact for EU residents. Your local supervisory authority list is at `edpb.europa.eu`.

### 13.2 United Kingdom

For UK residents, the Information Commissioner's Office (ICO) is the supervisory authority. You may complain to them at `ico.org.uk`.

### 13.3 California (CCPA/CPRA)

In the past 12 months, we collected the categories of personal data listed in §3 for the purposes listed in §4, and disclosed those categories to the sub-processors listed in §6.1 for the same purposes. We have not sold or shared personal information for cross-context behavioral advertising.

### 13.4 Other US states

If you reside in Colorado, Connecticut, Virginia, Utah, Texas, or another state with a comprehensive privacy law that grants you rights, those rights are honored equivalently to the CCPA rights described above. Email privacy@icareeros.com to exercise them.

### 13.5 Canada (PIPEDA / Quebec Law 25)

Your privacy commissioner is the Office of the Privacy Commissioner of Canada (`priv.gc.ca`); Quebec residents may also contact the Commission d'accès à l'information (`cai.gouv.qc.ca`).

---

## 14. Contact

Privacy questions, data requests, or anything that touches this policy:

**privacy@icareeros.com**
iCareerOS LLC

We aim to acknowledge requests within 5 business days and resolve within the legally-mandated window for your jurisdiction.
