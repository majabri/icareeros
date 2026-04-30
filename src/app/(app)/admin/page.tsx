/**
 * /admin — feature-flag control panel + analytics + user management + support tickets
 *
 * Server Component: fetches all data from Supabase directly.
 * Only accessible to majabri714@gmail.com — anyone else is redirected to /dashboard.
 */

import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import type { CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { FeatureFlagToggle } from "@/components/admin/FeatureFlagToggle";
import { AdminUserActions } from "@/components/admin/AdminUserActions";
import { AdminAnalyticsPanel } from "@/components/admin/AdminAnalyticsPanel";
import type { Metadata } from "next";
import type { TicketPriority, TicketStatus } from "@/services/supportService";
import { statusBadgeClass, statusLabel, priorityBadgeClass } from "@/services/supportService";

export const metadata: Metadata = {
  title: "Admin — iCareerOS",
};

const ADMIN_EMAILS = ["majabri714@gmail.com", "azadmin@icareeros.com"];

async function makeSupabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        },
      },
    }
  );
}

/** Service-role client — bypasses RLS for admin reads */
function makeServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

interface AdminTicket {
  id: string;
  subject: string;
  body: string;
  priority: TicketPriority;
  status: TicketStatus;
  created_at: string;
  user_id: string;
}

interface AdminUser {
  user_id: string;
  email: string | null;
  full_name: string | null;
  created_at: string;
  plan: string;
  plan_status: string;
  cycle_count: number;
}

function planBadgeClass(plan: string): string {
  switch (plan) {
    case "premium": return "bg-purple-100 text-purple-700";
    case "pro":     return "bg-blue-100 text-blue-700";
    default:        return "bg-gray-100 text-gray-600";
  }
}

export default async function AdminPage() {
  const supabase = await makeSupabaseServer();

  // Auth guard
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login?redirect=/admin");
  if (!ADMIN_EMAILS.includes(user.email ?? "")) redirect("/dashboard");

  const svc = makeServiceClient();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Parallel fetches
  const [
    { data: flags, error: flagsError },
    { data: tickets },
    { data: profiles },
    { data: subscriptions },
    { data: allCycles },
    { data: allAnalyses },
    { data: recentAnalyses },
    { data: allRuns },
    { data: allSupportTickets },
  ] = await Promise.all([
    supabase.from("feature_flags").select("key, enabled, updated_at").order("key"),
    supabase
      .from("support_tickets")
      .select("id, subject, body, priority, status, created_at, user_id")
      .in("status", ["open", "in_progress"])
      .order("created_at", { ascending: false })
      .limit(50),
    svc.from("profiles").select("user_id, email, full_name, created_at").order("created_at", { ascending: false }).limit(100),
    svc.from("user_subscriptions").select("user_id, plan, status"),
    svc.from("career_os_cycles").select("user_id, status"),
    svc.from("analysis_history").select("id"),
    svc.from("analysis_history").select("id").gte("created_at", thirtyDaysAgo),
    svc.from("agent_runs").select("jobs_found, jobs_matched"),
    svc.from("support_tickets").select("id, status"),
  ]);

  if (flagsError) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <p className="text-red-600">Failed to load admin panel: {flagsError.message}</p>
      </div>
    );
  }

  // ── Analytics aggregations ──────────────────────────────────────────────────
  const totalUsers = (profiles ?? []).length;
  const newUsersLast7Days = (profiles ?? []).filter(
    p => new Date(p.created_at) >= new Date(sevenDaysAgo)
  ).length;

  const subMap = new Map(
    (subscriptions ?? []).map(s => [s.user_id, { plan: s.plan as string, plan_status: s.status as string }])
  );
  const planDist = { free: 0, pro: 0, premium: 0 };
  for (const p of profiles ?? []) {
    const plan = (subMap.get(p.user_id)?.plan ?? "free") as keyof typeof planDist;
    if (plan in planDist) planDist[plan]++;
    else planDist.free++;
  }

  const cycleRows = allCycles ?? [];
  const cycleCountByUser: Record<string, number> = {};
  for (const row of cycleRows) {
    cycleCountByUser[row.user_id] = (cycleCountByUser[row.user_id] ?? 0) + 1;
  }
  const totalCycles = cycleRows.length;
  const activeCycles = cycleRows.filter(c => c.status === "active").length;

  const totalAnalysesCount = (allAnalyses ?? []).length;
  const analysesLast30Days = (recentAnalyses ?? []).length;

  const runs = allRuns ?? [];
  const totalAgentRuns = runs.length;
  const jobsFound = runs.reduce((sum, r) => sum + (r.jobs_found ?? 0), 0);
  const jobsMatched = runs.reduce((sum, r) => sum + (r.jobs_matched ?? 0), 0);

  const supportRows = allSupportTickets ?? [];
  const totalTicketsCount = supportRows.length;
  const openTicketsCount = supportRows.filter(t => t.status === "open" || t.status === "in_progress").length;

  // ── User table data ─────────────────────────────────────────────────────────
  const openTickets = (tickets ?? []) as AdminTicket[];
  const adminUsers: AdminUser[] = (profiles ?? []).map(p => {
    const sub = subMap.get(p.user_id);
    return {
      user_id: p.user_id,
      email: p.email,
      full_name: p.full_name,
      created_at: p.created_at,
      plan: sub?.plan ?? "free",
      plan_status: sub?.plan_status ?? "active",
      cycle_count: cycleCountByUser[p.user_id] ?? 0,
    };
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Admin Panel</h1>
        <p className="mt-1 text-sm text-gray-500">
          Platform analytics, user management, feature flags, and support tickets.
        </p>
      </div>

      {/* Analytics section */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800">Platform Analytics</h2>
          <span className="text-xs text-gray-400">live data</span>
        </div>
        <AdminAnalyticsPanel
          totalUsers={totalUsers}
          newUsersLast7Days={newUsersLast7Days}
          planDist={planDist}
          totalAnalyses={totalAnalysesCount}
          analysesLast30Days={analysesLast30Days}
          totalAgentRuns={totalAgentRuns}
          jobsFound={jobsFound}
          jobsMatched={jobsMatched}
          totalTickets={totalTicketsCount}
          openTickets={openTicketsCount}
          totalCycles={totalCycles}
          activeCycles={activeCycles}
        />
      </section>

      {/* Feature Flags section */}
      <section className="mt-10 border-t border-gray-100 pt-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800">Feature Flags</h2>
          <span className="text-xs text-gray-400">{flags?.length ?? 0} flags</span>
        </div>
        <FeatureFlagToggle initial={flags ?? []} />
      </section>

      {/* Users section */}
      <section className="mt-10 border-t border-gray-100 pt-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800">Users</h2>
          <span className="text-xs text-gray-400">{adminUsers.length} users</span>
        </div>

        {adminUsers.length === 0 ? (
          <p className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
            No users yet.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-gray-100 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Plan</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cycles</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Joined</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {adminUsers.map(u => (
                  <tr key={u.user_id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900 truncate max-w-[180px]">{u.email ?? "—"}</p>
                      {u.full_name && <p className="text-xs text-gray-400 truncate max-w-[180px]">{u.full_name}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${planBadgeClass(u.plan)}`}>
                        {u.plan}
                      </span>
                      {u.plan_status !== "active" && (
                        <span className="ml-1 text-xs text-red-400">{u.plan_status}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600 tabular-nums">{u.cycle_count}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs tabular-nums whitespace-nowrap">
                      {new Date(u.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <a
                          href={`https://supabase.com/dashboard/project/kuneabeiwcxavvyyfjkx/auth/users?search=${u.email ?? u.user_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                        >
                          View ↗
                        </a>
                        <AdminUserActions userId={u.user_id} currentPlan={u.plan} email={u.email ?? u.user_id} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Support Tickets section */}
      <section className="mt-10 border-t border-gray-100 pt-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800">Open Support Tickets</h2>
          <span className="text-xs text-gray-400">{openTickets.length} tickets</span>
        </div>
        {openTickets.length === 0 ? (
          <p className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
            🎉 No open tickets — inbox is clear.
          </p>
        ) : (
          <ul className="space-y-3">
            {openTickets.map(ticket => (
              <li key={ticket.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass(ticket.status)}`}>
                    {statusLabel(ticket.status)}
                  </span>
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${priorityBadgeClass(ticket.priority)}`}>
                    {ticket.priority}
                  </span>
                  <span className="ml-auto text-xs text-gray-400">
                    {new Date(ticket.created_at).toLocaleDateString()}
                  </span>
                </div>
                <p className="text-sm font-medium text-gray-900">{ticket.subject}</p>
                <p className="mt-1 text-xs text-gray-500 line-clamp-3">{ticket.body}</p>
                <p className="mt-2 font-mono text-xs text-gray-400">uid: {ticket.user_id}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Quick links */}
      <section className="mt-10 border-t border-gray-100 pt-8">
        <h2 className="mb-4 text-lg font-semibold text-gray-800">Quick Links</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {[
            { label: "Supabase", href: "https://supabase.com/dashboard/project/kuneabeiwcxavvyyfjkx" },
            { label: "Vercel",   href: "https://vercel.com/jabri-solutions/icareeros/settings/environment-variables" },
            { label: "Stripe",   href: "https://dashboard.stripe.com/acct_1TK0yp2K7LVuzb7t/dashboard" },
          ].map(({ label, href }) => (
            <a key={label} href={href} target="_blank" rel="noopener noreferrer"
              className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-center text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 hover:text-gray-900 transition-colors">
              {label} ↗
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
