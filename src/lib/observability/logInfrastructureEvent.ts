/**
 * src/lib/observability/logInfrastructureEvent.ts
 *
 * Single insert path into `public.infrastructure_events` from server-side
 * code (webhook receivers + cron probes). Uses the service-role key so RLS
 * can't get in the way; the table's RLS policy already says "service role
 * manages infrastructure_events".
 *
 * Fan-out to BetterStack Telemetry (added 2026-05-26):
 *   When `BETTERSTACK_INGEST_TOKEN` + `BETTERSTACK_INGEST_HOST` are set,
 *   every event is ALSO POSTed to the BetterStack HTTP ingest endpoint so
 *   log-based alert rules in BetterStack can page on critical events. The
 *   POST is fire-and-forget — its success or failure NEVER affects the
 *   Postgres insert result.
 *
 * Failures here MUST NOT break the calling route. We log + swallow.
 *
 * Sources are conventionally one of:
 *   'vercel' | 'sentry' | 'betterstack' | 'health-cron' | 'smtp-cron' |
 *   'cost-cron' | 'job-alerts-cron'
 *
 * ADR-005 Phase 1 (W6-B). BetterStack drain added 2026-05-26 to close the
 * detection loop for the 2026-05-24 lockout failure mode (T-017/T-018).
 */

import { createClient } from "@supabase/supabase-js";

export type InfrastructureEventSeverity = "info" | "warning" | "error" | "critical";

export interface InfrastructureEventInput {
  source:     string;
  event_type: string;
  severity?:  InfrastructureEventSeverity;
  payload?:   Record<string, unknown> | null;
  resolved_at?: string | null;
}

export interface InfrastructureEventResult {
  ok: boolean;
  id?: string;
  error?: string;
}

// ── BetterStack drain ────────────────────────────────────────────────────────
//
// Fire-and-forget POST to the HTTP ingest source. Returns nothing useful;
// any error is logged at warn level and swallowed. NEVER awaits past the
// existing Postgres insert path — we never want the drain to block the cron.
//
// Shape: BetterStack accepts a single JSON object or an array. We send one
// object per call with conventional `dt` + `level` + `message` + arbitrary
// extra fields. They surface in the BetterStack Live tail / Explore UI and
// are matchable by log-based alert rules.
function sendToBetterStack(input: InfrastructureEventInput): void {
  const host  = process.env.BETTERSTACK_INGEST_HOST;
  const token = process.env.BETTERSTACK_INGEST_TOKEN;
  if (!host || !token) return; // drain disabled (local dev / preview without env)

  const url = host.startsWith("http") ? host : `https://${host}`;
  const severity = input.severity ?? "info";
  // BetterStack convention: levels are info / warn / error. Map ours.
  const level =
    severity === "critical" ? "error" :
    severity === "error"    ? "error" :
    severity === "warning"  ? "warn"  :
    "info";

  const body = {
    dt:         new Date().toISOString(),
    level,
    message:    `${input.source}:${input.event_type}`,
    source:     input.source,
    event_type: input.event_type,
    severity,
    payload:    input.payload ?? null,
    resolved_at: input.resolved_at ?? null,
  };

  // Use fetch with no await on the caller side. Catch all errors here so
  // they never bubble. 5-second timeout via AbortController.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);

  fetch(url, {
    method:  "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type":  "application/json",
    },
    body:   JSON.stringify(body),
    signal: controller.signal,
  })
    .then((res) => {
      if (!res.ok) {
        // Don't log the body — could contain echoed payload. Status code only.
        console.warn(
          "[observability] BetterStack ingest non-2xx:",
          res.status,
          input.source,
          input.event_type,
        );
      }
    })
    .catch((err) => {
      // AbortError, network, DNS, TLS — all swallowed at this layer.
      console.warn(
        "[observability] BetterStack ingest failed:",
        (err as Error).name,
        input.source,
        input.event_type,
      );
    })
    .finally(() => clearTimeout(timeout));
}

/**
 * Insert a single infrastructure event into Postgres AND fan it out to
 * BetterStack Telemetry. Always resolves; never throws. The BetterStack
 * fan-out is fire-and-forget and does NOT affect the returned result.
 */
export async function logInfrastructureEvent(
  input: InfrastructureEventInput,
): Promise<InfrastructureEventResult> {
  // ── BetterStack drain — fire-and-forget, independent of Postgres path ─────
  // Called BEFORE the await so the network request is in flight while we
  // talk to Postgres. We never await it.
  try {
    sendToBetterStack(input);
  } catch (err) {
    // sendToBetterStack already catches internally — this is belt-and-suspenders.
    console.warn(
      "[observability] BetterStack ingest threw synchronously:",
      (err as Error).message,
    );
  }

  // ── Postgres path ────────────────────────────────────────────────────────
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.warn(
      "[observability] logInfrastructureEvent: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing — event dropped",
      input.source,
      input.event_type,
    );
    return { ok: false, error: "supabase env not configured" };
  }
  try {
    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase
      .from("infrastructure_events")
      .insert({
        source:      input.source,
        event_type:  input.event_type,
        severity:    input.severity ?? "info",
        payload:     input.payload ?? null,
        resolved_at: input.resolved_at ?? null,
      })
      .select("id")
      .single();
    if (error) {
      console.error("[observability] logInfrastructureEvent failed:", error.message);
      return { ok: false, error: error.message };
    }
    return { ok: true, id: data?.id };
  } catch (err) {
    console.error("[observability] logInfrastructureEvent threw:", err);
    return { ok: false, error: (err as Error).message };
  }
}
