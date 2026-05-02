import { createClient } from "@supabase/supabase-js";
import { UsersAdminPanel, type AdminUserRow } from "@/components/admin/UsersAdminPanel";
import type { Metadata } from "next";
import type { UserRole, SubscriptionPlan } from "@/app/actions/adminActions";

export const metadata: Metadata = { title: "Users — iCareerOS Admin" };

function makeSvc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export default async function AdminUsersPage() {
  const svc = makeSvc();
  const [
    { data: profiles },
    { data: subscriptions },
    { data: cycles },
    { data: authUsers },
  ] = await Promise.all([
    svc
      .from("profiles")
      .select("user_id, email, full_name, role, created_at")
      .order("created_at", { ascending: false })
      .limit(200),
    svc.from("user_subscriptions").select("user_id, plan, status"),
    svc.from("career_os_cycles").select("user_id"),
    svc.auth.admin.listUsers({ perPage: 1000 }),
  ]);

  const subMap = new Map(
    (subscriptions ?? []).map((s) => [
      s.user_id,
      { plan: s.plan as string, status: s.status as string },
    ])
  );
  const cycleCount: Record<string, number> = {};
  for (const c of cycles ?? []) cycleCount[c.user_id] = (cycleCount[c.user_id] ?? 0) + 1;
  const emailConfirmedMap = new Map(
    (authUsers?.users ?? []).map((u) => [u.id, !!u.email_confirmed_at])
  );

  const users: AdminUserRow[] = (profiles ?? []).map((p) => ({
    user_id: p.user_id,
    email: p.email as string | null,
    full_name: p.full_name as string | null,
    role: (p.role ?? "user") as UserRole,
    created_at: p.created_at as string,
    plan: (subMap.get(p.user_id)?.plan ?? "free") as SubscriptionPlan,
    plan_status: subMap.get(p.user_id)?.status ?? "active",
    cycle_count: cycleCount[p.user_id] ?? 0,
    email_confirmed: emailConfirmedMap.get(p.user_id) ?? false,
  }));

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Users</h1>
        <p className="mt-1 text-sm text-gray-500">{users.length} total accounts</p>
      </div>
      <UsersAdminPanel users={users} />
    </div>
  );
}
