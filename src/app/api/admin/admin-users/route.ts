/**
 * GET /api/admin/admin-users — list users with admin privileges.
 *
 * Admin privilege ≡ profiles.admin_role IS NOT NULL OR profiles.role = 'admin'
 * (same gate requirePermission uses). The 5-tier admin_role wins; legacy
 * role='admin' falls back to 'admin' badge for back-compat. Admin-only.
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

export interface AdminUserRow {
  user_id:         string;
  email:           string | null;
  full_name:       string | null;
  /** Effective admin role: explicit admin_role wins, legacy role='admin' falls back to 'admin'. */
  admin_role:      string;
  created_at:      string;
  email_confirmed: boolean;
}

export async function GET() {
  const r = await requirePermission("users.view_list");
  if (!r.ok) return permissionErrorResponse(r);

  const svc = makeSvc();

  // Pull every profile row with any admin signal, then resolve effective
  // admin_role in-memory.
  const { data: profiles, error: profErr } = await svc
    .from("profiles")
    .select("user_id, email, full_name, role, admin_role, created_at")
    .or("admin_role.not.is.null,role.eq.admin");
  if (profErr) return NextResponse.json({ error: profErr.message }, { status: 500 });

  const rows = profiles ?? [];
  const ids  = rows.map(p => p.user_id as string);

  const { data: authUsers } = await svc.auth.admin.listUsers({ perPage: 1000 });
  const emailConfirmed = new Map(
    (authUsers?.users ?? []).filter(u => ids.includes(u.id)).map(u => [u.id, !!u.email_confirmed_at]),
  );

  const users: AdminUserRow[] = rows.map(p => {
    const explicit = (p.admin_role as string | null) ?? null;
    const legacy   = (p.role as string | null) === "admin";
    const effective = explicit ?? (legacy ? "admin" : "viewer");
    return {
      user_id:         p.user_id as string,
      email:           (p.email as string | null) ?? null,
      full_name:       (p.full_name as string | null) ?? null,
      admin_role:      effective,
      created_at:      (p.created_at as string) ?? new Date(0).toISOString(),
      email_confirmed: emailConfirmed.get(p.user_id as string) ?? false,
    };
  });

  users.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return NextResponse.json({ users });
}
