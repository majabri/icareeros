import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { requirePermission } from "@/lib/admin/permissions.server";
import { ROLE_HIERARCHY, type AdminRole } from "@/lib/admin/permissions";
import AdminPageHeader from "@/components/admin/ui/AdminPageHeader";
import AdminEmptyState from "@/components/admin/ui/AdminEmptyState";
import AdminRolesPanel, { type AdminRoleRow } from "@/components/admin/AdminRolesPanel";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Role Management — iCareerOS Admin" };

function makeSvc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

/**
 * Sprint 4 W3-G — /admin/roles
 *
 * Lists every profile with a non-NULL admin_role (or legacy role='admin'),
 * shows email + current role + hire date, and lets a super_admin promote /
 * demote within the 5-tier model.
 *
 * SAFETY RULES (enforced both here and in the PATCH route):
 *  1. Only super_admin can view this page.
 *  2. A super_admin cannot demote themselves — that's how teams accidentally
 *     lock themselves out. The row for `ctx.user_id` is rendered read-only.
 *  3. The system must keep at least ONE super_admin at all times. If only one
 *     super_admin remains, demoting them is blocked (defense-in-depth — even
 *     if a super_admin demotes someone ELSE who would leave the system without
 *     a top-tier admin, we refuse).
 *  4. Every change is logged via logAdminAction("roles.assigned").
 */
export default async function AdminRolesPage() {
  // Page-level gate. Anything below this line assumes super_admin.
  const r = await requirePermission("roles.assign");
  if (!r.ok) redirect("/admin?error=forbidden");

  const svc = makeSvc();

  // 1) Pull every profile carrying an admin signal — either the new
  //    admin_role column or the legacy role='admin' fallback. The admin
  //    pool is small (< 20 in practice), so a single query is fine.
  const { data: profiles, error } = await svc
    .from("profiles")
    .select("user_id, email, full_name, role, admin_role, created_at")
    .or("admin_role.not.is.null,role.eq.admin")
    .order("created_at", { ascending: true });

  if (error) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 space-y-6">
        <AdminPageHeader title="Role Management" description="Manage admin roles across the team." />
        <AdminEmptyState
          title="Couldn't load admin roster"
          description={error.message}
        />
      </div>
    );
  }

  // 2) Normalize to AdminRoleRow. Legacy role='admin' without admin_role
  //    surfaces as effective super_admin (matches requirePermission's
  //    backward-compat logic) so the operator sees the truth on screen.
  const rows: AdminRoleRow[] = (profiles ?? []).map(p => {
    const effective: AdminRole | null =
      (p.admin_role as AdminRole | null) ??
      (p.role === "admin" ? "super_admin" : null);
    return {
      user_id:        p.user_id as string,
      email:          (p.email as string | null) ?? "(no email)",
      full_name:      p.full_name as string | null,
      legacy_role:    p.role as string | null,
      admin_role:     effective,
      created_at:     p.created_at as string,
      // is_self flag drives the read-only display on the current user's row.
      is_self:        p.user_id === r.ctx.user_id,
    };
  });

  // 3) Count super_admins for the "last super_admin" guard. The panel uses
  //    this to disable demote-to-non-super on the last one.
  const superAdminCount = rows.filter(r2 => r2.admin_role === "super_admin").length;

  // 4) Sort by hierarchy desc, then by email.
  rows.sort((a, b) => {
    const ra = a.admin_role ? ROLE_HIERARCHY[a.admin_role] : 0;
    const rb = b.admin_role ? ROLE_HIERARCHY[b.admin_role] : 0;
    if (ra !== rb) return rb - ra;
    return (a.email ?? "").localeCompare(b.email ?? "");
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 space-y-6">
      <AdminPageHeader
        title="Role Management"
        description={
          <>
            5-tier admin role model. <strong>super_admin</strong> &gt; admin &gt; support_l2 &gt; support_l1 &gt; viewer.
            Changes take effect immediately and are written to the audit log.
            You cannot demote yourself, and the system always retains at least one super_admin.
          </>
        }
      />

      {rows.length === 0 ? (
        <AdminEmptyState
          title="No admins on the roster yet"
          description="Use the SQL backstop in CLAUDE.md to seed the first super_admin: UPDATE profiles SET admin_role='super_admin' WHERE email='you@…'."
        />
      ) : (
        <AdminRolesPanel
          rows={rows}
          superAdminCount={superAdminCount}
          currentUserId={r.ctx.user_id}
          currentUserEmail={r.ctx.email}
        />
      )}
    </div>
  );
}
