/**
 * src/lib/observability/logInfrastructureEvent.ts
 *
 * Single insert path into `public.infrastructure_events` from server-side
 * code (webhook receivers + cron probes). Uses the service-role key so RLS
 * can't get in the way; the table's RLS policy already says "service role
 * manages infrastructure_events".
 *
 * Failures here MUST NOT break the calling route. We log + swallow.
 *
 * Sources are conventionally one of:
 *   'vercel' | 'sentry' | 'betterstack' | 'health-cron' | 'cost-cron'
 *
 * ADR-005 Phase 1 (W6-B).
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

/**
 * Insert a single infrastructure event. Always resolves; never throws.
 */
export async function logInfrastructureEvent(
  input: InfrastructureEventInput,
): Promise<InfrastructureEventResult> {
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
