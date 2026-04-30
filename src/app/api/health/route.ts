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
 * Includes observability readiness flags (config present, not secret values).
 */
export const runtime = "edge";

export async function GET() {
  return NextResponse.json(
    {
      status: "ok",
      service: "icareeros",
      timestamp: new Date().toISOString(),
      version: process.env.NEXT_PUBLIC_APP_VERSION ?? "dev",
      observability: {
        sentry:     Boolean(process.env.SENTRY_DSN),
        smtp:       Boolean(process.env.BLUEHOST_SMTP_HOST),
        supabase:   Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
        stripe:     Boolean(process.env.STRIPE_SECRET_KEY),
        cronSecret: Boolean(process.env.CRON_SECRET),
      },
      integrations: {
        linkedin: Boolean(process.env.LINKEDIN_API_KEY),
        indeed:   Boolean(process.env.INDEED_PUBLISHER_ID),
      },
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "public, max-age=10, s-maxage=10",
      },
    }
  );
}
