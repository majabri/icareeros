/**
 * DELETE /api/admin/hire-users/[id] — permanently delete an employer.
 *
 * Cascades: deletes the auth.users row (Supabase admin API), which FK-cascades
 * to public.user_roles, public.employer_profiles, public.profiles, plus the
 * usual subscription/career data tables. Admin-only — gated by
 * requirePermission("users.delete") (super_admin).
 */

import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { requirePermission, permissionErrorResponse } from "@/lib/admin/permissions.server";
import { logAdminAction } from "@/lib/admin/audit";

export const dynamic    = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime    = "nodejs";

function makeSvc() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const r = await requirePermission("users.delete");
  if (!r.ok) return permissionErrorResponse(r);

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing user id" }, { status: 400 });

  // Defense in depth — caller cannot delete themselves through this endpoint.
  if (id === r.ctx.user_id) {
    return NextResponse.json({ error: "Cannot delete your own account" }, { status: 400 });
  }

  const svc = makeSvc();

  // Confirm the target is actually an employer before we let an admin
  // delete them via this endpoint (prevents accidentally wiping a job
  // seeker via the wrong tab).
  const { data: role } = await svc
    .from("user_roles")
    .select("role")
    .eq("user_id", id)
    .maybeSingle();
  if (role?.role !== "employer") {
    return NextResponse.json({ error: "Target user is not an employer" }, { status: 400 });
  }

  // Capture before-state for audit
  const { data: before } = await svc
    .from("profiles")
    .select("email, full_name")
    .eq("user_id", id)
    .maybeSingle();

  // Delete the auth.users row. ON DELETE CASCADE on user_roles + every
  // user-keyed public table handles the rest.
  const { error } = await svc.auth.admin.deleteUser(id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAction({
    ctx: r.ctx,
    action: "users.deleted",
    target_table: "auth.users",
    target_id: id,
    before_value: before ?? null,
    after_value: { deleted_at: new Date().toISOString(), tab: "hire" },
  });

  return NextResponse.json({ ok: true });
}
