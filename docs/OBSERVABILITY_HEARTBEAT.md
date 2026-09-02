# Edge-function heartbeat observability

**Status:** Live 2026-08-13
**Owner:** Platform Cowork
**Related:** ADR-005, `docs/EMAIL_DELIVERABILITY.md`, runbook gotcha #8

## What this doc covers

- Why the heartbeat pattern exists (the 2026-08-05 -> 2026-08-13 silent-failure incident)
- The `invocation.start` / `invocation.complete` contract for edge functions
- The `heartbeat-audit-5min` pg_cron job that scans for stale invocations
- BetterStack alert rule wire-up (two rules)
- Standing rule: post-deploy `verify_jwt` re-check

---

## Why heartbeats exist

**Problem class:** silent failure through the `net.http_post` return-value gap.

`pg_cron` jobs schedule work by calling `net.http_post(...)`, which returns a `request_id` synchronously — a handle to a queued HTTP call. The actual outbound call happens asynchronously in the pg_net background worker. When `cron.job_run_details.status` reports `succeeded`, it means the SQL that queued the request completed OK, not that the HTTP call succeeded, not that the target function ran, not that anything downstream produced work.

This gap hid an 8-day outage:

- **2026-08-05:** `app.settings.service_role_key` GUC un-set itself (Supabase infra event; hosted `postgres` lacks superuser to fix it). Four pg_cron-called edge functions started sending `Authorization: Bearer ` (empty token) at the edge gateway and receiving HTTP 401. `cron.job_run_details` reported `succeeded` continuously.
- **2026-08-05:** Separately, a fresh deploy of `ingest-ats-direct` inadvertently set `verify_jwt=true` (the mgmt-API `deploy_edge_function` tool's default; see runbook gotcha #8). Vercel-cron `/api/cron/ingest-ats` uses only a custom `x-ingest-cron-secret` header and got 401'd at the gateway.
- **2026-08-13:** Amir noticed the ingest silence indirectly (`ats_jobs.last_seen_at` frozen for 8 days). Root cause identified. Fixes shipped.

**A heartbeat written from INSIDE the function** — after auth clears, before crash — turns this failure class into a signal. No heartbeat means the function didn't run. That signal is directly actionable.

## The contract

Every tracked edge function emits two events into `public.infrastructure_events`:

### `invocation.start`
Emitted at the top of the `serve()` handler, right after the supabase client is created.

```json
{
  "source":     "edge-fn.<slug>",
  "event_type": "invocation.start",
  "severity":   "info",
  "payload": {
    "invocation_id":  "<uuid>",
    "version":        null,
    "invoked_by":     "pg_cron" | "vercel_cron" | "manual" | "chain",
    "chain_depth":    0
  }
}
```

`invoked_by` is inferred from the request (`chainDepth > 0` -> `chain`; `x-vercel-cron-signature` header -> `vercel_cron`; else `pg_cron`). Callers can override explicitly. This field is what settles questions like the duplicate-cron ambiguity that existed at the time of writing (`enrich-jobs-4h` pg_cron AND `/api/cron/enrich-jobs` Vercel-cron both scheduled at `30 */4`).

### `invocation.complete`
Emitted from a `finally` block wrapping the handler body.

```json
{
  "source":     "edge-fn.<slug>",
  "event_type": "invocation.complete",
  "severity":   "info" | "error",
  "payload": {
    "invocation_id": "<same uuid as start>",
    "outcome":       "ok" | "error",
    "duration_ms":   1234,
    "error":         "<message if outcome=error>",
    "...":           "<function-specific metrics>"
  }
}
```

Pairing `start` <-> `complete` by `invocation_id` distinguishes three states:

| pattern | meaning |
|---|---|
| start + complete(ok) | healthy |
| start + complete(error) | invoked but failing |
| start, no complete | invoked but crashing before finally |
| no start | not invoked (scheduler / auth / verify_jwt regression) |

### Shared helper
`supabase/functions/_shared/heartbeat.ts` exports `invocationStart()` and `invocationComplete()`. Both are fire-and-forget — DB errors during the insert are logged and swallowed. Never break the calling function.

## The audit — `heartbeat-audit-5min`

pg_cron job that runs `public.heartbeat_audit()` every 5 minutes. Migration: `supabase/migrations/20260813040000_heartbeat_audit_pgcron.sql`.

Two side effects per run:

1. **Stale-invocation detection.** For each tracked function (cadence table inline in the migration), check when its most recent `invocation.start` occurred. If gap exceeds `expected_interval_minutes * grace_multiplier (1.5x)`, insert a `stale_edge_invocation` critical event.

2. **Self-heartbeat.** Insert an `audit.ran` info event. This is the watchman-of-the-watchman: if the audit itself dies silently (same failure class we're guarding against — the audit is a pg_cron job, subject to the same GUC-drop / auth-regression risks), a second BetterStack rule alerts on absence of `audit.ran` for >15 min.

### Current cadence table

| function | expected interval | schedule origin |
|---|---|---|
| `enrich-jobs` | 240 min | pg_cron `enrich-jobs-4h` @ `30 */4` |
| `curate-user-recommendations` | 1440 min | pg_cron @ `0 4` |
| `cleanup-dead-jobs` | 1440 min | pg_cron @ `0 5` |
| `validate-job-urls` | 1440 min | pg_cron @ `0 3` |
| `ingest-ats-direct` | 240 min | Vercel-cron `/api/cron/ingest-ats` @ `0 */4` |

Add rows to the `VALUES` clause in `public.heartbeat_audit()` to track new functions. If additions become frequent, migrate to a real `edge_function_cadence` table — schema commented at the bottom of the migration.

## BetterStack rule wire-up

Two rules, both matching against the `iCareerOS infrastructure_events` HTTP source (id 2468422, EU/eu-fsn-3) which receives the log drain from `logInfrastructureEvent` (PR #298).

### Rule 1 — stale edge invocation

- **Name:** `edge-fn heartbeat: stale invocation`
- **Query:** `source:heartbeat-audit event_type:stale_edge_invocation severity:critical`
- **Condition:** `count > 0` in a 5-minute window
- **Notification:** page (matches severity of the existing SMTP + auth-silence rules)

### Rule 2 — audit-of-audits (watchman-of-the-watchman)

- **Name:** `edge-fn heartbeat: audit itself silent`
- **Query:** `source:heartbeat-audit event_type:audit.ran`
- **Condition:** `count = 0` in a **15-minute** window
- **Notification:** page

Both rules should be created in the BetterStack UI (log-based alert configuration). No Vercel-side changes required — the drain is already wired.

## Standing rule — post-deploy `verify_jwt` re-check

**Runbook gotcha #8** (added 2026-08-13):

The mgmt-API `deploy_edge_function` tool has `verify_jwt: true` as its default. If you don't pass the parameter explicitly, the tool silently sets `verify_jwt=true` on the deployed function regardless of the prior state. A function that had been `verify_jwt=false` for months will be flipped to true, breaking every custom-header-only caller (Vercel-cron, webhooks).

Every edge-function deploy MUST:

1. Pass `verify_jwt` explicitly in the deploy call.
2. Immediately after the deploy, `list_edge_functions` and confirm the response's `verify_jwt` field matches intent.
3. If drifted, re-deploy or PATCH via `PATCH /v1/projects/{ref}/functions/{slug}` with `{"verify_jwt": false}`.

Apply this check unprompted on every deploy, regardless of the ticket's phrasing. Amir's future deploy instructions will include the check; if he forgets, do it anyway.

## Related — fire-and-forget / `cron.job_run_details` lies

The core insight from the 2026-08-05 incident: **`cron.job_run_details.status='succeeded'` reports pg_cron SQL completion, not HTTP-call outcome.** Any pg_cron job that uses `net.http_post` — including this audit itself — has this property. That's why:

- Heartbeats are written from INSIDE the target function (proves the HTTP call actually reached the function).
- The audit writes its own `audit.ran` info event and BetterStack alerts on absence (proves the audit itself ran).

If a future job introduces a third link in the chain, apply the same pattern: write an event from inside that link, alert on absence.

## Deploy record — shared-import rollout

All five tracked functions redeployed from `main@784cf6f` so they import the
shared `_shared/heartbeat.ts` instead of an inlined copy (the stopgap from the
first pass). Deploy-only — no source changes.

| slug | version | verify_jwt | runtime-verified |
|---|---|---|---|
| `cleanup-dead-jobs` | v6 | false | paired heartbeat |
| `validate-job-urls` | v6 | false | paired heartbeat |
| `ingest-ats-direct` | v22 | false | `invocation.start` emitted |
| `enrich-jobs` | v15 | false | paired heartbeat |
| `curate-user-recommendations` | v13 | false | paired heartbeat |

Deployed via the Supabase MCP `deploy_edge_function` tool rather than the CLI
(the remote session had no CLI credential, and Vault holds no mgmt token). That
tool nests uploaded paths one level under `source/`, so entrypoints read
`source/source/index.ts`. Cosmetic — `../_shared/heartbeat.ts` resolves
correctly from there, as the live heartbeats confirm.

`verify_jwt: false` re-confirmed on all five per gotcha #8 above.

Deployed bytes were diffed against `main` file-by-file. All executable code is
byte-identical, and `_shared/heartbeat.ts` is byte-identical on all five — the
point of the exercise. `curate`'s `index.ts`, `jdExtractor.ts` and
`skillsNormalizer.ts` differ only in the width of decorative box-drawing comment
rules (11 lines). Redeploy from the CLI to close that if exact parity matters.

**Hand-transmission hazard:** `_shared/scoring/skillsNormalizer.ts` contains five
literal `\x01` sentinel characters (the `` `\x01${idx}\x01` `` placeholder and the
matching `/\x01(\d+)\x01/g`). They are invisible in `cat` output and
load-bearing — dropping them silently breaks protected-slash-token restoration
(`ISO/IEC 27001`, `CI/CD`, `TCP/IP`, `BC/DR`), and therefore skill normalisation
and fit scores, with no error. Verify with `grep -c $'\x01'` after any copy.

### Superseded: `curate-user-recommendations` v14

Shortly after the v13 deploy above, `curate` was redeployed to **v14** from
outside this workstream, carrying an `excluded_role_patterns` feature
(`filterExcludedRolePatterns` in `lib.ts`, plus a `user_profiles.excluded_role_patterns`
select). Verified after the fact:

- the shared `_shared/heartbeat.ts` import and `verify_jwt: false` both survived
- no inlined helper reintroduced; the five `\x01` sentinels intact
- all four `_shared/scoring/*` files and `heartbeat.ts` are now byte-identical to
  `main` — v14 closed the decorative drift noted above
- running healthy: four consecutive paired heartbeats, `outcome: ok`, HTTP 200

**Do not redeploy `curate` from `main` to "fix" the remaining comment drift.**
`main` does not contain the v14 feature, so a redeploy from the repo would
silently revert it and orphan the `excluded_role_patterns` column.

Outstanding drift to reconcile: the v14 feature code exists in neither the repo
nor any migration, while `user_profiles.excluded_role_patterns` already exists in the
production database. Land the source and a migration before the next deploy of
this function from `main`.

## Known gaps found in production

### `ingest-ats-direct` never completes — 504 at the wall-clock limit

39 `invocation.start`, **0 `invocation.complete`** over three days, spanning both
v21 (inlined helper) and v22. Pre-existing; not introduced by the redeploy.

Every gateway-logged invocation ends identically:

    booted (time: 32ms)
    POST | 504 | ingest-ats-direct   execution_time_ms = 150101

100% of logged invocations return 504 at ~150,000 ms — the edge-function
wall-clock ceiling. The function is killed mid-run and never reaches
`invocationComplete`.

What therefore never runs, because it sits after `Promise.allSettled`:

- the 48h stale-job deactivation sweep — dead postings keep `is_active = true`
- the priority-lane `enrich-jobs` chain-kick
- the rolled-up `inserted` / `errors` counts (PR #363 Bug 4), so the cron caller
  logs nothing useful

Partial ingest still persists (upserts are incremental), but the slowest sources
— Workday (17 tenants x up to 15 pages) and SmartRecruiters (5 x up to 30 pages)
— are truncated mid-pagination. It is also invoked **twice per 4h tick** (paired
starts ~0.5 s apart), doubling the load.

Fix direction: the chained-continuation pattern `enrich-jobs` already uses
(`chainDepth` + `MAX_CHAIN_DEPTH`) instead of one 150 s+ run. Investigate the
duplicate per-tick invocation first — halving the work is the cheapest partial
mitigation. Needs its own PR.

### Four functions are double-scheduled (pg_cron + Vercel cron)

The paired `invocation.start` events visible throughout `infrastructure_events`
are not an artifact — most of these functions really are invoked twice per tick.
`cron.job` and `vercel.json` both schedule the same edge functions, and the
Vercel routes under `src/app/api/cron/*` `fetch()` the identical
`${SUPABASE_URL}/functions/v1/<slug>` target:

| function | pg_cron | vercel.json | effect |
|---|---|---|---|
| `cleanup-dead-jobs` | `0 5 * * *` | `0 5 * * *` | 2x daily |
| `curate-user-recommendations` | `0 4 * * *` | `0 4 * * *` | 2x daily |
| `enrich-jobs` | `30 */4 * * *` | `30 */4 * * *` | 2x per 4h tick |
| `validate-job-urls` | `0 3 * * *` | `15 3 * * *` | 2x daily, 15 min apart |
| `ingest-ats-direct` | none | `0 */4 * * *` | single schedule |

Observed confirmation: `cleanup-dead-jobs` ran at 05:00:13 and again at
05:01:36; `curate` at 04:00:05 and 04:03:34; `validate-job-urls` twice daily.
Each pair is one pg_cron call and one Vercel-cron call landing on the same
function.

Consequences: every one of these does double work on every tick, and the second
caller can collide with the first (`cleanup-dead-jobs`'s second run returned a
500 while the first returned 200 — the two runs delete against the same rows).
Whichever scheduler is meant to own these, one side should be retired; the
cadence table above assumes a single origin per function.

**`ingest-ats-direct` is the exception and its doubling has a different cause.**
It has no pg_cron entry — only the single Vercel cron. Its 12 starts / 24 h
(2 per 4h tick) is consistent with Vercel cron **retrying after the 504**
documented above. The retry is a symptom, not an independent bug: fix the
wall-clock timeout and the second invocation disappears on its own. Do not
chase the duplicate first for this function.

### Rules 1 and 2 do not detect the above

Rule 1 keys on the age of the most recent **`invocation.start`**.
`ingest-ats-direct` emits a fresh start every tick, so the audit reads it as
healthy and Rule 1 stays quiet. Rule 2 watches for absence of `audit.ran` and is
unrelated. **A function that starts on schedule and dies every single time is
invisible to both rules as currently wired.**

Recommended Rule 3 — unpaired invocation:

- **Name:** `edge-fn heartbeat: start without complete`
- **Detection:** for each `invocation.start`, no `invocation.complete` sharing
  its `invocation_id` within that function's expected runtime
- **Condition:** `count > 0`
- **Notification:** page

Cleanest implementation is inside `public.heartbeat_audit()`, which already scans
`infrastructure_events` every 5 minutes and can emit an
`unpaired_edge_invocation` critical event that BetterStack matches the same way
as `stale_edge_invocation`.

### `invocation.start` can be lost silently under concurrent cold boots

Two `curate-user-recommendations` runs recorded an `invocation.complete` with no
matching start. Both were `POST /rest/v1/infrastructure_events` -> **401**, issued
~16 ms after boot. It is a readiness race: a PostgREST call made within roughly
the first ~40 ms of a cold boot can have its service-role JWT rejected. Measured
boot -> first-call deltas: 16 ms -> 401; 41 ms and 63 ms -> 201.

Both occurrences came from firing two functions in a single SQL statement, i.e.
two isolates cold-booting at the same instant. **Scheduled runs are not
affected** — `curate`'s daily invocations paired 6/6 over three days, and the
rate across all functions was 2 x 401 against 1190 x 201 in 24 h. Do not detune
Rule 1 for this.

The reason it is *silent* is a helper bug worth fixing on its own merits:
`supabase-js` `.insert()` **resolves** with `{ data, error }` on rejection rather
than throwing, and `invocationStart` wraps the call in `try/catch` without
inspecting `.error`. A 401 therefore produces no exception, no log line, and no
row. This is the same silent-`.error` class the #401 post-mortem already fixed
inside `enrich-jobs` (`safeUpdate` checks `.error` on every write); the shared
helper did not inherit it.

Fix direction: check `.error` in `invocationStart` and log it, then retry once
after ~50 ms. Not applied here — the helper is the source of truth and was
explicitly out of scope for the deploy ticket.
