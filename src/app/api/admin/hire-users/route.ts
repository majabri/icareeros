/**
 * GET /api/admin/hire-users — list employers
 *
 * Returns every user whose `public.user_roles.role = 'employer'`, joined
 * with their employer_profiles (company_name etc.), profiles (full_name,
 * email), user_subscriptions (plan, status), and auth.users (created_at,
 * email_confirmed_at). The shape matches the existing AdminUserRow plus a
 * `company_name` field so the /admin/users "Hire Users" tab can render
 * the same columns as Jobs Users with a single extra column.
 *
 * Admin-only — gated by requirePermission("users.view_list"), same as
 * any other admin user-listing surface.
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

export interface HireUserRow {
  user_id:         string;
  email:           string | null;
  full_name:       string | null;
  company_name:    string | null;
  plan:            string;
  plan_status:     string;
  created_at:      string;
  email_confirmed: boolean;
}

export async function GET() {
  const r = await requirePermission("users.view_list");
  if (!r.ok) return permissionErrorResponse(r);

  const svc = makeSvc();

  // 1) Employer user_ids — single source of truth for the tab membership.
  const { data: empRoles, error: rolesErr } = await svc
    .from("user_roles")
    .select("user_id")
    .eq("role", "employer");
  if (rolesErr) return NextResponse.json({ error: rolesErr.message }, { status: 500 });

  const ids = (empRoles ?? []).map(r => r.user_id as string);
  if (ids.length === 0) return NextResponse.json({ users: [] });

  // 2) Companion rows for these employers.
  const [
    { data: profiles },
    { data: employers },
    { data: subs },
    { data: authUsers },
  ] = await Promise.all([
    svc.from("profiles")
       .select("user_id, email, full_name, created_at")
       .in("user_id", ids),
    svc.from("employer_profiles")
       .select("user_id, company_name")
       .in("user_id", ids),
    svc.from("user_subscriptions")
       .select("user_id, plan, status")
       .in("user_id", ids),
    svc.auth.admin.listUsers({ perPage: 1000 }),
  ]);

  const empMap   = new Map((employers ?? []).map(e => [e.user_id as string, e.company_name as string | null]));
  const subMap   = new Map((subs ?? []).map(s => [s.user_id as string, { plan: s.plan as string, status: s.status as string }]));
  const emailMap = new Map(
    (authUsers?.users ?? []).filter(u => ids.includes(u.id)).map(u => [u.id, !!u.email_confirmed_at]),
  );
  const profMap  = new Map((profiles ?? []).map(p => [p.user_id as string, p]));

  const users: HireUserRow[] = ids.map((uid) => {
    const p = profMap.get(uid);
    return {
      user_id:         uid,
      email:           (p?.email as string | null) ?? null,
      full_name:       (p?.full_name as string | null) ?? null,
      company_name:    empMap.get(uid) ?? null,
      plan:            subMap.get(uid)?.plan ?? "free",
      plan_status:     subMap.get(uid)?.status ?? "active",
      created_at:      (p?.created_at as string) ?? new Date(0).toISOString(),
      email_confirmed: emailMap.get(uid) ?? false,
    };
  });

  // Newest-first
  users.sort((a, b) => b.created_at.localeCompare(a.created_at));

  return NextResponse.json({ users });
}
