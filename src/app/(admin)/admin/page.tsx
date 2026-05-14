import { createClient } from "@supabase/supabase-js";
import AdminPageHeader from "@/components/admin/ui/AdminPageHeader";
import AdminDataCard from "@/components/admin/ui/AdminDataCard";
import AdminEmptyState from "@/components/admin/ui/AdminEmptyState";
import { AdminAnalyticsPanel } from "@/components/admin/AdminAnalyticsPanel";
import AdminRecentActivity from "@/components/admin/AdminRecentActivity";
import AdminQuickActions from "@/components/admin/AdminQuickActions";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Command Center — iCareerOS Admin" };

function makeSvc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

const QUICK_LINKS = [
  { label: "Supabase",    href: "https://supabase.com/dashboard/project/kuneabeiwcxavvyyfjkx", emoji: "🗄" },
  { label: "Vercel",      href: "https://vercel.com/jabri-solutions/icareeros/settings/environment-variables", emoji: "▲" },
  { label: "Stripe",      href: "https://dashboard.stripe.com/acct_1TK0yp2K7LVuzb7t/dashboard", emoji: "💳" },
  { label: "BetterStack", href: "https://betterstack.com/dashboard", emoji: "📊" },
  { label: "Bluehost",    href: "https://my.bluehost.com/hosting/app", emoji: "🌐" },
  { label: "Cloudflare",  href: "https://dash.cloudflare.com", emoji: "☁️" },
];

interface AuditLogRow {
  id:            string;
  admin_email:   string;
  admin_role:    string;
  action:        string;
  target_table:  string | null;
  target_id:     string | null;
  created_at:    string;
}

export default async function AdminCommandCenter() {
  const svc = makeSvc();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Headline metrics for the 4 KPI cards (Sprint 4 W3-A)
  // + the detailed AdminAnalyticsPanel below.
  const [
    { data: profiles },
    { data: subscriptions },
    { data: allCycles },
    { data: allAnalyses },
    { data: recentAnalyses },
    { data: allRuns },
    { data: allSupportTickets },
    { data: recentActivity },
    { data: allOpportunities },
  ] = await Promise.all([
    svc.from("profiles").select("user_id, created_at").order("created_at", { ascending: false }),
    svc.from("user_subscriptions").select("user_id, plan, status"),
    svc.from("career_os_cycles").select("user_id, status"),
    svc.from("analysis_history").select("id"),
    svc.from("analysis_history").select("id").gte("created_at", thirtyDaysAgo),
    svc.from("agent_runs").select("jobs_found, jobs_matched"),
    svc.from("support_tickets").select("id, status"),
    svc.from("admin_audit_log")
      .select("id, admin_email, admin_role, action, target_table, target_id, created_at")
      .order("created_at", { ascending: false })
      .limit(20),
    svc.from("opportunities").select("id, source"),
  ]);

  // ── KPI calculations ────────────────────────────────────────────────────
  const totalUsers = (profiles ?? []).length;
  const newUsersLast7Days = (profiles ?? []).filter(p => new Date(p.created_at) >= new Date(sevenDaysAgo)).length;

  const activeSubs = (subscriptions ?? []).filter(s =>
    s.status === "active" || s.status === "trialing"
  ).length;

  const openTickets = (allSupportTickets ?? []).filter(t =>
    t.status === "open" || t.status === "in_progress"
  ).length;

  const totalOpportunities = (allOpportunities ?? []).length;
  const ingestSources = new Set((allOpportunities ?? []).map(o => o.source)).size;

  // ── Plan distribution (for detailed panel) ──────────────────────────────
  const subMap = new Map((subscriptions ?? []).map(s => [s.user_id, s.plan as string]));
  const planDist = { free: 0, starter: 0, standard: 0, pro: 0 };
  for (const p of profiles ?? []) {
    const plan = (subMap.get(p.user_id) ?? "free") as keyof typeof planDist;
    planDist[plan in planDist ? plan : "free"]++;
  }
  const cycleRows    = allCycles ?? [];
  const totalCycles  = cycleRows.length;
  const activeCycles = cycleRows.filter(c => c.status === "active").length;
  const runs         = allRuns ?? [];
  const totalAgentRuns = runs.length;
  const jobsFound    = runs.reduce((s, r) => s + (r.jobs_found ?? 0), 0);
  const jobsMatched  = runs.reduce((s, r) => s + (r.jobs_matched ?? 0), 0);

  const supportRows = allSupportTickets ?? [];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 space-y-10">
      <AdminPageHeader
        title="Command Center"
        description="Platform overview, recent admin activity, and quick actions."
      />

      {/* ── 4 KPI cards (Sprint 4 W3-A) ──────────────────────────────────── */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <AdminDataCard
          label="Total users"
          value={totalUsers}
          delta={newUsersLast7Days > 0 ? `+${newUsersLast7Days} last 7 days` : "no new signups"}
          href="/admin/users"
        />
        <AdminDataCard
          label="Active subscriptions"
          value={activeSubs}
          delta={`${planDist.starter + planDist.standard + planDist.pro} paid / ${totalUsers} total`}
          href="/admin/users"
        />
        <AdminDataCard
          label="Open support tickets"
          value={openTickets}
          delta={`${supportRows.length} total ever`}
          href="/admin/tickets"
        />
        <AdminDataCard
          label="Jobs in pipeline"
          value={totalOpportunities}
          delta={`${ingestSources} active source${ingestSources === 1 ? "" : "s"}`}
          href="/admin/opportunities"
        />
      </section>

      {/* ── Recent admin activity + Quick actions ─────────────────────────── */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <h2 className="mb-3 text-base font-semibold text-gray-800 dark:text-gray-200">
            Recent admin activity
            <span className="ml-2 text-xs font-normal text-gray-400">
              last {(recentActivity ?? []).length} entr{(recentActivity ?? []).length === 1 ? "y" : "ies"} · /admin/audit
            </span>
          </h2>
          {(recentActivity ?? []).length === 0 ? (
            <AdminEmptyState
              title="No admin actions logged yet"
              description="Every admin mutation will appear here once Wave 3 page handlers are wired up."
            />
          ) : (
            <AdminRecentActivity rows={recentActivity as AuditLogRow[]} />
          )}
        </div>

        <div>
          <h2 className="mb-3 text-base font-semibold text-gray-800 dark:text-gray-200">Quick actions</h2>
          <AdminQuickActions />

          {/* System health link */}
          <a
            href="/admin/system"
            className="mt-3 flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 dark:bg-[var(--surface-card,#162338)] dark:border-[var(--surface-border,#243653)] dark:text-gray-200 dark:hover:bg-white/5"
          >
            <span className="text-lg">🛡</span>
            <span>System health & deploy history</span>
            <span className="ml-auto text-gray-400 text-xs">→</span>
          </a>
        </div>
      </section>

      {/* ── Detailed Platform Analytics (existing panel — pre-Sprint-4) ───── */}
      <section className="border-t border-gray-100 dark:border-white/5 pt-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Detailed platform analytics</h2>
          <span className="text-xs text-gray-400">live data</span>
        </div>
        <AdminAnalyticsPanel
          totalUsers={totalUsers}
          newUsersLast7Days={newUsersLast7Days}
          planDist={planDist}
          totalAnalyses={(allAnalyses ?? []).length}
          analysesLast30Days={(recentAnalyses ?? []).length}
          totalAgentRuns={totalAgentRuns}
          jobsFound={jobsFound}
          jobsMatched={jobsMatched}
          totalTickets={supportRows.length}
          openTickets={openTickets}
          totalCycles={totalCycles}
          activeCycles={activeCycles}
        />
      </section>

      {/* ── Quick links to external tools ──────────────────────────────────── */}
      <section className="border-t border-gray-100 dark:border-white/5 pt-8">
        <h2 className="mb-4 text-lg font-semibold text-gray-800 dark:text-gray-200">External tools</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {QUICK_LINKS.map(({ label, href, emoji }) => (
            <a key={label} href={href} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 hover:shadow-md transition-all dark:bg-[var(--surface-card,#162338)] dark:border-[var(--surface-border,#243653)] dark:text-gray-200 dark:hover:bg-white/5">
              <span className="text-lg">{emoji}</span>
              <span>{label}</span>
              <span className="ml-auto text-gray-400 text-xs">↗</span>
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
