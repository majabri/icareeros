import { createClient } from "@supabase/supabase-js";
import { UsersAdminPanel, type AdminUserRow } from "@/components/admin/UsersAdminPanel";
import AdminPageHeader from "@/components/admin/ui/AdminPageHeader";
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
  q?:      string;            // free-text search on email + full_name
  plan?:   string;            // "free" | "starter" | "standard" | "pro" | "all"
  status?: string;            // "active" | "trialing" | "canceled" | "past_due" | "all"
  limit?:  string;            // "50" | "100" | "200" | "500"
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

  // Fetch the underlying tables. We fetch ALL profiles (up to the user-set
  // limit) and filter in memory — total user count is in the hundreds, so
  // a Postgres-side FTS isn't worth the complexity yet.
  const [
    { data: profiles, count: totalProfiles },
    { data: subscriptions },
    { data: cycles },
    { data: authUsers },
  ] = await Promise.all([
    svc
      .from("profiles")
      .select("user_id, email, full_name, role, created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .limit(limit),
    svc.from("user_subscriptions").select("user_id, plan, status"),
    svc.from("career_os_cycles").select("user_id"),
    svc.auth.admin.listUsers({ perPage: 1000 }),
  ]);

  const subMap = new Map(
    (subscriptions ?? []).map(s => [s.user_id, { plan: s.plan as string, status: s.status as string }])
  );
  const cycleCount: Record<string, number> = {};
  for (const c of cycles ?? []) cycleCount[c.user_id] = (cycleCount[c.user_id] ?? 0) + 1;
  const emailConfirmedMap = new Map(
    (authUsers?.users ?? []).map(u => [u.id, !!u.email_confirmed_at])
  );

  let users: AdminUserRow[] = (profiles ?? []).map(p => ({
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

  // ── Apply search + filters in memory ─────────────────────────────────
  if (q) {
    users = users.filter(u =>
      (u.email ?? "").toLowerCase().includes(q) ||
      (u.full_name ?? "").toLowerCase().includes(q),
    );
  }
  if (planF) {
    users = users.filter(u => u.plan === planF);
  }
  if (statusF) {
    users = users.filter(u => u.plan_status === statusF);
  }

  const totalUnfiltered = totalProfiles ?? users.length;
  const isFiltered = Boolean(q || planF || statusF);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <AdminPageHeader
        title="Users"
        description={
          isFiltered
            ? `Showing ${users.length} of ${totalUnfiltered} users (filtered).`
            : `${users.length}${totalUnfiltered > users.length ? ` of ${totalUnfiltered}` : ""} total accounts. Use search and filters to drill in.`
        }
      />

      <AdminUserFilters
        initialQ={q}
        initialPlan={params.plan ?? "all"}
        initialStatus={params.status ?? "all"}
        initialLimit={String(limit)}
      />

      <div className="mt-6">
        <UsersAdminPanel users={users} />
      </div>
    </div>
  );
}
