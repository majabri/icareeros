/**
 * POST /api/admin/webhooks/sentry
 *
 * Sentry "Internal Integration" webhook receiver. Authenticates via the
 * native `sentry-hook-signature` header — Sentry signs the raw body with
 * HMAC-SHA256 using the integration's client secret (stored in
 * `SENTRY_WEBHOOK_SECRET`).
 *
 * Configure in Sentry: Settings → Developer Settings → Internal Integrations
 *   URL:     https://icareeros.com/api/admin/webhooks/sentry
 *   Events:  issue.created, issue.resolved
 *   Secret:  copy "Client Secret" into Vercel env var `SENTRY_WEBHOOK_SECRET`.
 *
 * ADR-005 Phase 1 (W6-D).
 */

import { NextRequest, NextResponse } from "next/server";
import {
  logInfrastructureEvent,
  type InfrastructureEventSeverity,
} from "@/lib/observability/logInfrastructureEvent";
import { verifyHmacSignature } from "@/lib/observability/verifyHmacSignature";

interface SentryWebhookBody {
  action?: string;
  installation?: { uuid?: string };
  data?: {
    issue?: {
      id?:        string;
      title?:     string;
      level?:     string;
      project?:   { slug?: string; name?: string };
      culprit?:   string;
      permalink?: string;
      count?:     string | number;
      lastSeen?:  string;
    };
  };
  [k: string]: unknown;
}

function severityFor(level: string | undefined, action: string | undefined): InfrastructureEventSeverity {
  if (action === "resolved")    return "info";
  if (level  === "fatal")       return "critical";
  if (level  === "error")       return "error";
  if (level  === "warning")     return "warning";
  return "info";
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  const auth = verifyHmacSignature(
    rawBody,
    req.headers.get("sentry-hook-signature"),
    process.env.SENTRY_WEBHOOK_SECRET,
    "sha256",
  );
  if (!auth.ok) {
    return NextResponse.json({ error: "unauthorized", reason: auth.reason }, { status: 401 });
  }

  let body: SentryWebhookBody;
  try { body = JSON.parse(rawBody) as SentryWebhookBody; }
  catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }

  const action     = typeof body.action === "string" ? body.action : "unknown";
  const issue      = body.data?.issue;
  const eventType  = `issue.${action}`;
  const resolvedAt = action === "resolved" ? new Date().toISOString() : null;

  const result = await logInfrastructureEvent({
    source:      "sentry",
    event_type:  eventType,
    severity:    severityFor(issue?.level, action),
    resolved_at: resolvedAt,
    payload: {
      issue_id:        issue?.id,
      title:           issue?.title,
      level:           issue?.level,
      project:         issue?.project?.slug,
      culprit:         issue?.culprit,
      permalink:       issue?.permalink,
      event_count:     issue?.count,
      last_seen:       issue?.lastSeen,
      installation_id: body.installation?.uuid,
      raw:             body,
    },
  });

  return NextResponse.json({ ok: result.ok, event_id: result.id ?? null }, { status: 200 });
}
