/**
 * POST /api/admin/force-ingest-ats
 *
 * Sprint 4 W3-A — Quick action endpoint that triggers the existing
 * `/api/cron/ingest-ats` cron route immediately. Gated by
 * `opportunities.force_ingest` permission (admin + super_admin only).
 * Logs to admin_audit_log on success.
 *
 * NOTE: the actual cron route requires CRON_SECRET as bearer auth.
 * We pass it from env on the server side.
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

  // Call our own cron route. In production this is icareeros.com; in preview/dev
  // we use the request origin so we hit the same deployment.
  const origin = new URL(req.url).origin;
  let triggered = false;
  let upstreamStatus = 0;
  try {
    const res = await fetch(`${origin}/api/cron/ingest-ats`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cronSecret}` },
    });
    upstreamStatus = res.status;
    triggered = res.ok;
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }

  await logAdminAction({
    ctx: r.ctx,
    action: "opportunities.ingest_triggered",
    target_table: "opportunities",
    after_value: { triggered, upstream_status: upstreamStatus },
  });

  return NextResponse.json({
    ok: triggered,
    message: triggered ? "Ingest triggered" : `Upstream HTTP ${upstreamStatus}`,
    upstream_status: upstreamStatus,
  });
}
