/**
 * POST /api/admin/maintenance/toggle
 *
 * Sprint 4 W3-A — Quick action endpoint that toggles
 * `feature_flags.key='maintenance_mode'` on/off. Gated by
 * `system.toggle_flags` permission. Logs to admin_audit_log.
 *
 * If the flag row doesn't exist yet, this creates it with enabled=true
 * (the first toggle is always ON).
 */

import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { requirePermission, permissionErrorResponse } from "@/lib/admin/permissions.server";
import { logAdminAction } from "@/lib/admin/audit";

export const dynamic = "force-dynamic";

export async function POST() {
  const r = await requirePermission("system.toggle_flags");
  if (!r.ok) return permissionErrorResponse(r);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "Supabase env missing" }, { status: 500 });

  const sb = createServiceClient(url, key, { auth: { persistSession: false } });

  const { data: existing } = await sb
    .from("feature_flags")
    .select("enabled")
    .eq("key", "maintenance_mode")
    .maybeSingle();

  const before = existing?.enabled ?? false;
  const after  = !before;

  if (existing) {
    const { error } = await sb
      .from("feature_flags")
      .update({ enabled: after, updated_at: new Date().toISOString() })
      .eq("key", "maintenance_mode");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { error } = await sb
      .from("feature_flags")
      .insert({
        key:         "maintenance_mode",
        enabled:     after,
        description: "Sprint 4 W3-A: when true, serve a maintenance page on non-admin routes.",
      });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAdminAction({
    ctx: r.ctx,
    action: "flags.toggled",
    target_table: "feature_flags",
    target_id: "maintenance_mode",
    before_value: { enabled: before },
    after_value:  { enabled: after  },
  });

  return NextResponse.json({ ok: true, enabled: after });
}
