/**
 * POST /api/admin/webhooks/vercel
 *
 * Vercel project webhook receiver. Logs deployment events into
 * `infrastructure_events`. v1 uses shared-secret auth (`Authorization:
 * Bearer ${VERCEL_WEBHOOK_SECRET}`); HMAC-SHA1 (Vercel's native scheme via
 * `x-vercel-signature`) is a follow-up.
 *
 * Configure in Vercel: Settings → Webhooks → Add
 *   URL:     https://icareeros.com/api/admin/webhooks/vercel
 *   Events:  deployment.created, deployment.succeeded, deployment.error
 *   Secret:  the value put in Vercel env var VERCEL_WEBHOOK_SECRET
 *
 * ADR-005 Phase 1 (W6-B).
 */

import { NextRequest, NextResponse } from "next/server";
import {
  logInfrastructureEvent,
  type InfrastructureEventSeverity,
} from "@/lib/observability/logInfrastructureEvent";
import { verifyWebhookSecret } from "@/lib/observability/verifyWebhookSecret";

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
  if (eventType === "deployment.succeeded") return "info";
  if (eventType === "deployment.created" || eventType === "deployment.ready") return "info";
  return "info";
}

export async function POST(req: NextRequest) {
  // 1. Auth — fail closed if secret unset.
  const auth = verifyWebhookSecret(
    req.headers.get("authorization"),
    process.env.VERCEL_WEBHOOK_SECRET,
  );
  if (!auth.ok) {
    return NextResponse.json({ error: "unauthorized", reason: auth.reason }, { status: 401 });
  }

  // 2. Parse body
  let body: VercelWebhookBody;
  try {
    body = (await req.json()) as VercelWebhookBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const eventType = typeof body.type === "string" ? body.type : "vercel.unknown";

  // 3. Persist
  const result = await logInfrastructureEvent({
    source:     "vercel",
    event_type: eventType,
    severity:   severityFor(eventType),
    payload: {
      vercel_event_id: body.id,
      target:          body.payload?.target,
      project:         body.payload?.project?.name,
      deployment_id:   body.payload?.deployment?.id,
      deployment_url:  body.payload?.deployment?.url,
      vercel_created_at: typeof body.createdAt === "number"
        ? new Date(body.createdAt).toISOString()
        : null,
      raw: body,
    },
  });

  return NextResponse.json({ ok: result.ok, event_id: result.id ?? null }, { status: 200 });
}
