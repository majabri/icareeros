/**
 * POST /api/admin/webhooks/vercel
 *
 * Vercel project webhook receiver. Authenticates via the native
 * `x-vercel-signature` header (HMAC-SHA1 of the raw body with the
 * `VERCEL_WEBHOOK_SECRET`).
 *
 * Sprint 2 W2-C (ADR-005 Phase 2):
 *   In addition to the existing infrastructure_events log, the route now
 *   upserts into `public.deployment_history` so the deploy gate can:
 *     • detect rollback patterns
 *     • score deploys by post-deploy error rate
 *     • pause auto-deploys when N consecutive deploys fail
 *
 *   The actual gate decision happens 5 minutes after `deployment.ready`
 *   via the /api/cron/deploy-gate-check cron, which reads recent rows
 *   from `deployment_history` and updates `gate_decision`.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  logInfrastructureEvent,
  type InfrastructureEventSeverity,
} from "@/lib/observability/logInfrastructureEvent";
import { verifyHmacSignature } from "@/lib/observability/verifyHmacSignature";

interface VercelDeploymentPayload {
  id?: string;
  url?: string;
  meta?: {
    githubCommitSha?:     string;
    githubCommitRef?:     string;
    githubCommitMessage?: string;
    [k: string]: unknown;
  };
  inspectorUrl?: string;
}

interface VercelWebhookBody {
  type?: string;
  id?: string;
  createdAt?: number;
  payload?: {
    deployment?: VercelDeploymentPayload;
    project?:    { id?: string; name?: string };
    target?:     string;
    [k: string]: unknown;
  };
  [k: string]: unknown;
}

function severityFor(eventType: string): InfrastructureEventSeverity {
  if (eventType === "deployment.error" || eventType === "deployment.canceled") return "error";
  return "info";
}

function stateFor(eventType: string): string {
  if (eventType === "deployment.created")   return "BUILDING";
  if (eventType === "deployment.succeeded") return "READY";
  if (eventType === "deployment.error")     return "ERROR";
  if (eventType === "deployment.canceled")  return "CANCELED";
  return "UNKNOWN";
}

/** Upsert this deployment into `public.deployment_history` (W2-C). */
async function recordDeployment(
  body: VercelWebhookBody,
  eventType: string,
): Promise<{ ok: boolean; error?: string }> {
  const dep = body.payload?.deployment;
  if (!dep?.id) return { ok: false, error: "no_deployment_id" };

  const url    = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key    = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { ok: false, error: "supabase_env_missing" };

  const sb = createClient(url, key, { auth: { persistSession: false } });

  const state    = stateFor(eventType);
  const isReady  = eventType === "deployment.succeeded";
  const isError  = eventType === "deployment.error";

  const row = {
    vercel_deployment_id: dep.id,
    vercel_url:           dep.url ?? "",
    environment:          body.payload?.target ?? "production",
    branch:               dep.meta?.githubCommitRef ?? null,
    commit_sha:           dep.meta?.githubCommitSha ?? "unknown",
    commit_message:       dep.meta?.githubCommitMessage ?? null,
    state,
    ready_at:             isReady ? new Date().toISOString() : null,
    gate_decision:        isError ? "fail" : "pending",
    gate_rationale:       isError ? "deployment.error from Vercel" : null,
    metadata: {
      vercel_event_id: body.id,
      inspector_url:   dep.inspectorUrl ?? null,
    },
  };

  const { error } = await sb
    .from("deployment_history")
    .upsert(row, { onConflict: "vercel_deployment_id" });
  if (error) return { ok: false, error: error.message };

  // Consecutive-failure detection
  if (isError) {
    const { data: recent } = await sb
      .from("deployment_history")
      .select("state, environment, created_at")
      .eq("environment", row.environment)
      .order("created_at", { ascending: false })
      .limit(3);

    const lastThree = recent ?? [];
    const allError  = lastThree.length >= 3 && lastThree.every((r: { state: string }) => r.state === "ERROR");
    if (allError) {
      await logInfrastructureEvent({
        source:     "deploy-gate",
        event_type: "deploy.consecutive_failures",
        severity:   "critical",
        payload: {
          environment: row.environment,
          deployment_ids: lastThree.map((r: { state: string; created_at: string }) => r.created_at),
          message: "3+ consecutive ERROR deployments — review before next merge",
        },
      });
    }
  }

  return { ok: true };
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  const auth = verifyHmacSignature(
    rawBody,
    req.headers.get("x-vercel-signature"),
    process.env.VERCEL_WEBHOOK_SECRET,
    "sha1",
  );
  if (!auth.ok) {
    return NextResponse.json({ error: "unauthorized", reason: auth.reason }, { status: 401 });
  }

  let body: VercelWebhookBody;
  try { body = JSON.parse(rawBody) as VercelWebhookBody; }
  catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }

  const eventType = typeof body.type === "string" ? body.type : "vercel.unknown";

  // 1) Log to infrastructure_events (Phase 1 behavior — unchanged).
  const evtResult = await logInfrastructureEvent({
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

  // 2) Phase 2 (W2-C): also upsert into deployment_history for deploy gate.
  const depResult = await recordDeployment(body, eventType);

  return NextResponse.json({
    ok: evtResult.ok,
    event_id: evtResult.id ?? null,
    deployment_recorded: depResult.ok,
    deployment_error: depResult.error ?? null,
  }, { status: 200 });
}
