import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/health           — shallow health check (returns 200 while
 *                             the Vercel edge is serving)
 * GET /api/health?deep=1    — real probe: hits the Supabase auth service
 *                             and returns 503 when it fails.
 *
 * Consumers:
 * - BetterStack uptime monitor (pings every 30s) → shallow. We do NOT
 *   want a Supabase blip to fire uptime alarms; the Vercel edge is fine.
 * - `/api/cron/health-check` (every 15 min) → deep. The whole point of
 *   that cron is catching upstream degradation, not just Vercel-serving.
 * - Sentry cron check-in → shallow.
 * - Load test baseline (measures p95 latency of a cold hit) → shallow.
 *
 * The `observability` block reports what config is present, not secret
 * values. `probes.supabase` (deep mode only) reports the ACTUAL Supabase
 * probe result — 2026-07-04 outage revealed that reporting env-var
 * presence as "supabase":true was misleading (Supabase can be down while
 * the env var is set).
 */
export const runtime = "edge";

const SUPABASE_PROBE_TIMEOUT_MS = 2000;

interface SupabaseProbeResult {
  ok:          boolean;
  duration_ms: number;
  status?:     number;
  error?:      string;
}

/**
 * Real Supabase probe. Hits GoTrue's public `/auth/v1/settings` — no
 * auth key required, no service-role exposure. If Supabase's auth
 * service is degraded (the exact symptom of the 2026-06-30 incident),
 * this request fails or times out, giving `/api/cron/health-check` a
 * genuine failure signal instead of a false green.
 */
async function probeSupabase(): Promise<SupabaseProbeResult> {
  const start = Date.now();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    return { ok: false, duration_ms: 0, error: "NEXT_PUBLIC_SUPABASE_URL_missing" };
  }

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), SUPABASE_PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(`${url}/auth/v1/settings`, {
      method: "GET",
      cache:  "no-store",
      signal: ctl.signal,
      headers: { "User-Agent": "iCareerOS-health/1.0" },
    });
    return {
      ok:          res.ok,
      duration_ms: Date.now() - start,
      status:      res.status,
    };
  } catch (err) {
    const e = err as Error;
    return {
      ok:          false,
      duration_ms: Date.now() - start,
      error:       e.name === "AbortError" ? "timeout" : e.message,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(req: NextRequest) {
  const deep = new URL(req.url).searchParams.get("deep") === "1";
  const supabaseProbe = deep ? await probeSupabase() : null;
  const degraded = deep && supabaseProbe !== null && !supabaseProbe.ok;

  return NextResponse.json(
    {
      status:    degraded ? "degraded" : "ok",
      service:   "icareeros",
      timestamp: new Date().toISOString(),
      version:   process.env.NEXT_PUBLIC_APP_VERSION ?? "dev",
      observability: {
        sentry:     Boolean(process.env.SENTRY_DSN),
        smtp:       Boolean(process.env.BLUEHOST_SMTP_HOST),
        // In deep mode this reflects the real probe; in shallow mode it
        // still reports env-var presence (backward compatible with
        // callers that only look at this field).
        supabase:   deep ? (supabaseProbe?.ok ?? false) : Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
        stripe:     Boolean(process.env.STRIPE_SECRET_KEY),
        cronSecret: Boolean(process.env.CRON_SECRET),
      },
      // Only present in deep mode — additive field, safe for existing
      // JSON consumers.
      ...(supabaseProbe !== null && { probes: { supabase: supabaseProbe } }),
      integrations: {
        linkedin: Boolean(process.env.LINKEDIN_API_KEY),
        indeed:   Boolean(process.env.INDEED_PUBLISHER_ID),
      },
    },
    {
      status: degraded ? 503 : 200,
      headers: {
        "Cache-Control": "public, max-age=10, s-maxage=10",
      },
    }
  );
}
