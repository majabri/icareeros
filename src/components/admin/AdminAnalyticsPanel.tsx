/**
 * AdminAnalyticsPanel — pure display component for platform KPI cards.
 * All data is fetched server-side and passed in as props.
 */

interface KpiCard {
  label: string;
  value: string | number;
  sub?: string;
  color?: "blue" | "green" | "purple" | "amber" | "gray";
}

interface AdminAnalyticsPanelProps {
  totalUsers: number;
  newUsersLast7Days: number;
  planDist: { free: number; starter: number; standard: number; pro: number };
  totalAnalyses: number;
  analysesLast30Days: number;
  totalAgentRuns: number;
  jobsFound: number;
  jobsMatched: number;
  totalTickets: number;
  openTickets: number;
  totalCycles: number;
  activeCycles: number;
}

function colorClasses(color: KpiCard["color"] = "gray") {
  const map = {
    blue:   "bg-blue-50 border-blue-100 text-blue-700",
    green:  "bg-green-50 border-green-100 text-green-700",
    purple: "bg-purple-50 border-purple-100 text-purple-700",
    amber:  "bg-amber-50 border-amber-100 text-amber-700",
    gray:   "bg-gray-50 border-gray-100 text-gray-700",
  };
  return map[color];
}

export function AdminAnalyticsPanel({
  totalUsers,
  newUsersLast7Days,
  planDist,
  totalAnalyses,
  analysesLast30Days,
  totalAgentRuns,
  jobsFound,
  jobsMatched,
  totalTickets,
  openTickets,
  totalCycles,
  activeCycles,
}: AdminAnalyticsPanelProps) {
  const cards: KpiCard[] = [
    // Users
    { label: "Total users",       value: totalUsers,           sub: `+${newUsersLast7Days} this week`,    color: "blue" },
    { label: "Free plan",         value: planDist.free,        sub: `${Math.round((planDist.free / Math.max(totalUsers,1)) * 100)}% of users`, color: "gray" },
    { label: "Pro plan",          value: planDist.pro,         sub: "$19/mo subscribers",                  color: "green" },
    { label: "Starter plan",      value: planDist.starter,     sub: "$9.99/mo subscribers",                color: "purple" },
    { label: "Standard plan",     value: planDist.standard,    sub: "$18.99/mo subscribers",               color: "indigo" },
    // Activity
    { label: "Career OS cycles",  value: totalCycles,          sub: `${activeCycles} active`,              color: "blue" },
    { label: "Resume analyses",   value: totalAnalyses,        sub: `${analysesLast30Days} last 30 days`,  color: "green" },
    { label: "Agent runs",        value: totalAgentRuns,       sub: `${jobsFound.toLocaleString()} jobs found`, color: "amber" },
    { label: "Jobs matched",      value: jobsMatched.toLocaleString(), sub: "across all agent runs",       color: "green" },
    // Support
    { label: "Support tickets",   value: totalTickets,         sub: `${openTickets} open`,                 color: openTickets > 0 ? "amber" : "gray" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {cards.map(card => (
        <div
          key={card.label}
          className={`rounded-xl border px-4 py-4 ${colorClasses(card.color)}`}
        >
          <p className="text-2xl font-bold tabular-nums">{card.value}</p>
          <p className="mt-0.5 text-xs font-medium opacity-80">{card.label}</p>
          {card.sub && (
            <p className="mt-1 text-xs opacity-60">{card.sub}</p>
          )}
        </div>
      ))}
    </div>
  );
}
