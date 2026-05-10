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
import {
  logInfrastructureEvent,
  type InfrastructureEventSeverity,
} from "@/lib/observability/logInfrastructureEvent";

const CRITICAL_ENDPOINTS = [
  { name: "health",    path: "/api/health",                            timeoutMs: 5_000 },
  { name: "supabase",  path: "/api/health",                            timeoutMs: 5_000 }, // fallback — true Supabase ping is the body inside /api/health
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
  }, { status: failed.length === 0 ? 200 : 207 /* multi-status */ });
}

// GET also works — useful for manual probes from the browser / curl.
export async function GET(req: NextRequest) { return POST(req); }
