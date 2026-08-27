# Edge-function heartbeat observability

**Status:** Live 2026-08-13
**Owner:** `@majabri` (see `.github/CODEOWNERS`)
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
