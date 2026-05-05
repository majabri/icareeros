---
slug: ai-disclosure
lastUpdated: 2026-05-05
locale: en
---

# AI Use Disclosure

**Last updated:** 2026-05-05
**Effective:** [Date P0 PR ships]
**Version:** 1.0 (DRAFT — pending counsel review)

> This is a transparency document. It explains, in plain language, where iCareerOS uses AI, what models, what data goes in, what comes out, and what your rights are. It exists because (a) we think you deserve to know, and (b) the EU AI Act, GDPR Art. 22, and equivalent laws in other jurisdictions require us to be specific.

---

## 1. Our position

iCareerOS is built around AI. We use it to help you make sense of your career — parsing your résumé, scoring your fit for jobs, drafting cover letters, simulating interviews, suggesting next steps. This makes the product useful, but it also creates obligations: AI in employment contexts is **high-risk** under the EU AI Act (Annex III §4), and we treat it that way globally, not only for EU users.

Our commitments:

1. **Transparency.** Every AI-generated output is labeled as such in the UI.
2. **No fully automated decisions with significant effects.** Fit scores, recommendations, and rankings are advisory. They do not auto-apply, auto-reject, or otherwise act on you without your decision.
3. **Human review on request.** You can ask for a human to review any AI output that materially affects you. See §6.
4. **No model training on your data.** Your résumé and prompts are not used to train Anthropic's foundation models or any of our sub-processors' general-purpose models.
5. **Bias and fairness diligence.** We design AI features to avoid recommending or scoring on legally protected characteristics. We will publish an independent bias audit before any B2B / employer launch.
6. **Right to opt out of AI features.** You can use the core profile, job search, and application tracking features without engaging any AI feature. See §7.

---

## 2. Where we use AI in iCareerOS

| Feature | What the AI does | Model | Inputs | Outputs |
|---|---|---|---|---|
| Résumé parser (`/mycareer/profile` import) | Extracts structured fields from your uploaded résumé | Claude Sonnet 4.6, with Claude Haiku 4.5 fallback / regex tier | Your résumé file content | Structured fields: contact info, work history, education, certs, skills, portfolio |
| Fit Check (`/api/resume/fit-check`) | Compares your profile/résumé to a job description | Claude Sonnet 4.6 | Your profile or résumé text + a job description | Match score, skill gaps, recommendations |
| Cover Letter (`/api/cover-letter`) | Drafts a cover letter | Claude Sonnet 4.6 | Job description + your profile | A draft cover letter |
| Interview Simulator (`/interview`) | Simulates interview Q&A with feedback | Claude Sonnet 4.6, streaming | Job context + your responses | Follow-up questions, feedback, scoring rubric |
| Outreach (`/api/outreach`) | Drafts personalized outreach messages | Claude Sonnet 4.6 | Recipient context + your profile | Draft message |
| Salary Intelligence | Estimates ranges based on role/location/experience | Claude Sonnet 4.6 + market data | Role title, location, experience level | Range estimate, rationale |
| Career OS coaching (`/api/career-os/{evaluate,advise,learn,act,coach,achieve,negotiate}`) | Stage-specific coaching responses | Claude Sonnet 4.6 | Your profile + stage context + your input | Coaching reply text |
| Recruiter Assistant (`/recruiter`) | Analyzes a JD; assists with screening (employer-side feature) | Claude Sonnet 4.6 | JD text + (in B2B context) candidate data the recruiter shares | Analysis, suggested screening questions |
| Support ticket classifier (`support-resolver` edge function) | Classifies your support ticket and proposes a response | Claude Haiku 4.5 | Ticket text | Category, suggested response |

We use **Anthropic's Claude API** for all of the above. We do not use OpenAI, Google, or other LLM providers at this time.

---

## 3. Data flow for an AI feature

When you use, say, the Fit Check:

```
You paste a JD on /resume      ─┐
                                ├─►  Next.js API route on Vercel  ─►  Anthropic Claude API
Your profile loads from Supabase ─┘                                    (US region)
                                                                            │
Result returned to your browser ◄──────────────────────────────────────────┘
                                                                            │
                                                Trace metadata logged to Langfuse (no raw resume)
                                                Errors (PII-scrubbed) logged to Sentry
```

What that means in practice:

- Your résumé text and the JD are sent to Anthropic over an encrypted (TLS 1.3) connection.
- Anthropic processes them ephemerally to produce the response. Per Anthropic's terms for API customers, **prompts and completions are not used to train Anthropic's models**.
- We log enough trace metadata (success/failure, latency, anonymized identifiers) in Langfuse to debug and monitor cost. We do not log raw résumé content into traces. (See P1 work item to verify and harden.)
- The response is cached briefly to your browser session and not persisted unless you explicitly save it (e.g., a saved cover letter).

---

## 4. Limitations and known failure modes

AI is helpful, but it is not magic. Outputs from iCareerOS may:

- **Be wrong.** Models can hallucinate, misread context, or produce outdated information (especially salary ranges, company facts, or industry trends).
- **Reflect bias in training data.** While we design prompts to avoid bias, no AI system is perfectly neutral. We discourage decisions based solely on AI outputs, and we do not allow AI scores to filter you out of any feature in iCareerOS.
- **Vary between runs.** The same input can produce different outputs each time. This is normal for generative AI.
- **Miss nuance.** A short résumé description of a complex role may parse poorly. You can always edit the parsed fields directly.

**Always review AI outputs before relying on them or sending them to a third party** (e.g., a recruiter, hiring manager, or in an application).

---

## 5. EU AI Act posture

The EU AI Act classifies AI systems used in employment, workers management, and access to self-employment — including CV-screening and ranking tools — as **high-risk AI systems** (Annex III §4). iCareerOS includes features in this category (résumé parsing, fit scoring, recruiter assistance).

We design with the high-risk regime in mind:

- **Risk management** — features that produce scores or rankings carry user-facing accuracy disclaimers; we monitor for systematic miss patterns.
- **Data governance** — training-data concerns are limited because we don't fine-tune our own models; we rely on a foundation-model provider (Anthropic) and steer behavior with prompting. Anthropic's data governance is documented in their public materials.
- **Technical documentation** — kept internally; available to regulators on request.
- **Logging and traceability** — Langfuse traces capture inputs/outputs for diagnosis (with PII protection underway in P1).
- **Transparency to deployers and users** — this document.
- **Human oversight** — described in §6.
- **Accuracy, robustness, cybersecurity** — TLS 1.3, sub-processor agreements, regular review.

If we are later classified as a "provider" of a high-risk AI system under Art. 16 of the Act and subject to conformity-assessment obligations, we will undertake the assessment, register in the EU database, and CE-mark the system as required. We are also tracking the staggered enforcement timeline (general obligations from 2025, high-risk obligations through 2026–2027).

For deployers (employers/recruiters using iCareerOS, when B2B is live): **you are responsible for human oversight of any hiring decision** influenced by an iCareerOS output. We will require this contractually before activating any B2B feature.

---

## 6. Your right to a human review

If an AI-generated output in iCareerOS materially affects you — for example, a fit score that contributed to your decision not to apply for a role, or an interview-simulator score you want challenged — you can:

1. **Request human review** by emailing **privacy@icareeros.com** with the subject line "Human review request" and a description of the output and why you are challenging it.
2. We will respond within **30 days** (sooner where required by local law) with: a plain-language explanation of the relevant factors, an option to correct any input data we used, and where appropriate, a corrected output.
3. You may also use this channel to contest any decision that you believe was based on protected characteristics (race, gender, age, religion, disability, or other category protected by law).

This right is in addition to your GDPR Art. 22 right not to be subject to a decision based solely on automated processing that produces legal or similarly significant effects on you. Within iCareerOS today, **no such fully automated decisions exist** (see §1.2), but we describe the right because it applies.

---

## 7. Opting out of AI features

You can use the following parts of iCareerOS without engaging any AI feature:

- account creation and management (`/settings/*`);
- editing your career profile manually (`/mycareer/profile`) — you can skip the résumé importer and type fields directly;
- searching jobs and saving listings (the search itself doesn't require AI; fit scores do);
- exporting your data (`/settings/account`).

If you want a complete AI-off mode, email privacy@icareeros.com and we will disable AI feature toggles on your account. Some features will simply not be available; no other consequence.

---

## 8. Bias monitoring and audits

We have not yet completed an independent bias audit of iCareerOS. Before any B2B / employer launch (or before any employer customer makes the platform available to candidates in New York City, where Local Law 144 applies), we will:

- Engage a third-party auditor;
- Publish a summary of audit findings and methodology;
- Update this disclosure with the publication date.

We monitor internally for systematic miss patterns by aggregated demographic-free signals (e.g., is the parser systematically dropping fields when résumés follow certain formats). We do not collect demographic data for the purpose of bias monitoring at the user level — that would itself be a data minimization concern.

---

## 9. Where to learn more

- **Anthropic's usage policies and data handling**: <https://www.anthropic.com/legal>
- **EU AI Act overview**: <https://artificialintelligenceact.eu>
- **GDPR Art. 22 (automated decision-making)**: <https://gdpr-info.eu/art-22-gdpr/>
- **NYC Local Law 144 (Automated Employment Decision Tools)**: <https://www.nyc.gov/site/dca/about/automated-employment-decision-tools.page>

---

## 10. Contact

Questions, human-review requests, or bias concerns: **privacy@icareeros.com**.

We aim to acknowledge within 5 business days and resolve within 30 days (sooner where law requires).
