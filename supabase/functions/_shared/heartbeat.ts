// deno-lint-ignore-file no-explicit-any
/**
 * Heartbeat helper for edge functions.
 *
 * Emits `invocation.start` and `invocation.complete` events into
 * `public.infrastructure_events` so the `heartbeat-audit-5min` pg_cron
 * job can alert BetterStack on stale invocations.
 *
 * Design contract (matches src/lib/observability/logInfrastructureEvent.ts):
 *   { source, event_type, severity, payload }
 *
 * Why heartbeats exist:
 *   `net.http_post` returns a `request_id` synchronously — the actual HTTP
 *   call happens async. `cron.job_run_details.status='succeeded'` reports
 *   whether the request was QUEUED, not whether the edge function ran. On
 *   2026-08-05 four pg_cron-called edge functions silently 401'd for 8+
 *   days while `cron.job_run_details` reported success. Heartbeats detect
 *   this class of failure by writing from INSIDE the function, so a
 *   missing `invocation.start` means the function didn't run.
 *
 * `invocation.start` paired with `invocation.complete` (same `invocation_id`)
 * also distinguishes "invoked but crashing" (start with no complete) from
 * "not invoked" (no start).
 *
 * Failures NEVER break the calling function. We log + swallow.
 */

export type Invoker = "pg_cron" | "vercel_cron" | "manual" | "chain" | "unknown";
export type Outcome = "ok" | "error";

export interface StartOptions {
  supabase:      any;               // supabase-js client, already created by caller
  functionSlug:  string;            // e.g. "enrich-jobs"
  version?:      string | number;   // optional — Deno.env.get("SB_FUNCTION_VERSION") if available
  invokedBy:     Invoker;
  chainDepth?:   number;            // for self-chaining fns (enrich-jobs)
  extra?:        Record<string, unknown>;
}

export interface CompleteOptions {
  supabase:      any;
  functionSlug:  string;
  invocationId:  string;
  startedAt:     number;            // Date.now() captured at start
  outcome:       Outcome;
  error?:        string;            // if outcome === "error"
  metrics?:      Record<string, unknown>;
}

/**
 * Emit `invocation.start`. Returns the invocation_id so the caller can pair
 * a `complete` to it. Never throws; on DB error the id is still returned
 * (so `complete` can still be paired even if `start` insertion failed —
 * BetterStack rule looks for the pair, not for pattern completeness).
 */
export async function invocationStart(opts: StartOptions): Promise<string> {
  const invocationId = crypto.randomUUID();
  try {
    await opts.supabase.from("infrastructure_events").insert({
      source:     `edge-fn.${opts.functionSlug}`,
      event_type: "invocation.start",
      severity:   "info",
      payload: {
        invocation_id: invocationId,
        version:       opts.version ?? null,
        invoked_by:    opts.invokedBy,
        chain_depth:   opts.chainDepth ?? 0,
        ...(opts.extra ?? {}),
      },
    });
  } catch (e) {
    console.error(`[heartbeat] invocation.start insert failed for ${opts.functionSlug}:`, (e as Error)?.message);
  }
  return invocationId;
}

/**
 * Emit `invocation.complete`. Never throws; drops errors silently.
 * severity is derived from outcome: "ok" -> "info", "error" -> "error".
 */
export async function invocationComplete(opts: CompleteOptions): Promise<void> {
  const durationMs = Date.now() - opts.startedAt;
  try {
    await opts.supabase.from("infrastructure_events").insert({
      source:     `edge-fn.${opts.functionSlug}`,
      event_type: "invocation.complete",
      severity:   opts.outcome === "ok" ? "info" : "error",
      payload: {
        invocation_id: opts.invocationId,
        outcome:       opts.outcome,
        duration_ms:   durationMs,
        error:         opts.error ?? null,
        ...(opts.metrics ?? {}),
      },
    });
  } catch (e) {
    console.error(`[heartbeat] invocation.complete insert failed for ${opts.functionSlug}:`, (e as Error)?.message);
  }
}

/**
 * Convenience: infers invokedBy from the request body / headers.
 *   - body.chainDepth > 0 → "chain"
 *   - headers has x-vercel-cron-signature → "vercel_cron"
 *   - default: "pg_cron" (all other scheduled calls come via net.http_post
 *     from pg_cron; this is the most common case)
 * Callers can still pass invokedBy explicitly to override.
 */
export function inferInvoker(req: Request | undefined, body: any): Invoker {
  if (typeof body?.chainDepth === "number" && body.chainDepth > 0) return "chain";
  const h = req?.headers;
  if (h?.get("x-vercel-cron-signature") || h?.get("x-vercel-signature")) return "vercel_cron";
  if (h?.get("x-manual-invoke") === "true") return "manual";
  return "pg_cron";
}
