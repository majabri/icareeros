/**
 * GET /api/admin/all-users — combined read-only user overview.
 *
 * Returns every profile (no role filter) joined with the role + plan
 * signal needed by the /admin/users "All Users" tab. Each row carries
 * a derived `role_badge`:
 *   "Admin"     — profiles.admin_role IS NOT NULL OR legacy role='admin'
 *   "Hire User" — user_roles.role = 'employer' (and not admin)
 *   "Jobs User" — everything else (default)
 *
 * Mirrors the existing /api/admin/hire-users + /api/admin/admin-users
 * pattern — requirePermission, service-role client, no audit log (read-only).
 */

import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { requirePermission, permissionErrorResponse } from "@/lib/admin/permissions.server";

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

export type RoleBadge = "Jobs User" | "Hire User" | "Admin";

export interface AllUserRow {
  user_id:         string;
  email:           string | null;
  role_badge:      RoleBadge;
  plan:            string;  // "free" | "starter" | "standard" | "pro" | "growth" | "enterprise" | "—"
  created_at:      string;
  email_confirmed: boolean;
}

export async function GET() {
  const r = await requirePermission("users.view_list");
  if (!r.ok) return permissionErrorResponse(r);

  const svc = makeSvc();

  const [
    { data: profiles, error: profErr },
    { data: userRoles },
    { data: subs },
    { data: authUsers },
  ] = await Promise.all([
    svc.from("profiles")
       .select("user_id, email, role, admin_role, created_at")
       .order("created_at", { ascending: false }),
    svc.from("user_roles").select("user_id, role"),
    svc.from("user_subscriptions").select("user_id, plan, status"),
    svc.auth.admin.listUsers({ perPage: 1000 }),
  ]);
  if (profErr) return NextResponse.json({ error: profErr.message }, { status: 500 });

  const userRoleMap = new Map((userRoles ?? []).map(r => [r.user_id as string, r.role as string]));
  const planMap     = new Map((subs ?? []).map(s => [s.user_id as string, s.plan as string]));
  const confirmedMap = new Map(
    (authUsers?.users ?? []).map(u => [u.id, !!u.email_confirmed_at]),
  );

  function badge(p: { role: unknown; admin_role: unknown }, urole: string | undefined): RoleBadge {
    if (p.admin_role || p.role === "admin") return "Admin";
    if (urole === "employer") return "Hire User";
    return "Jobs User";
  }

  const users: AllUserRow[] = (profiles ?? []).map(p => {
    const urole = userRoleMap.get(p.user_id as string);
    const b     = badge(p, urole);
    return {
      user_id:         p.user_id as string,
      email:           (p.email as string | null) ?? null,
      role_badge:      b,
      // Admins don't carry a paying subscription; show — instead of "free"
      // to avoid implying they're on a tier.
      plan:            b === "Admin" ? "—" : (planMap.get(p.user_id as string) ?? "free"),
      created_at:      (p.created_at as string) ?? new Date(0).toISOString(),
      email_confirmed: confirmedMap.get(p.user_id as string) ?? false,
    };
  });

  return NextResponse.json({ users });
}
