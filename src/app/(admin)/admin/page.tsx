import { createClient } from "@supabase/supabase-js";
import { AdminAnalyticsPanel } from "@/components/admin/AdminAnalyticsPanel";
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

export default async function AdminCommandCenter() {
  const svc = makeSvc();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const sevenDaysAgo  = new Date(Date.now() - 7  * 24 * 60 * 60 * 1000).toISOString();

  const [
    { data: profiles },
    { data: subscriptions },
    { data: allCycles },
    { data: allAnalyses },
    { data: recentAnalyses },
    { data: allRuns },
    { data: allSupportTickets },
  ] = await Promise.all([
    svc.from("profiles").select("user_id, created_at").order("created_at", { ascending: false }),
    svc.from("user_subscriptions").select("user_id, plan, status"),
    svc.from("career_os_cycles").select("user_id, status"),
    svc.from("analysis_history").select("id"),
    svc.from("analysis_history").select("id").gte("created_at", thirtyDaysAgo),
    svc.from("agent_runs").select("jobs_found, jobs_matched"),
    svc.from("support_tickets").select("id, status"),
  ]);

  const totalUsers = (profiles ?? []).length;
  const newUsersLast7Days = (profiles ?? []).filter(p => new Date(p.created_at) >= new Date(sevenDaysAgo)).length;
  const subMap = new Map((subscriptions ?? []).map(s => [s.user_id, s.plan as string]));
  const planDist = { free: 0, pro: 0, premium: 0 };
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
  const supportRows  = allSupportTickets ?? [];
  const openTickets  = supportRows.filter(t => t.status === "open" || t.status === "in_progress").length;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 space-y-10">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Command Center</h1>
        <p className="mt-1 text-sm text-gray-500">Platform overview and quick access.</p>
      </div>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800">Platform Analytics</h2>
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

      <section className="border-t border-gray-100 pt-8">
        <h2 className="mb-4 text-lg font-semibold text-gray-800">Quick Links</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {QUICK_LINKS.map(({ label, href, emoji }) => (
            <a key={label} href={href} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 hover:shadow-md transition-all">
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
