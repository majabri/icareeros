# ADR-0007: User-defined target scoring

- **Status:** Draft — design approval required
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
duplicates. A user may review and correct the result in the preferences UI.

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
- **Title tokens:** retain current normalization, synonym expansion, phrase
  matching, and token-overlap behavior as the lexical component.
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

For example, if industry is unknown, use the other four weights
(`0.25 + 0.20 + 0.20 + 0.20 = 0.85`) as the denominator, yielding effective
weights of approximately `level=0.294`, `track=0.235`,
`discipline=0.235`, and `title-token=0.235`. If both industry and discipline
are unknown, divide by `0.65`
(`level=0.25 + track=0.20 + title-token=0.20`) and renormalize
`level≈0.385`, `track≈0.308`, and `title-token≈0.308` (rounded values).
Calibration tests must
assert these denominator rules.

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

## 8. Open design questions for Amir

These answers are required before implementation issues can be split:

1. **Level taxonomy:** is `IC / M1 / M2 / Director / VP / C-suite` the right
   taxonomy, or should it be richer or simpler?
2. **Discipline vocabulary:** what is the approved first-pass list, and who
   owns additions?
3. **Industry vocabulary:** should this use SIC/NAICS, a curated product
   vocabulary, or custom slugs?
4. **Multi-target scoring:** should best-match-wins remain the rule, or should
   multiple targets be blended?
5. **Zero-match edge case:** when a declared target has no matches in the
   current pool, should the UI say “no matches yet” or fall through to F4?
6. **Privacy and calibration:** may other users' declared targets be
   admin-visible in aggregate for calibration, and at what granularity?
7. **Excluded-pattern semantics:** should a per-target pattern be a hard
   rejection or a calibrated penalty?
8. **Unknown extraction:** should missing department/industry signals remain
   neutral, or should users be able to request stricter completeness?

No implementation issue should assume answers to these questions. Once Amir
answers, update this ADR if necessary and split the phase-specific issues.
