/**
 * POST /api/admin/webhooks/vercel
 *
 * Vercel project webhook receiver. Authenticates via the native
 * `x-vercel-signature` header — Vercel signs the raw body with HMAC-SHA1
 * using the secret configured on the webhook (and stored in
 * `VERCEL_WEBHOOK_SECRET`).
 *
 * Configure in Vercel: Project → Settings → Webhooks → Create webhook
 *   URL:     https://icareeros.com/api/admin/webhooks/vercel
 *   Events:  deployment.created, deployment.succeeded, deployment.error
 *   Secret:  set Vercel's auto-generated webhook secret as `VERCEL_WEBHOOK_SECRET`
 *            (Production + Preview) in `vercel.com/jabri-solutions/icareeros/settings/environment-variables`.
 *
 * ADR-005 Phase 1 (W6-D).
 */

import { NextRequest, NextResponse } from "next/server";
import {
  logInfrastructureEvent,
  type InfrastructureEventSeverity,
} from "@/lib/observability/logInfrastructureEvent";
import { verifyHmacSignature } from "@/lib/observability/verifyHmacSignature";

interface VercelWebhookBody {
  type?: string;
  id?: string;
  createdAt?: number;
  payload?: {
    deployment?: {
      id?: string;
      url?: string;
      meta?: Record<string, unknown>;
    };
    project?: { id?: string; name?: string };
    target?: string;
    [k: string]: unknown;
  };
  [k: string]: unknown;
}

function severityFor(eventType: string): InfrastructureEventSeverity {
  if (eventType === "deployment.error" || eventType === "deployment.canceled") return "error";
  return "info";
}

export async function POST(req: NextRequest) {
  // 1. Read RAW body (signature is over the bytes we received).
  const rawBody = await req.text();

  // 2. HMAC-SHA1 against `x-vercel-signature`.
  const auth = verifyHmacSignature(
    rawBody,
    req.headers.get("x-vercel-signature"),
    process.env.VERCEL_WEBHOOK_SECRET,
    "sha1",
  );
  if (!auth.ok) {
    return NextResponse.json({ error: "unauthorized", reason: auth.reason }, { status: 401 });
  }

  // 3. Parse body.
  let body: VercelWebhookBody;
  try { body = JSON.parse(rawBody) as VercelWebhookBody; }
  catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }

  const eventType = typeof body.type === "string" ? body.type : "vercel.unknown";

  const result = await logInfrastructureEvent({
    source:     "vercel",
    event_type: eventType,
    severity:   severityFor(eventType),
    payload: {
      vercel_event_id:    body.id,
      target:             body.payload?.target,
      project:            body.payload?.project?.name,
      deployment_id:      body.payload?.deployment?.id,
      deployment_url:     body.payload?.deployment?.url,
      vercel_created_at:  typeof body.createdAt === "number" ? new Date(body.createdAt).toISOString() : null,
      raw:                body,
    },
  });

  return NextResponse.json({ ok: result.ok, event_id: result.id ?? null }, { status: 200 });
}
