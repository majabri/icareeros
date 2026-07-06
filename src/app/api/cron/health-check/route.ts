/**
 * POST /api/cron/health-check
 *
 * Vercel Cron job — runs every 15 minutes per `vercel.json`.
 * Pings 5 critical endpoints, logs status to `infrastructure_events`.
 *
 * Protected by CRON_SECRET (Vercel cron sends `Authorization: Bearer <CRON_SECRET>`
 * — see https://vercel.com/docs/cron-jobs/manage-cron-jobs#how-to-secure-cron-jobs).
 *
 * ADR-005 Phase 1 (W6-B).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  logInfrastructureEvent,
  type InfrastructureEventSeverity,
} from "@/lib/observability/logInfrastructureEvent";

const CRITICAL_ENDPOINTS = [
  { name: "health",    path: "/api/health",                            timeoutMs: 5_000 },
  { name: "supabase",  path: "/api/health?deep=1",                     timeoutMs: 5_000 }, // ?deep=1 makes /api/health run a real Supabase auth probe (PR fix, 2026-07-04)
  { name: "landing",   path: "/",                                       timeoutMs: 8_000 },
  { name: "dashboard", path: "/auth/login",                             timeoutMs: 8_000 },
  { name: "legal",     path: "/legal/privacy",                          timeoutMs: 8_000 },
] as const;

interface ProbeResult {
  name:       string;
  path:       string;
  status:     number | null;
  ok:         boolean;
  duration_ms: number;
  error?:     string;
}

async function probe(baseUrl: string, endpoint: typeof CRITICAL_ENDPOINTS[number]): Promise<ProbeResult> {
  const start = Date.now();
  const url = `${baseUrl}${endpoint.path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), endpoint.timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      cache:  "no-store",
      headers: { "User-Agent": "iCareerOS-health-cron/1.0 (ADR-005)" },
    });
    return {
      name:        endpoint.name,
      path:        endpoint.path,
      status:      res.status,
      ok:          res.status >= 200 && res.status < 400,
      duration_ms: Date.now() - start,
    };
  } catch (err) {
    return {
      name:        endpoint.name,
      path:        endpoint.path,
      status:      null,
      ok:          false,
      duration_ms: Date.now() - start,
      error:       (err as Error).name === "AbortError" ? "timeout" : (err as Error).message,
    };
  } finally {
    clearTimeout(timer);
  }
}

function severityFor(failedCount: number, totalCount: number): InfrastructureEventSeverity {
  if (failedCount === 0) return "info";
  if (failedCount === totalCount) return "critical";
  if (failedCount > totalCount / 2) return "error";
  return "warning";
}


/**
 * T-018 — Detect when auth pipeline goes silent on a live site.
 *
 * Queries `public.auth_audit_log_volume()` RPC (SECURITY DEFINER wrapper
 * on `auth.audit_log_entries`, see migration 20260526120000). Returns a
 * critical event when the site has had auth traffic in the last 7 days
 * but ZERO events in the last 2 hours — the signature of the 2026-05-24
 * lockout cascade. See [[incident_2026-05-24_auth_lockout_root_cause]].
 */
interface AuditLogProbeResult {
  ok:             boolean;
  recent_count:   number;
  lifetime_count: number;
  last_event_at:  string | null;
  alert:          boolean;
  error?:         string;
  duration_ms:    number;
}

async function probeAuthAuditLog(): Promise<AuditLogProbeResult> {
  const start = Date.now();
  const url   = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key   = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return {
      ok:             false,
      recent_count:   0,
      lifetime_count: 0,
      last_event_at:  null,
      alert:          false,
      error:          "supabase env not configured",
      duration_ms:    Date.now() - start,
    };
  }
  try {
    const sb = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await sb.rpc("auth_audit_log_volume");
    if (error) {
      return {
        ok:             false,
        recent_count:   0,
        lifetime_count: 0,
        last_event_at:  null,
        alert:          false,
        error:          error.message,
        duration_ms:    Date.now() - start,
      };
    }
    const row = (data ?? {}) as {
      recent_count?:   number;
      lifetime_count?: number;
      last_event_at?:  string | null;
    };
    const recent   = Number(row.recent_count   ?? 0);
    const lifetime = Number(row.lifetime_count ?? 0);
    return {
      ok:             true,
      recent_count:   recent,
      lifetime_count: lifetime,
      last_event_at:  row.last_event_at ?? null,
      // Alert only when the site is OTHERWISE active — avoid noise on a
      // genuinely-dormant project (lifetime=0).
      alert:          recent === 0 && lifetime > 0,
      duration_ms:    Date.now() - start,
    };
  } catch (err) {
    return {
      ok:             false,
      recent_count:   0,
      lifetime_count: 0,
      last_event_at:  null,
      alert:          false,
      error:          (err as Error).message,
      duration_ms:    Date.now() - start,
    };
  }
}

export async function POST(req: NextRequest) {
  // Cron auth (Vercel adds the header automatically; manual hits also work).
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://icareeros.com");

  const results = await Promise.all(CRITICAL_ENDPOINTS.map(e => probe(baseUrl, e)));
  const failed  = results.filter(r => !r.ok);

  // T-018 — auth-silence probe. Runs in parallel with the endpoint probes;
  // emits its own infrastructure_event row with severity='critical' when
  // recent=0 AND lifetime>0. We deliberately do NOT fold this into the
  // health.ok / health.5xx event_type because consumers (BetterStack
  // rules, dashboards) need a distinct routing key.
  const auditProbe = await probeAuthAuditLog();
  if (auditProbe.alert) {
    await logInfrastructureEvent({
      source:     "health-cron",
      event_type: "auth.audit_log_silent",
      severity:   "critical",
      payload: {
        recent_2h:        auditProbe.recent_count,
        lifetime_7d:      auditProbe.lifetime_count,
        last_event_at:    auditProbe.last_event_at,
        probe_duration_ms: auditProbe.duration_ms,
        suspected_cause:  "Shared /token rate-limit bucket exhausted — see incident_2026-05-24_auth_lockout_root_cause. Check (a) cross-tab refresh-token race + (b) Bluehost SMTP send failures driving GoTrue email retries.",
      },
    });
  } else if (!auditProbe.ok) {
    // RPC failed — surface as a warning so it shows up in the dashboard,
    // but not critical (the cron's primary mission still ran).
    await logInfrastructureEvent({
      source:     "health-cron",
      event_type: "auth.audit_log_probe_failed",
      severity:   "warning",
      payload: {
        error:             auditProbe.error,
        probe_duration_ms: auditProbe.duration_ms,
      },
    });
  }

  const overallSeverity = severityFor(failed.length, results.length);
  const overallEventType = failed.length === 0 ? "health.ok" : (failed.some(r => r.error === "timeout") ? "health.timeout" : "health.5xx");

  await logInfrastructureEvent({
    source:     "health-cron",
    event_type: overallEventType,
    severity:   overallSeverity,
    payload: {
      base_url:   baseUrl,
      total:      results.length,
      failed:     failed.length,
      passed:     results.length - failed.length,
      results,
    },
  });

  return NextResponse.json({
    base_url:        baseUrl,
    total:           results.length,
    failed:          failed.length,
    passed:          results.length - failed.length,
    overall_status:  overallEventType,
    overall_severity: overallSeverity,
    results,
    auth_audit_log:  auditProbe,
  }, { status: failed.length === 0 ? 200 : 207 /* multi-status */ });
}

// GET also works — useful for manual probes from the browser / curl.
export async function GET(req: NextRequest) { return POST(req); }
