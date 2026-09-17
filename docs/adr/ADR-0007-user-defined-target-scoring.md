# ADR-0007: User-defined target scoring

- **Status:** Accepted — design approved 2026-09-17; implementation phases per §6
- **Date:** 2026-08-28
- **Decision owners:** Amir Jabri
- **Supersedes:** ADR-0006 (ADR-006) Options A and B once this ADR is fully rolled out

## 1. Problem statement

ADR-0006 (ADR-006) F4 scoring was evaluated against a 21-row scoring pool. The pool
contains several false-positive families: Pfizer rows entangled with
Marketing, HPE IC/Principal rows that introduce individual-contributor noise,
and Mastercard Sales rows. In particular, a Pfizer “Manager, CISO Marketing”
can beat genuine Director of Security opportunities because title-token and
skills signals do not know which attributes the user actually values.

Option A, a hardcoded negative modifier or token ban, encodes the maintainer's
taste as a global rule. It would reject a legitimate target such as “CISO for
a Marketing SaaS”: the word `marketing` would be banned even though that
industry context is exactly what this user wants. A global ban cannot
distinguish a misleading department suffix from a user's deliberate industry
preference.

Option B, reweighting the existing components and adding a `skillsMatch`
floor, does not produce reliable separation on the observed 21-row pool.
Changing weights moves borderline rows but does not supply the missing
department, discipline, industry, or management context. Worse, the current
extractor's coverage is incomplete and section-dependent. A skills floor
would therefore nuke legitimate anchor rows whose descriptions omit skills,
use synonyms, or have not yet been extracted, while allowing noisy rows with
well-populated descriptions through.

The real question is not “which global rule defines a good match?” It is:
**how should scoring adapt to the user's declared targets?** Each user should
be able to state the role, level, management track, discipline, industry
preferences, and anti-patterns that matter to them. The scorer should then
compare jobs with those declarations rather than imposing maintainer-wide
preferences.

ADR-0006 §5's anchor-set doctrine remains governance for calibration. This ADR
does not retire ADR-0006 F4; the current path remains active until the rollout
below is complete.

## 2. Data model

### Current state

`user_profiles.target_roles` is a nullable `text[]`, containing only flat title
strings.

### Proposed state

Add `user_profiles.target_roles_v2 jsonb`, containing an array of structured
targets:

```json
[
  {
    "title": "CISO",
    "level": "director_plus",
    "track": "people_manager",
    "discipline": "security",
    "industry_preferences": ["fintech", "healthcare"],
    "excluded_patterns": ["marketing", "sales"]
  }
]
```

Each target has the following contract:

| Field | Type | Allowed values / format | Default | Nullable |
|---|---|---|---|---|
| `title` | string | Non-empty normalized title; autocomplete is advisory | none | No |
| `level` | enum | `entry`, `mid`, `senior`, `staff`, `principal`, `director_plus`, `vp`, `c_suite` | `senior` | No |
| `track` | enum | `individual_contributor`, `small_team_manager`, `people_manager`, `executive` | `individual_contributor` | No |
| `discipline` | enum/string | Canonical discipline vocabulary; unknown values retained as `other` | `other` | No |
| `industry_preferences` | string[] | Canonical industry slugs; empty means no preference | `[]` | No |
| `excluded_patterns` | string[] | User-owned case-insensitive title/department patterns | `[]` | No |

The JSON document must be an array. Unknown future fields may be ignored by
the scorer and preserved by the editor. Invalid entries should be omitted
from scoring, not cause a user's recommendations to fail.

### Backfill

Existing `text[]` entries will be converted to one structured target per
entry. Use an LLM assist (recommend **claude-haiku-4-5**) once per user to
infer level, track, and discipline from the title; default uncertain fields
rather than inventing precision. The operation must be idempotent, keyed by
user/profile and source value, and record a schema/version marker in a separate
`user_profile_target_role_backfills` audit table (user/profile ID, source-value
hash, target schema version, and completion timestamp) so retries cannot append
duplicates. The source value is the canonical, trimmed, case-folded title
string after the same normalization used by the scorer; hash that value
together with the source schema version. A user may review and correct the
result in the preferences UI.

### Migration strategy

1. Add nullable `target_roles_v2 jsonb`; retain `target_roles text[]`.
2. Backfill existing rows with the idempotent Haiku-assisted conversion.
3. Dual-read, preferring valid `target_roles_v2` and falling back to
   `target_roles`; dual-write edits during the transition.
4. Observe coverage, invalid-entry rate, and score parity; then cut over all
   reads and writes to v2.
5. After the compatibility window and rollback window close, drop
   `target_roles text[]` in a separate migration.

## 3. Job attribute extraction

The existing extractor produces a title, seniority, and some skills. Structured
matching additionally needs:

| Attribute | Proposed representation | Notes |
|---|---|---|
| `management_signal` | enum: `IC`, `small_team_manager`, `mid_manager`, `director`, `executive` | Compared with the target's `track` |
| `department_context` | controlled enum where known (`Security`, `Marketing`, `Sales`, `Engineering`, etc.), otherwise a normalized free string | Context for discipline and exclusion matching |
| `discipline_signal` | controlled-vocabulary match against the canonical discipline list | Compared with target `discipline` |
| `level_signal` | enum: `entry`, `mid`, `senior`, `staff`, `principal`, `director`, `vp`, `c_suite` | Job-side `director` maps to target-side `director_plus` |

Extraction should be regex-first for explicit title markers (`VP`, `CISO`,
`Director`, `IC`, and similar), then use an LLM only for ambiguous context.
The recommended model is **claude-haiku-4-5** for cost and adequate
classification quality. Run this in the `enrich-jobs` pipeline so attributes
are computed once and reused by retrieval, recommendations, and fit checks;
on-demand scoring may use a bounded fallback for legacy rows, but must not
make an unbounded model call per recommendation.

Store the result in an `opportunities.attributes jsonb` object rather than
adding four columns. This leaves room for new signals without repeated schema
migrations and permits extractor versioning:

```json
{
  "management_signal": "director",
  "department_context": "Security",
  "discipline_signal": "security",
  "level_signal": "director",
  "extractor_version": "target-scoring-v1"
}
```

## 4. `scoreTargetRoleMatch` rewrite

For each job and target, calculate independent normalized similarities:

- **Level:** normalize the job-side `director`/`vp`/`c_suite` values into the
  target-side `director_plus` bucket before comparison. Exact level is 1.0;
  adjacent level is 0.7; a compatible `director_plus` range is 0.85;
  otherwise 0. This explicit mapping is the intentional difference between
  the granular extraction enum and the user-facing range enum.
- **Track:** exact management/IC track is 1.0; adjacent management band is
  0.6; conflicting IC versus people-manager signals are 0.
- **Discipline:** exact canonical discipline is 1.0; an explicitly different
  discipline is 0; missing is neutral/unknown, not a penalty.
- **Industry:** overlap with `industry_preferences` is 1.0; no preference is
  neutral; an explicit non-overlap is 0.2 (subject to calibration).
- **Title tokens:** normalization, phrase matching, and token-overlap behavior
  carry over as the lexical component — but **synonym expansion must be
  rebuilt, not retained**. See §4.1; the current implementation is the
  measured cause of cross-profession failure.

### 4.1 Synonym expansion is the defect, not a component to preserve

Evidence: `docs/FINDINGS-cross-profession-generalization.md` (#424). Same user,
same skills, same corpus, same day — only the *phrasing* of the target role
changed:

| Target role typed | Recs | Top score | Best tier |
|---|---:|---:|---|
| `Registered Nurse` | 38 | 72 | strongMatch |
| `RN` | 19 | 40 | stretch |

Root cause: `synonymsForExactDeno` requires **exact string membership** in
`ROLE_FAMILIES`, a hand-curated list of 32 families (5 security + 27
senior/exec tech). No fuzzy, stem, or partial fallback. In-taxonomy users get
up to 15 query phrases; everyone else gets exactly one — the literal string
typed. Whether a user succeeds is decided by whether their phrasing happens to
appear verbatim in job titles.

Two facts bound the problem usefully. The corpus is **not** the constraint —
114,607 active jobs, broadly distributed (engineering 13k, sales 4k, design
3.1k, data 2.5k, healthcare 2k); security, the vertical the system was tuned
on, is 1.4%. And `scoreJob` is already profession-agnostic Jaccard overlap —
it scored a nurse persona *higher* than the CISO persona. The engine
generalizes; the taxonomy does not.

**Required changes:**

1. **Graded matching replaces exact membership** — exact → contains →
   token-overlap → stem. Highest value, smallest change: it alone lets `RN`,
   `Senior Registered Nurse`, and `Nurse, ICU` resolve to one family.
2. **Derive families from the corpus.** 114k real titles beat 32 hand-written
   ones. Hand-curation should *correct* a derived set, not *be* the set —
   otherwise every new profession requires a PR.
3. **Make degradation visible.** If a declared target resolves to no family,
   say so in the UI and offer alternatives. Today thin retrieval is silent and
   the user concludes the product is weak rather than that their phrasing was
   unlucky.
4. **Track retrieval breadth.** Log `queries_generated` and `pool_size` per
   curator run per user. Any user retrieving on a single phrase is a latent bad
   experience; this makes it measurable rather than anecdotal.
- **Excluded patterns:** a match is a per-target penalty or rejection, never a
  global token ban.

Proposed initial composite (to be calibrated against a representative pool):

```text
0.25 level
+ 0.20 track
+ 0.20 discipline
+ 0.15 industry
+ 0.20 title-token similarity
```

Unknown attributes should be omitted from the denominator and the remaining
weights renormalized, rather than treated as a zero or a false match. Apply
the user's excluded patterns after attribute scoring. The user's score is the
maximum score across all declared targets:

For example, from the full weight sum of `1.00`, if industry is unknown, use
the other four weights
(`level=0.25 + track=0.20 + discipline=0.20 + title-token=0.20 = 0.85`) as
the denominator (`1.00 - industry=0.15`), yielding effective
weights of approximately `level=0.294`, `track=0.235`,
`discipline=0.235`, and `title-token=0.235`. If both industry and discipline
are unknown, divide by `0.65`
(`level=0.25 + track=0.20 + title-token=0.20`) and renormalize
`level≈0.385`, `track≈0.308`, and `title-token≈0.308` (rounded values).
Rounded display values may sum to 1.001; implementation and calibration tests
must use unrounded fractions and assert these denominator rules.

```text
score(job, user) = max(scoreTarget(job, target) for target in user.targets)
```

Return the winning target as provenance so the UI can explain the
recommendation. The weights and thresholds are proposals, not product truth;
calibration must honor ADR-0006 §5's anchor-set doctrine.

For users with an empty or invalid `target_roles_v2`, fall through to today's
F4/current `scoreTargetRoleMatch` behavior. This preserves identical behavior
for users who have not supplied structured targets.

## 5. UI on `/mycareer/preferences`

Replace the flat target-role input with a rich target editor:

- add and remove multiple targets;
- edit title, level, track, discipline, industry preferences, and excluded
  patterns per target;
- autocomplete common titles, levels, and industries, seeded from the
  existing anchor set;
- preserve user-entered values when they are not in the suggestions.

Use the copy: **“The more specific your declared target, the better your
recommendations.”**

Keep the stopgap `excluded_role_patterns` field visible during and after this
ADR's rollout. Its anti-pattern value remains useful; the durable model moves
those patterns under each target instead of treating them as one
global-per-user rule. During migration, existing global patterns should be
copied to each target unless the user explicitly edits them.

## 6. Rollout plan

**Known adjacent risk — ingestion breadth.** All 38 recommendations for the
nurse persona came from a single employer: `cvshealth` holds 122 of the 123
`registered nurse` postings in the corpus. Taxonomy breadth and *ingestion*
breadth are different axes. Fixing §4.1 will expose the second, and rollout
should expect per-vertical employer concentration to surface as the next
complaint rather than treating it as a regression of this work.

1. **Phase 1 — schema and extraction:** ship the extractor and
   `target_roles_v2`; dark-launch population, but do not score with it.
2. **Phase 2 — scoring flag:** ship the rewritten scorer behind
   `USER_DEFINED_TARGET_SCORING`; enable it for internal users only.
3. **Phase 3 — preferences UI:** ship the structured editor and correction
   flow.
4. **Phase 4 — dogfood:** enable the flag for `@majabri` for approximately
   one week and inspect anchor/rejection separation.
5. **Phase 5 — general availability:** enable the flag for all users, with
   monitoring and a rollback switch.
6. **Phase 6 — retirement:** remove the old scorer path and, only after the
   compatibility window, drop `target_roles text[]`.

Estimate: 3–4 implementation PRs over 2–3 weeks. Each phase is a separate
GitHub issue and Copilot session. This ADR itself is design-only.

## 7. Testing strategy

### Regression pool

**Must include out-of-taxonomy personas.** A pool drawn only from the security
vertical will pass while the generalization defect in §4.1 survives intact.
Include at minimum: nursing (e.g. `Registered Nurse` *and* `RN` as separate
personas — they must converge), plus one non-tech, non-clinical profession
(skilled trades, education, or logistics). The `RN` vs `Registered Nurse`
convergence is the acceptance test for §4.1.

Score the ADR-0006 (ADR-006) 21-row pool against Amir's declared target:
`Director+ Security People-Manager`, with security discipline and the relevant
industry preferences. The expected result is clean separation: security
director/manager anchors pass; Pfizer Marketing entanglements, HPE
IC/Principal noise, and Mastercard Sales rows fail unless their structured
attributes actually satisfy the target. The exact expected fixture is:

| ADR-0006 row | Expected | Reason |
|---|---|---|
| 01–05 | Pass/fail per the ADR-0006 anchor labels | Preserve the existing anchor-set ground truth |
| 06–08 (Pfizer Marketing entanglement) | Fail | Marketing context conflicts with Amir's security target |
| 09–11 (HPE IC/Principal) | Fail | IC/individual-contributor track or level conflicts |
| 12–14 (Mastercard Sales) | Fail | Sales department/discipline conflicts |
| 15–21 | Pass/fail per the ADR-0006 anchor labels | Preserve the existing anchor-set ground truth |

Before implementation, the 21 concrete titles and labels must be copied
verbatim from ADR-0006 into a versioned test fixture; no implementation issue
may substitute subjective labels for that fixture.

### Positive counterexample

Score the same pool for a hypothetical user targeting **“CISO for Marketing
SaaS”** (`level=director_plus`, `track=people_manager`,
`discipline=security`, `industry_preferences=["marketing_saas"]`). Pfizer
Marketing rows should surface for this user. Option A would have wrongly
filtered them solely because its global token ban treated `marketing` as bad.

### Compatibility and quality

- **Backward compatibility:** a user with no structured targets gets byte-for-
  byte equivalent current F4/current target-role results.
- **Extractor accuracy:** manually label 50 representative rows and compare
  structured extraction with human ground truth. Target at least 90% agreement
  on both `management_signal` and `discipline_signal`.
- **Determinism:** identical job attributes and targets produce identical
  scores and winning-target provenance.
- **Unknowns:** missing extraction fields do not become accidental hard
  rejections.

## 8. Design questions — resolved

Answered by Amir Jabri on 2026-09-17. Implementation issues may now be split
per §6. Where an answer changes the body of this ADR, the body is the
authority and the note below records why.

1. **Level taxonomy — the two-axis model stands; the question is superseded.**
   The proposed `IC / M1 / M2 / Director / VP / C-suite` list conflates two
   dimensions this ADR deliberately separates: `IC` and `M1` are values of
   `track`, not of `level`. Collapsing them would make "Principal Engineer"
   and "Engineering Manager" indistinguishable, which is the discrimination
   §4's track component exists to provide. Keep the 8-value `level` enum and
   the 4-value `track` enum orthogonal, as specified in §2.

2. **Discipline vocabulary — derived from the corpus, not hand-written.**
   §4.1 already establishes that hand-curation should *correct* a derived set
   rather than *be* it; hand-authoring disciplines would recreate the
   32-family failure one layer down. Seed the first pass from the active
   corpus ranked by job count, retain `other` as the fallback for unknown
   values, and assign ownership of additions to the scorer owner.

3. **Industry vocabulary — curated slugs, not SIC/NAICS.**
   SIC and NAICS classify employers by economic activity; candidates express
   preference in terms like `fintech` or `healthtech` that cut across those
   codes. Adopting them would make the field precise and unusable. Use
   approximately 20–30 curated slugs seeded from corpus employer data.

4. **Multi-target scoring — best-match-wins (`max`) stands.**
   §4 requires returning the winning target as provenance so the UI can
   explain a recommendation. Blending removes the single target that
   explanation names. Revisit only on evidence that users want blended
   behaviour.

5. **Zero-match — say "no matches yet"; do NOT fall through to F4.**
   A silent fallback reproduces precisely the failure #424 documented: thin
   results, no explanation, and a user who concludes the product is weak
   rather than that their phrasing was unlucky. It would also contradict
   §4.1's required change 3. State the outcome explicitly and offer
   alternatives.

6. **Privacy and calibration — aggregate only, with a k-anonymity floor.**
   Declared targets are never admin-visible per user. Aggregate views expose a
   target value only where at least 5 users have declared it. This is the
   conservative default deliberately: it is easy to loosen later and costly to
   walk back, and this system operates under hiring-related data-protection
   obligations.

7. **Excluded patterns — calibrated penalty, never hard rejection.**
   §1 rejects Option A because a global ban would reject a legitimate
   "CISO for a Marketing SaaS" target. A per-target hard rejection
   reintroduces the same failure at smaller scale — a user excluding `sales`
   would lose a Head of Security at a sales-technology company. A penalty
   preserves recoverability.

8. **Unknown extraction — neutral, as drafted.**
   Penalising unknowns punishes a job for a thin description, which is an
   artefact of the source rather than evidence of poor fit, and repeats the
   reasoning §1 uses to reject the skills floor. Neutral remains the default;
   user-facing strictness may be added later if requested.
