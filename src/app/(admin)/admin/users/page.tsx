import { createClient } from "@supabase/supabase-js";
import { AdminUsersTabs } from "@/components/admin/AdminUsersTabs";
import { type AdminUserRow } from "@/components/admin/UsersAdminPanel";
import { type HireUserRow }  from "@/components/admin/HireUsersAdminPanel";
import { type AdminUserRow as AdminsUserRow } from "@/components/admin/AdminsAdminPanel";
import AdminPageHeader  from "@/components/admin/ui/AdminPageHeader";
import AdminUserFilters from "@/components/admin/AdminUserFilters";
import type { Metadata } from "next";
import type { UserRole, SubscriptionPlan } from "@/app/actions/adminActions";

export const metadata: Metadata = { title: "Users — iCareerOS Admin" };

function makeSvc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

interface SearchParams {
  q?:      string;
  plan?:   string;
  status?: string;
  limit?:  string;
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const q       = (params.q ?? "").trim().toLowerCase();
  const planF   = params.plan && params.plan !== "all" ? params.plan : null;
  const statusF = params.status && params.status !== "all" ? params.status : null;
  const limit   = Math.min(Math.max(parseInt(params.limit ?? "200", 10) || 200, 25), 1000);

  const svc = makeSvc();

  // Pull the source tables once, partition in memory.
  const [
    { data: profiles, count: totalProfiles },
    { data: subscriptions },
    { data: cycles },
    { data: authUsers },
    { data: userRoles },
    { data: employers },
  ] = await Promise.all([
    svc.from("profiles")
       .select("user_id, email, full_name, role, admin_role, created_at", { count: "exact" })
       .order("created_at", { ascending: false })
       .limit(limit),
    svc.from("user_subscriptions").select("user_id, plan, status"),
    svc.from("career_os_cycles").select("user_id"),
    svc.auth.admin.listUsers({ perPage: 1000 }),
    svc.from("user_roles").select("user_id, role"),
    svc.from("employer_profiles").select("user_id, company_name"),
  ]);

  const subMap = new Map(
    (subscriptions ?? []).map(s => [s.user_id, { plan: s.plan as string, status: s.status as string }]),
  );
  const cycleCount: Record<string, number> = {};
  for (const c of cycles ?? []) cycleCount[c.user_id] = (cycleCount[c.user_id] ?? 0) + 1;
  const emailConfirmedMap = new Map(
    (authUsers?.users ?? []).map(u => [u.id, !!u.email_confirmed_at]),
  );
  const userRoleMap = new Map((userRoles ?? []).map(r => [r.user_id as string, r.role as string]));
  const companyMap  = new Map((employers ?? []).map(e => [e.user_id as string, e.company_name as string | null]));

  // Admin-privileged profile predicate: admin_role IS NOT NULL OR legacy role='admin'.
  function isAdminProfile(p: { role?: unknown; admin_role?: unknown }): boolean {
    return Boolean(p.admin_role) || p.role === "admin";
  }

  // ── Jobs Users: non-employer, non-admin job seekers.
  const jobsUsers: AdminUserRow[] = (profiles ?? [])
    .filter(p => (userRoleMap.get(p.user_id) ?? "job_seeker") !== "employer")
    .filter(p => !isAdminProfile(p))
    .map(p => ({
      user_id:         p.user_id,
      email:           p.email as string | null,
      full_name:       p.full_name as string | null,
      role:            (p.role ?? "user") as UserRole,
      created_at:      p.created_at as string,
      plan:            (subMap.get(p.user_id)?.plan ?? "free") as SubscriptionPlan,
      plan_status:     subMap.get(p.user_id)?.status ?? "active",
      cycle_count:     cycleCount[p.user_id] ?? 0,
      email_confirmed: emailConfirmedMap.get(p.user_id) ?? false,
    }));

  // ── Hire Users: employer role and not also an admin.
  const hireUsers: HireUserRow[] = (profiles ?? [])
    .filter(p => userRoleMap.get(p.user_id) === "employer")
    .filter(p => !isAdminProfile(p))
    .map(p => ({
      user_id:         p.user_id,
      email:           p.email as string | null,
      full_name:       p.full_name as string | null,
      company_name:    companyMap.get(p.user_id) ?? null,
      plan:            subMap.get(p.user_id)?.plan ?? "free",
      plan_status:     subMap.get(p.user_id)?.status ?? "active",
      created_at:      p.created_at as string,
      email_confirmed: emailConfirmedMap.get(p.user_id) ?? false,
    }));

  // ── Admins: any profile with admin signal.
  const adminsUsers: AdminsUserRow[] = (profiles ?? [])
    .filter(isAdminProfile)
    .map(p => ({
      user_id:         p.user_id,
      email:           p.email as string | null,
      full_name:       p.full_name as string | null,
      admin_role:      (p.admin_role as string | null) ?? (p.role === "admin" ? "admin" : "viewer"),
      created_at:      p.created_at as string,
      email_confirmed: emailConfirmedMap.get(p.user_id) ?? false,
    }));

  // ── Filters (q/plan/status) apply to all three tabs equally ───────────
  function applyFilters<T extends { email: string | null; full_name: string | null; plan: string; plan_status: string }>(
    rows: T[],
  ): T[] {
    let out = rows;
    if (q) {
      out = out.filter(u =>
        (u.email ?? "").toLowerCase().includes(q) ||
        (u.full_name ?? "").toLowerCase().includes(q),
      );
    }
    if (planF)   out = out.filter(u => u.plan === planF);
    if (statusF) out = out.filter(u => u.plan_status === statusF);
    return out;
  }

  const jobsFiltered   = applyFilters(jobsUsers);
  const hireFiltered   = applyFilters(hireUsers);
  // Admins use a simpler filter (no plan/status fields) — search-only.
  const adminsFiltered = adminsUsers.filter(u => {
    if (!q) return true;
    return (u.email ?? "").toLowerCase().includes(q) ||
           (u.full_name ?? "").toLowerCase().includes(q);
  });

  const totalUnfiltered = totalProfiles ?? (jobsUsers.length + hireUsers.length);
  const isFiltered = Boolean(q || planF || statusF);
  const visibleTotal = jobsFiltered.length + hireFiltered.length + adminsFiltered.length;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <AdminPageHeader
        title="Users"
        description={
          isFiltered
            ? `Showing ${visibleTotal} of ${totalUnfiltered} users (filtered).`
            : `${visibleTotal}${totalUnfiltered > visibleTotal ? ` of ${totalUnfiltered}` : ""} total accounts. Use the tabs below to switch between job seekers and employers.`
        }
      />

      <AdminUserFilters
        initialQ={q}
        initialPlan={params.plan ?? "all"}
        initialStatus={params.status ?? "all"}
        initialLimit={String(limit)}
      />

      <div className="mt-6">
        <AdminUsersTabs jobsUsers={jobsFiltered} hireUsers={hireFiltered} adminsUsers={adminsFiltered} />
      </div>
    </div>
  );
}
