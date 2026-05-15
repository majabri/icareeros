import { createClient } from "@supabase/supabase-js";
import AdminPageHeader from "@/components/admin/ui/AdminPageHeader";
import AdminTable from "@/components/admin/ui/AdminTable";
import AdminEmptyState from "@/components/admin/ui/AdminEmptyState";
import AdminAuditTabs from "@/components/admin/AdminAuditTabs";
import AdminAuditFilters from "@/components/admin/AdminAuditFilters";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Audit Log — iCareerOS Admin" };

function makeSvc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

interface SearchParams {
  tab?:      string;   // 'admin' | 'infra'
  q?:        string;   // free text on action / event_type / admin_email / source
  severity?: string;   // 'all' | 'info' | 'warning' | 'error' | 'critical'
  since?:    string;   // '1h' | '24h' | '7d' | '30d' | 'all'
  limit?:    string;
}

interface AdminAuditRow {
  id:            string;
  admin_email:   string;
  admin_role:    string;
  action:        string;
  target_table:  string | null;
  target_id:     string | null;
  before_value:  unknown;
  after_value:   unknown;
  ip_address:    string | null;
  created_at:    string;
}

interface InfraEventRow {
  id:           string;
  source:       string;
  event_type:   string;
  severity:     string;
  payload:      unknown;
  resolved_at:  string | null;
  created_at:   string;
}

function sinceToISO(since: string): string | null {
  const now = Date.now();
  switch (since) {
    case "1h":   return new Date(now - 60 * 60 * 1000).toISOString();
    case "24h":  return new Date(now - 24 * 60 * 60 * 1000).toISOString();
    case "7d":   return new Date(now - 7  * 24 * 60 * 60 * 1000).toISOString();
    case "30d":  return new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
    case "all":
    default:     return null;
  }
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000)     return "just now";
  if (ms < 3_600_000)  return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

const SEVERITY_BADGE: Record<string, string> = {
  info:     "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  warning:  "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  error:    "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
  critical: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
};

function ActionBadge({ action }: { action: string }) {
  // Color by namespace (mirrors AdminRecentActivity)
  const cls = action.startsWith("users.delete") || action.includes("delete")
    ? "text-rose-700 dark:text-rose-300"
    : action.startsWith("users.")          ? "text-blue-700 dark:text-blue-300"
    : action.startsWith("flags.")          ? "text-amber-700 dark:text-amber-300"
    : action.startsWith("support.")        ? "text-sky-700 dark:text-sky-300"
    : action.startsWith("roles.")          ? "text-purple-700 dark:text-purple-300"
    : action.startsWith("opportunities.")  ? "text-emerald-700 dark:text-emerald-300"
    : "text-gray-700 dark:text-gray-300";
  return <code className={`font-mono text-xs font-semibold ${cls}`}>{action}</code>;
}

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const tab    = params.tab === "infra" ? "infra" : "admin";
  const q      = (params.q ?? "").trim().toLowerCase();
  const sevF   = params.severity && params.severity !== "all" ? params.severity : null;
  const since  = params.since ?? "7d";
  const sinceISO = sinceToISO(since);
  const limit  = Math.min(Math.max(parseInt(params.limit ?? "100", 10) || 100, 25), 500);

  const svc = makeSvc();

  let adminRows: AdminAuditRow[] = [];
  let infraRows: InfraEventRow[] = [];
  let adminCount = 0;
  let infraCount = 0;

  // Always fetch both tab counts so the tab headers show live numbers,
  // but only load the active tab's rows for performance.
  if (tab === "admin") {
    let q1 = svc.from("admin_audit_log")
      .select("id, admin_email, admin_role, action, target_table, target_id, before_value, after_value, ip_address, created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .limit(limit);
    if (sinceISO) q1 = q1.gte("created_at", sinceISO);
    const { data, count } = await q1;
    adminRows  = (data ?? []) as AdminAuditRow[];
    adminCount = count ?? adminRows.length;
    if (q) {
      adminRows = adminRows.filter(r =>
        (r.action ?? "").toLowerCase().includes(q) ||
        (r.admin_email ?? "").toLowerCase().includes(q) ||
        (r.target_table ?? "").toLowerCase().includes(q) ||
        (r.target_id ?? "").toLowerCase().includes(q),
      );
    }
  } else {
    let q2 = svc.from("infrastructure_events")
      .select("id, source, event_type, severity, payload, resolved_at, created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .limit(limit);
    if (sinceISO) q2 = q2.gte("created_at", sinceISO);
    if (sevF)     q2 = q2.eq("severity", sevF);
    const { data, count } = await q2;
    infraRows  = (data ?? []) as InfraEventRow[];
    infraCount = count ?? infraRows.length;
    if (q) {
      infraRows = infraRows.filter(r =>
        (r.event_type ?? "").toLowerCase().includes(q) ||
        (r.source ?? "").toLowerCase().includes(q),
      );
    }
  }

  // Get the inactive tab's count for the tab header
  const otherTab = tab === "admin" ? "infra" : "admin";
  const otherTable = otherTab === "admin" ? "admin_audit_log" : "infrastructure_events";
  const { count: otherCount } = await svc
    .from(otherTable)
    .select("id", { count: "exact", head: true })
    .gte("created_at", sinceISO ?? "1970-01-01T00:00:00Z");

  // CSV export URL (preserves filters)
  const csvUrl = new URLSearchParams({
    tab, q: params.q ?? "", severity: params.severity ?? "all", since,
  }).toString();

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 space-y-6">
      <AdminPageHeader
        title="Audit Log"
        description={
          <>
            Every admin mutation + every infrastructure event, with filters. Time range: <strong className="text-gray-700 dark:text-gray-200">{since === "all" ? "all time" : `last ${since}`}</strong>.
          </>
        }
        actions={
          <a
            href={`/api/admin/audit-export?${csvUrl}`}
            className="inline-flex items-center rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-white/5"
            download
          >
            ⬇ Export CSV
          </a>
        }
      />

      <AdminAuditTabs
        active={tab}
        adminCount={tab === "admin" ? adminCount : otherCount ?? 0}
        infraCount={tab === "infra" ? infraCount : otherCount ?? 0}
      />

      <AdminAuditFilters
        tab={tab}
        initialQ={q}
        initialSeverity={params.severity ?? "all"}
        initialSince={since}
        initialLimit={String(limit)}
      />

      {/* ── Tab 1: Admin Actions ─────────────────────────────────────────── */}
      {tab === "admin" && (
        adminRows.length === 0 ? (
          <AdminEmptyState
            title="No admin actions in this window"
            description="Try widening the time range or clearing the search. Every admin mutation across users / flags / support / opportunities / roles will appear here."
          />
        ) : (
          <AdminTable
            rows={adminRows}
            rowKey={r => r.id}
            columns={[
              { key: "when", label: "When", className: "whitespace-nowrap", render: r => (
                <span className="text-xs" title={r.created_at}>{timeAgo(r.created_at)}</span>
              )},
              { key: "action", label: "Action", render: r => <ActionBadge action={r.action} /> },
              { key: "admin",  label: "Admin", render: r => (
                <div className="text-xs">
                  <div className="font-medium text-gray-900 dark:text-gray-100 truncate max-w-[200px]">{r.admin_email}</div>
                  <code className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">{r.admin_role}</code>
                </div>
              )},
              { key: "target", label: "Target", render: r => r.target_table ? (
                <div className="text-xs">
                  <code className="text-gray-700 dark:text-gray-300">{r.target_table}</code>
                  {r.target_id && (
                    <Link
                      href={r.target_table === "support_tickets" ? `/admin/tickets/${r.target_id}` : `/admin/users?q=${r.target_id}`}
                      className="ml-1 text-[11px] text-brand-600 hover:underline dark:text-brand-300"
                    >
                      #{r.target_id.slice(0, 8)}
                    </Link>
                  )}
                </div>
              ) : <span className="text-gray-400">—</span> },
              { key: "diff", label: "Before / After", render: r => (
                <details className="text-[11px]">
                  <summary className="cursor-pointer text-gray-500 dark:text-gray-400 hover:text-gray-700 select-none">peek</summary>
                  <pre className="mt-1 max-w-md whitespace-pre-wrap font-mono text-[10px] bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded p-2 text-gray-800 dark:text-gray-200">{JSON.stringify({ before: r.before_value, after: r.after_value }, null, 2)}</pre>
                </details>
              )},
              { key: "ip", label: "IP", className: "text-[10px] font-mono text-gray-400", render: r => r.ip_address ?? "—" },
            ]}
          />
        )
      )}

      {/* ── Tab 2: Infrastructure Events ─────────────────────────────────── */}
      {tab === "infra" && (
        infraRows.length === 0 ? (
          <AdminEmptyState
            title="No infrastructure events in this window"
            description="Widen the time range. health-cron / vercel webhooks / bug-inbox-cron / sentry all land rows here."
          />
        ) : (
          <AdminTable
            rows={infraRows}
            rowKey={r => r.id}
            columns={[
              { key: "when", label: "When", className: "whitespace-nowrap", render: r => (
                <span className="text-xs" title={r.created_at}>{timeAgo(r.created_at)}</span>
              )},
              { key: "severity", label: "Sev", render: r => (
                <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${SEVERITY_BADGE[r.severity] ?? SEVERITY_BADGE.info}`}>
                  {r.severity}
                </span>
              )},
              { key: "source",     label: "Source",     render: r => (
                <code className="text-xs font-mono bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">{r.source}</code>
              )},
              { key: "event_type", label: "Event",     render: r => <code className="text-xs font-mono">{r.event_type}</code> },
              { key: "payload",    label: "Payload",   render: r => (
                <details className="text-[11px]">
                  <summary className="cursor-pointer text-gray-500 dark:text-gray-400 hover:text-gray-700 select-none">peek</summary>
                  <pre className="mt-1 max-w-md whitespace-pre-wrap font-mono text-[10px] bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded p-2 text-gray-800 dark:text-gray-200">{JSON.stringify(r.payload, null, 2).slice(0, 2000)}</pre>
                </details>
              )},
              { key: "resolved", label: "Resolved", render: r => r.resolved_at ? (
                <span className="text-[11px] text-emerald-700 dark:text-emerald-300" title={r.resolved_at}>✓ {timeAgo(r.resolved_at)}</span>
              ) : <span className="text-[11px] text-gray-400">—</span> },
            ]}
          />
        )
      )}
    </div>
  );
}
