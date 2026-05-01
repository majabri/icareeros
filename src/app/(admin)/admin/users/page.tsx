import { createClient } from "@supabase/supabase-js";
import { AdminUserActions } from "@/components/admin/AdminUserActions";
import type { Metadata } from "next";
import type { UserRole, SubscriptionPlan } from "@/app/actions/adminActions";

export const metadata: Metadata = { title: "Users — iCareerOS Admin" };

function makeSvc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

function planBadgeClass(plan: string) {
  if (plan === "premium") return "bg-purple-100 text-purple-700";
  if (plan === "pro")     return "bg-blue-100 text-blue-700";
  return "bg-gray-100 text-gray-600";
}

function roleBadgeClass(role: string) {
  if (role === "admin")     return "bg-red-100 text-red-700";
  if (role === "moderator") return "bg-amber-100 text-amber-700";
  return "bg-gray-100 text-gray-500";
}

export default async function AdminUsersPage() {
  const svc = makeSvc();
  const [
    { data: profiles },
    { data: subscriptions },
    { data: cycles },
    { data: authUsers },
  ] = await Promise.all([
    svc.from("profiles").select("user_id, email, full_name, role, created_at").order("created_at", { ascending: false }).limit(200),
    svc.from("user_subscriptions").select("user_id, plan, status"),
    svc.from("career_os_cycles").select("user_id"),
    svc.auth.admin.listUsers({ perPage: 1000 }),
  ]);

  const subMap = new Map((subscriptions ?? []).map(s => [s.user_id, { plan: s.plan as string, status: s.status as string }]));
  const cycleCount: Record<string, number> = {};
  for (const c of cycles ?? []) cycleCount[c.user_id] = (cycleCount[c.user_id] ?? 0) + 1;
  const emailConfirmedMap = new Map((authUsers?.users ?? []).map(u => [u.id, !!u.email_confirmed_at]));

  const users = (profiles ?? []).map(p => ({
    user_id:        p.user_id,
    email:          p.email as string | null,
    full_name:      p.full_name as string | null,
    role:           (p.role ?? "user") as UserRole,
    created_at:     p.created_at as string,
    plan:           (subMap.get(p.user_id)?.plan ?? "free") as SubscriptionPlan,
    plan_status:    subMap.get(p.user_id)?.status ?? "active",
    cycle_count:    cycleCount[p.user_id] ?? 0,
    email_confirmed: emailConfirmedMap.get(p.user_id) ?? false,
  }));

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Users</h1>
        <p className="mt-1 text-sm text-gray-500">{users.length} total accounts</p>
      </div>
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-100 text-sm">
          <thead className="bg-gray-50">
            <tr>
              {["User", "Role", "Plan", "Cycles", "Joined", "Supabase", "Actions"].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.map(u => (
              <tr key={u.user_id} className="hover:bg-gray-50 transition-colors">
                {/* User */}
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900 truncate max-w-[180px]">{u.email ?? "—"}</p>
                  {u.full_name && <p className="text-xs text-gray-400 truncate max-w-[180px]">{u.full_name}</p>}
                </td>

                {/* Role badge */}
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${roleBadgeClass(u.role)}`}>
                    {u.role}
                  </span>
                </td>

                {/* Plan badge */}
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${planBadgeClass(u.plan)}`}>
                    {u.plan}
                  </span>
                  {u.plan_status !== "active" && (
                    <span className="ml-1 text-xs text-red-400">{u.plan_status}</span>
                  )}
                </td>

                {/* Cycles */}
                <td className="px-4 py-3 text-gray-600 tabular-nums">{u.cycle_count}</td>

                {/* Joined */}
                <td className="px-4 py-3 text-gray-400 text-xs tabular-nums whitespace-nowrap">
                  {new Date(u.created_at).toLocaleDateString()}
                </td>

                {/* Supabase link */}
                <td className="px-4 py-3">
                  <a
                    href={`https://supabase.com/dashboard/project/kuneabeiwcxavvyyfjkx/auth/users?search=${u.email ?? u.user_id}`}
                    target="_blank" rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                  >
                    View ↗
                  </a>
                </td>

                {/* Actions: plan + role selectors + confirm email */}
                <td className="px-4 py-3">
                  <AdminUserActions
                    userId={u.user_id}
                    currentPlan={u.plan}
                    currentRole={u.role}
                    email={u.email ?? u.user_id}
                    emailConfirmed={u.email_confirmed}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
