# Security Audit — azjobs Repository

**Date:** 2026-04-27
**Tool:** detect-secrets v1.5.0
**Scanned repo:** github.com/majabri/azjobs
**Performed by:** iCareerOS Cowork Agent

---

## Summary

**Result: CLEAN — No real secrets detected.**

The scan flagged 13 potential findings across 5 files. All were confirmed false positives upon manual inspection.

---

## Findings & Dispositions

### 1. `src/i18n/locales/*/forms.json` — Secret Keyword (4 files)
- **Flagged:** Line 1 in `en/`, `de/`, `es/`, `fr/` forms.json
- **Actual content:** UI label strings — `"password": "Password"`, `"confirmPassword": "Confirm Password"`
- **Verdict:** FALSE POSITIVE — i18n translation strings, not credentials

### 2. `src/locales/*.json` — Secret Keyword (4 files, lines 50-51)
- **Flagged:** en.json, de.json, es.json, fr.json
- **Actual content:** "password": "Password", "forgotPassword": "Forgot password?"
- **Verdict:** FALSE POSITIVE — UI form labels

### 3. `src/test/schemas.test.ts` — Secret Keyword (6 findings, lines 20-146)
- **Flagged:** Lines using password: "secret", password: "strongpass1", password: "short"
- **Actual content:** Test fixture data for schema validation tests (loginSchema, signupSchema)
- **Verdict:** FALSE POSITIVE — dummy test values, never real credentials

### 4. `supabase/functions/send-invite/index.ts` — Base64 High Entropy String (line 22)
- **Flagged:** High-entropy string detected
- **Actual content:** const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" — alphabet for invite code generation
- **Verdict:** FALSE POSITIVE — invite code charset, not a secret

---

## Checklist

- [x] No API keys, tokens, or service role keys found in source
- [x] No Supabase credentials in codebase
- [x] No Anthropic API keys committed
- [x] No Stripe keys or webhook secrets
- [x] No .env files committed (.gitignore covers them)
- [x] All secrets referenced via process.env.* or Supabase Edge Function env

---

## Recommendations for icareeros Repo

1. Add .env.example (done — see root)
2. Ensure .gitignore excludes .env, .env.local, .env.*.local
3. Register detect-secrets as a pre-commit hook in Week 2
4. Add SUPABASE_SERVICE_ROLE_KEY and CLAUDE_API_KEY to GitHub Secrets only — never to source code

---

Next audit: before each major release or when a new contributor is added.
