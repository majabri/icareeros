/**
 * GET  /api/admin/feature-flags  → list flags with full metadata
 * PATCH /api/admin/feature-flags → toggle a flag { key, enabled }
 *
 * Sprint 4 W3-D — extended to surface description, value, updated_by,
 * is_production. Every PATCH is gated by `requirePermission('system.toggle_flags')`
 * and audit-logged via logAdminAction.
 */

import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { requirePermission, permissionErrorResponse } from "@/lib/admin/permissions.server";
import { logAdminAction } from "@/lib/admin/audit";

export const dynamic = "force-dynamic";

function makeSvc() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

const FLAG_COLUMNS = "key, enabled, description, value, updated_at, updated_by, is_production";

// ── GET — list all flags + last-updater email ─────────────────────────────
export async function GET() {
  const r = await requirePermission("system.view_metrics");
  if (!r.ok) return permissionErrorResponse(r);

  const svc = makeSvc();
  const { data: flags, error } = await svc
    .from("feature_flags")
    .select(FLAG_COLUMNS)
    .order("key");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Resolve updated_by UUIDs → admin emails (single round-trip)
  const uuids = Array.from(new Set((flags ?? []).map(f => f.updated_by).filter(Boolean) as string[]));
  const emailByUid = new Map<string, string>();
  if (uuids.length > 0) {
    // listUsers paginates; the admin pool is small (< 10), so one page is enough
    const { data: { users } } = await svc.auth.admin.listUsers({ perPage: 1000 });
    for (const u of users) {
      if (u.id && u.email && uuids.includes(u.id)) emailByUid.set(u.id, u.email);
    }
  }

  const enriched = (flags ?? []).map(f => ({
    ...f,
    updated_by_email: f.updated_by ? (emailByUid.get(f.updated_by as string) ?? null) : null,
  }));

  return NextResponse.json({ flags: enriched });
}

// ── PATCH — toggle a flag ─────────────────────────────────────────────────
export async function PATCH(req: Request) {
  const r = await requirePermission("system.toggle_flags");
  if (!r.ok) return permissionErrorResponse(r);

  const body = (await req.json().catch(() => ({}))) as { key?: string; enabled?: boolean };
  if (typeof body.key !== "string" || typeof body.enabled !== "boolean") {
    return NextResponse.json(
      { error: "Body must be { key: string, enabled: boolean }" },
      { status: 400 },
    );
  }

  const svc = makeSvc();

  // Capture before-state for the audit row
  const { data: before } = await svc
    .from("feature_flags")
    .select("enabled, is_production")
    .eq("key", body.key)
    .maybeSingle();

  const { data, error } = await svc
    .from("feature_flags")
    .update({
      enabled:    body.enabled,
      updated_at: new Date().toISOString(),
      updated_by: r.ctx.user_id,
    })
    .eq("key", body.key)
    .select(FLAG_COLUMNS)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data)  return NextResponse.json({ error: "Flag not found" }, { status: 404 });

  await logAdminAction({
    ctx: r.ctx,
    action: "flags.toggled",
    target_table: "feature_flags",
    target_id: body.key,
    before_value: before ? { enabled: before.enabled, is_production: before.is_production } : null,
    after_value:  { enabled: body.enabled, is_production: data.is_production },
  });

  return NextResponse.json({
    flag: { ...data, updated_by_email: r.ctx.email },
  });
}
