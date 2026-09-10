# Findings — Cross-Profession Generalization (evidence for ADR-0007)

**Date:** 2026-08-28
**Author:** Platform Strategy Chat
**Status:** Evidence brief — feeds ADR-0007 (PR #423)
**Trigger:** "It seems we are stuck on specific titles. I need the tool to work for any user with any profession."

---

## TL;DR

The corpus is fine. The scorer is fine. **The defect is synonym expansion**, and it produces a
silent, invisible failure: two users with identical skills and identical intent get wildly
different results based only on how they *phrase* their target role.

| Target role typed | Recs | Top score | Best tier |
|---|---:|---:|---|
| `Registered Nurse` | **38** | **72** | strongMatch |
| `RN` | **19** | **40** | stretch |

Same user. Same skills. Same corpus. Same day. **Typing the abbreviation halves your results
and costs you 32 points of headline score.** The user has no way to know.

---

## 1. What is NOT the problem

**The corpus is broad and healthy** — 114,607 active jobs, well distributed:

| Bucket | Jobs |
|---|---:|
| other / uncategorised | 59,785 |
| leadership (mgr/dir/VP/head) | 25,789 |
| engineering | 13,369 |
| sales | 4,079 |
| design | 3,140 |
| data | 2,522 |
| healthcare | 2,049 |
| **security** | **1,572 (1.4%)** |
| marketing | 1,191 |
| finance | 1,090 |
| education | 21 |

Security — the vertical the system was tuned on — is 1.4% of the corpus. The jobs for every
other profession are already ingested and searchable.

**The scorer is profession-agnostic.** `scoreJob` computes Jaccard word-overlap between job
title and target role. No taxonomy involved. It scored the nurse persona *higher* than the
CISO persona (top 72 vs 49), which is correct behaviour — "Registered Nurse" matches
"Registered Nurse" almost perfectly.

**Out-of-taxonomy roles are not zero-retrieval.** `expandQueriesDeno` always adds the literal
target role as a query (`queries.add(label.toLowerCase())`), so an unrecognised profession
still retrieves. This was the initial hypothesis and it is **wrong**.

---

## 2. What IS the problem

### 2.1 `ROLE_FAMILIES` is a hand-curated list of 32 families

Location: `supabase/functions/curate-user-recommendations/lib.ts` (mirrored from
`src/services/curator/roleFamilies.ts`).

Coverage: 5 security families + 27 senior/exec tech-company families (engineering, product,
data, design, sales, marketing, HR, finance, ops, legal, customer success).

Not covered: healthcare, education, skilled trades, logistics, retail, hospitality, legal
support, administrative, and **individual contributors below senior level in most fields**.

### 2.2 Synonym lookup requires an EXACT string match

```ts
export function synonymsForExactDeno(role: string): string[] {
  const target = normalisePhraseDeno(role);
  for (const [, synonyms] of Object.entries(ROLE_FAMILIES)) {
    const familyNormalised = synonyms.map(normalisePhraseDeno);
    if (familyNormalised.includes(target)) {   // <-- exact membership
      for (const s of synonyms) matched.add(s);
    }
  }
  return Array.from(matched);
}
```

`includes(target)` is exact membership. "Senior Registered Nurse" would not match a
`registered nurse` entry even if one existed. There is no fuzzy, stem, or partial fallback.

### 2.3 Consequence: retrieval breadth is wildly unequal

| User | Query phrases generated |
|---|---:|
| CISO (in taxonomy) | up to **15** (ciso, chief information security officer, field ciso, vciso, deputy ciso, security executive, …) |
| Nurse (not in taxonomy) | **1** — the literal string typed |

Multi-word phrases become adjacent-match (`websearch_to_tsquery` phrase quoting), so a single
literal phrase is a narrow net. Whether a user does well is decided by **luck**: does the exact
phrase they typed appear verbatim in job titles?

- `Registered Nurse` — appears verbatim in many titles → **38 recs / top 72**
- `RN` — single token, doesn't phrase-match "Registered Nurse - RN" strongly → **19 recs / top 40**

### 2.4 Secondary finding: employer concentration

All 38 nurse recommendations came from **cvshealth**. Of 123 "registered nurse" postings in the
corpus, 122 are cvshealth and 1 is onemedical. Even a good retrieval result can be a
single-employer monoculture. Ingestion breadth per vertical is a separate axis from taxonomy.

---

## 3. Implications for ADR-0007

The locked Option C direction (user-declared structured target attributes) is **correct and
validated** by this evidence — it removes the requirement that a maintainer pre-enumerate the
user's profession. Three additions the ADR should absorb:

### 3.1 Kill the exact-match requirement (highest value, smallest change)

Replace exact membership with graded matching: exact → contains → token-overlap → stem.
This alone would let "Senior Registered Nurse", "RN", and "Nurse, ICU" reach a common family.

### 3.2 Derive the taxonomy from the corpus, not by hand

114,607 real titles are available. Frequency analysis over title n-grams would yield hundreds of
empirically-grounded families instead of 32 hand-written ones reflecting a single vertical.
This is the difference between a taxonomy that scales and one needing a PR per profession.
Hand-curation can then *correct* the derived set rather than *be* the set.

### 3.3 Make degradation visible

Today, thin retrieval is silent — the user assumes the product is weak, not that their phrasing
was unlucky. If a target role matches no family, the UI should say so and offer alternatives
("Did you mean *Registered Nurse*?"). This is a product signal, not just an engine fix.

### 3.4 Track retrieval breadth as a metric

Log `queries_generated` and `pool_size` per curator run per user. Any user retrieving on a
single phrase is a latent bad experience. This makes the problem measurable instead of anecdotal.

---

## 4. Reproduction

```sql
-- persona setup (test user 6d91d1d0-5f69-444d-aac9-6b055ef87edb)
update user_profiles  set target_roles = ARRAY['Registered Nurse'] where user_id = '<uid>';
update career_profiles set skills = ARRAY['patient care','triage','IV therapy','EMR','ACLS',
  'BLS','wound care','medication administration','vital signs','care planning'] where user_id = '<uid>';

-- fire curator via pg_cron oneshot (Vault-authed), then:
select count(*), max(fit_score), avg(fit_score)
from user_job_recommendations where user_id = '<uid>';

-- repeat with target_roles = ARRAY['RN'] and compare
```

Test user was restored to `target_roles = '{}'` and its recommendations cleared after the run.

---

## 5. What was NOT changed

No code was modified for this investigation. Findings only. The fix belongs in ADR-0007.
