/**
 * POST /api/admin/webhooks/betterstack
 *
 * BetterStack uptime / on-call webhook receiver. Logs incident events into
 * `infrastructure_events`. Auth via `Authorization: Bearer
 * ${BETTERSTACK_WEBHOOK_SECRET}` configured per-monitor in BetterStack.
 *
 * Configure in BetterStack: Monitors → On-call → Alert destinations
 *   URL:     https://icareeros.com/api/admin/webhooks/betterstack
 *   Headers: Authorization: Bearer <BETTERSTACK_WEBHOOK_SECRET>
 *
 * ADR-005 Phase 1 (W6-B).
 */

import { NextRequest, NextResponse } from "next/server";
import {
  logInfrastructureEvent,
  type InfrastructureEventSeverity,
} from "@/lib/observability/logInfrastructureEvent";
import { verifyWebhookSecret } from "@/lib/observability/verifyWebhookSecret";

interface BetterStackWebhookBody {
  data?: {
    type?: string;
    attributes?: {
      name?:           string;
      url?:            string;
      cause?:          string;
      started_at?:     string;
      acknowledged_at?: string;
      resolved_at?:    string;
      [k: string]: unknown;
    };
  };
  [k: string]: unknown;
}

function severityFor(eventType: string): InfrastructureEventSeverity {
  if (eventType === "incident.fired" || eventType === "monitor.down") return "critical";
  if (eventType === "incident.acknowledged") return "warning";
  if (eventType === "incident.resolved" || eventType === "monitor.up") return "info";
  return "warning";
}

export async function POST(req: NextRequest) {
  const auth = verifyWebhookSecret(
    req.headers.get("authorization"),
    process.env.BETTERSTACK_WEBHOOK_SECRET,
  );
  if (!auth.ok) {
    return NextResponse.json({ error: "unauthorized", reason: auth.reason }, { status: 401 });
  }

  let body: BetterStackWebhookBody;
  try {
    body = (await req.json()) as BetterStackWebhookBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  // Derive event type from BetterStack data shape.
  // Most BetterStack incident webhooks come with data.type='incident' and
  // attributes.{started_at,acknowledged_at,resolved_at}.
  const a = body.data?.attributes;
  let eventType = "incident.fired";
  let resolvedAt: string | null = null;
  if (a?.resolved_at) {
    eventType = "incident.resolved";
    resolvedAt = a.resolved_at;
  } else if (a?.acknowledged_at) {
    eventType = "incident.acknowledged";
  }

  const result = await logInfrastructureEvent({
    source:      "betterstack",
    event_type:  eventType,
    severity:    severityFor(eventType),
    resolved_at: resolvedAt,
    payload: {
      monitor_name:   a?.name,
      monitor_url:    a?.url,
      cause:          a?.cause,
      started_at:     a?.started_at,
      acknowledged_at: a?.acknowledged_at,
      resolved_at:    a?.resolved_at,
      raw:            body,
    },
  });

  return NextResponse.json({ ok: result.ok, event_id: result.id ?? null }, { status: 200 });
}
