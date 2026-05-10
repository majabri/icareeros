/**
 * POST /api/admin/webhooks/sentry
 *
 * Sentry "Internal Integration" webhook receiver. Logs issue events into
 * `infrastructure_events`. v1 uses shared-secret auth (`Authorization:
 * Bearer ${SENTRY_WEBHOOK_SECRET}`); native HMAC verification via
 * `sentry-hook-signature` is a follow-up.
 *
 * Configure in Sentry: Settings → Developer Settings → Internal Integrations
 *   URL:     https://icareeros.com/api/admin/webhooks/sentry
 *   Events:  issue.created, issue.resolved (error-spike threshold)
 *   Secret:  the value put in Vercel env var SENTRY_WEBHOOK_SECRET
 *
 * ADR-005 Phase 1 (W6-B).
 */

import { NextRequest, NextResponse } from "next/server";
import {
  logInfrastructureEvent,
  type InfrastructureEventSeverity,
} from "@/lib/observability/logInfrastructureEvent";
import { verifyWebhookSecret } from "@/lib/observability/verifyWebhookSecret";

interface SentryWebhookBody {
  action?:     string;
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
  if (action === "resolved") return "info";
  if (level === "fatal") return "critical";
  if (level === "error") return "error";
  if (level === "warning") return "warning";
  return "info";
}

export async function POST(req: NextRequest) {
  const auth = verifyWebhookSecret(
    req.headers.get("authorization"),
    process.env.SENTRY_WEBHOOK_SECRET,
  );
  if (!auth.ok) {
    return NextResponse.json({ error: "unauthorized", reason: auth.reason }, { status: 401 });
  }

  let body: SentryWebhookBody;
  try {
    body = (await req.json()) as SentryWebhookBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const action = typeof body.action === "string" ? body.action : "unknown";
  const issue = body.data?.issue;
  const eventType = `issue.${action}`;
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
