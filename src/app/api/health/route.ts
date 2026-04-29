import { NextResponse } from "next/server";

/**
 * GET /api/health
 *
 * Health check endpoint used by:
 * - BetterStack uptime monitoring (pings every 30s)
 * - Sentry cron check-in
 * - Load test baseline (measures p95 latency of a cold hit)
 *
 * Returns 200 with JSON payload so monitors can validate body, not just status.
 */
export const runtime = "edge";

export async function GET() {
  return NextResponse.json(
    {
      status: "ok",
      service: "icareeros",
      timestamp: new Date().toISOString(),
      version: process.env.NEXT_PUBLIC_APP_VERSION ?? "dev",
    },
    {
      status: 200,
      headers: {
        // Allow public CDN caching for 10 s, prevents hammering origin
        "Cache-Control": "public, max-age=10, s-maxage=10",
      },
    }
  );
}
