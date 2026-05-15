import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requirePermission, permissionErrorResponse } from "@/lib/admin/permissions.server";
import { isValidAdminRole, type AdminRole } from "@/lib/admin/permissions";
import { logAdminAction } from "@/lib/admin/audit";

/**
 * Sprint 4 W3-G — Role assignment API
 *
 * PATCH /api/admin/roles
 *   body: { user_id: string, admin_role: AdminRole | null }
 *
 * SAFETY (defense-in-depth — the UI hides these but the API also enforces):
 *  • Caller must hold "roles.assign" (super_admin only).
 *  • Caller cannot change their own admin_role — they must be demoted by
 *    another super_admin, which prevents the classic "I just locked myself
 *    out" mistake.
 *  • The last remaining super_admin cannot be demoted. We re-count under
 *    the same transaction-ish window (Supabase doesn't expose true
 *    serializable transactions on the JS client, so we count → compare →
 *    write; a race here would at worst leave zero super_admins, which the
 *    page-level guard catches on next reload by surfacing the SQL backstop).
 *  • admin_role=null clears all admin access (legacy role='admin' is also
 *    flipped back to 'user' so the user is truly demoted).
 */

export const dynamic    = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime    = "nodejs";

function makeSvc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export async function PATCH(req: NextRequest) {
  const r = await requirePermission("roles.assign");
  if (!r.ok) return permissionErrorResponse(r);

  const body = (await req.json().catch(() => ({}))) as {
    user_id?:    string;
    admin_role?: string | null;
  };

  const targetId = typeof body.user_id === "string" ? body.user_id.trim() : "";
  if (!targetId) {
    return NextResponse.json(
      { error: "Body must include { user_id: string }" },
      { status: 400 },
    );
  }

  // Validate the requested role. null is allowed (= clear admin access).
  let nextRole: AdminRole | null = null;
  if (body.admin_role === null || body.admin_role === undefined || body.admin_role === "") {
    nextRole = null;
  } else if (typeof body.admin_role === "string" && isValidAdminRole(body.admin_role)) {
    nextRole = body.admin_role;
  } else {
    return NextResponse.json(
      { error: `Invalid admin_role. Must be one of: super_admin | admin | support_l2 | support_l1 | viewer | null` },
      { status: 400 },
    );
  }

  // SAFETY 1: caller can't change their own role.
  if (targetId === r.ctx.user_id) {
    return NextResponse.json(
      { error: "You cannot change your own admin_role. Ask another super_admin." },
      { status: 403 },
    );
  }

  const svc = makeSvc();

  // Pull the target row + super_admin count for the safety check.
  const [
    { data: target, error: targetErr },
    { count: superAdminCount, error: countErr },
  ] = await Promise.all([
    svc.from("profiles")
      .select("user_id, email, role, admin_role")
      .eq("user_id", targetId)
      .maybeSingle(),
    svc.from("profiles")
      .select("user_id", { count: "exact", head: true })
      .eq("admin_role", "super_admin"),
  ]);

  if (targetErr) return NextResponse.json({ error: targetErr.message }, { status: 500 });
  if (countErr)  return NextResponse.json({ error: countErr.message  }, { status: 500 });
  if (!target)   return NextResponse.json({ error: "Target user not found" }, { status: 404 });

  // Effective current role mirrors permissions.server.ts logic.
  const currentRole: AdminRole | null =
    (target.admin_role as AdminRole | null) ??
    (target.role === "admin" ? "super_admin" : null);

  // SAFETY 2: don't demote the last super_admin.
  const isDemotionFromSuperAdmin =
    currentRole === "super_admin" && nextRole !== "super_admin";
  if (isDemotionFromSuperAdmin && (superAdminCount ?? 0) <= 1) {
    return NextResponse.json(
      { error: "Cannot demote the last super_admin. Promote another super_admin first." },
      { status: 409 },
    );
  }

  // Build the update payload.
  // - admin_role gets set/cleared to the new value
  // - legacy 'role' column: if we're clearing admin entirely, flip it back
  //   to 'user' so this person truly loses admin access. If we're setting
  //   any admin_role, leave role alone (it's not load-bearing once
  //   admin_role is present, but it's the historical fallback path).
  const updatePayload: Record<string, unknown> = {
    admin_role: nextRole,
  };
  if (nextRole === null && target.role === "admin") {
    updatePayload.role = "user";
  }

  const { data: updated, error: updateErr } = await svc
    .from("profiles")
    .update(updatePayload)
    .eq("user_id", targetId)
    .select("user_id, email, role, admin_role")
    .single();

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  // Audit. Use the clear-vs-set distinction in the action name so it's easy
  // to grep for revocations in the audit log.
  await logAdminAction({
    ctx:           r.ctx,
    action:        nextRole === null ? "roles.cleared" : "roles.assigned",
    target_table:  "profiles",
    target_id:     targetId,
    before_value:  { admin_role: currentRole, legacy_role: target.role },
    after_value:   { admin_role: updated.admin_role, legacy_role: updated.role },
  });

  return NextResponse.json({
    ok: true,
    user: {
      user_id:    updated.user_id,
      email:      updated.email,
      admin_role: updated.admin_role,
      role:       updated.role,
    },
  });
}
