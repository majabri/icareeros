/**
 * POST src/app/api/admin/force-discover-perplexity
 *
 * Sprint 4 W3-E — Admin trigger for /api/cron/discover-perplexity.
 * Gated by 'opportunities.force_ingest', audit-logged.
 */

import { NextResponse } from "next/server";
import { requirePermission, permissionErrorResponse } from "@/lib/admin/permissions.server";
import { logAdminAction } from "@/lib/admin/audit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const r = await requirePermission("opportunities.force_ingest");
  if (!r.ok) return permissionErrorResponse(r);

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });

  const origin = new URL(req.url).origin;
  let triggered = false;
  let upstreamStatus = 0;
  let upstreamBody = "";
  try {
    const res = await fetch(`${origin}/api/cron/discover-perplexity`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cronSecret}` },
    });
    upstreamStatus = res.status;
    triggered = res.ok;
    if (!res.ok) {
      upstreamBody = (await res.text().catch(() => "")).slice(0, 500);
    }
  } catch (e) {
    const msg = (e as Error).message;
    await logAdminAction({
      ctx: r.ctx,
      action: "opportunities.perplexity_triggered",
      target_table: "opportunities",
      after_value: { triggered: false, upstream_status: 0, network_error: msg },
    });
    return NextResponse.json(
      { ok: false, error: `Network error reaching upstream: ${msg}` },
      { status: 502 },
    );
  }

  await logAdminAction({
    ctx: r.ctx,
    action: "opportunities.perplexity_triggered",
    target_table: "opportunities",
    after_value: { triggered, upstream_status: upstreamStatus, upstream_body: upstreamBody || undefined },
  });

  if (!triggered) {
    return NextResponse.json(
      {
        ok: false,
        error: `Upstream cron route returned HTTP ${upstreamStatus}`,
        upstream_status: upstreamStatus,
        upstream_body: upstreamBody || undefined,
      },
      { status: upstreamStatus >= 400 ? upstreamStatus : 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    message: "Triggered",
    upstream_status: upstreamStatus,
  });
}
