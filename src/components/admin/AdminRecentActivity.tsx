/**
 * Sprint 4 W3-A — Dashboard widget: last N admin_audit_log entries.
 *
 * Pure-display server component. Receives pre-fetched rows from the page
 * (single Supabase round-trip with the other dashboard queries).
 */

export interface AdminAuditRow {
  id:            string;
  admin_email:   string;
  admin_role:    string;
  action:        string;
  target_table:  string | null;
  target_id:     string | null;
  created_at:    string;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

/** Color hint per action namespace (matches the role badge palette). */
function actionStyle(action: string): { color: string; icon: string } {
  if (action.startsWith("users.delete")     || action.includes("delete")) return { color: "text-rose-700 dark:text-rose-300",   icon: "🗑" };
  if (action.startsWith("users."))                                       return { color: "text-blue-700 dark:text-blue-300",   icon: "👤" };
  if (action.startsWith("flags."))                                       return { color: "text-amber-700 dark:text-amber-300", icon: "🚩" };
  if (action.startsWith("support."))                                     return { color: "text-sky-700 dark:text-sky-300",     icon: "🎫" };
  if (action.startsWith("roles."))                                       return { color: "text-purple-700 dark:text-purple-300", icon: "🔑" };
  if (action.startsWith("opportunities."))                               return { color: "text-emerald-700 dark:text-emerald-300", icon: "💼" };
  return { color: "text-gray-700 dark:text-gray-300", icon: "•" };
}

export default function AdminRecentActivity({ rows }: { rows: AdminAuditRow[] }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden dark:bg-[var(--surface-card,#162338)] dark:border-[var(--surface-border,#243653)]">
      <ul className="divide-y divide-gray-100 dark:divide-white/5">
        {rows.map(r => {
          const s = actionStyle(r.action);
          return (
            <li key={r.id} className="px-4 py-3 flex items-start gap-3 hover:bg-gray-50/50 dark:hover:bg-white/5">
              <span className="text-base leading-none flex-shrink-0 mt-0.5" aria-hidden>{s.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <code className={`font-mono text-xs font-semibold ${s.color}`}>{r.action}</code>
                  {r.target_table && (
                    <span className="text-[11px] text-gray-500 dark:text-gray-400">
                      on <code className="text-gray-600 dark:text-gray-300">{r.target_table}</code>
                      {r.target_id && <span> #{r.target_id.slice(0, 8)}</span>}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                  <span className="truncate">{r.admin_email}</span>
                  <span className="text-gray-300 dark:text-gray-600">·</span>
                  <span className="font-mono uppercase text-[10px] tracking-wider">{r.admin_role}</span>
                </div>
              </div>
              <time className="text-[11px] text-gray-400 dark:text-gray-500 whitespace-nowrap mt-0.5" dateTime={r.created_at} title={r.created_at}>
                {timeAgo(r.created_at)}
              </time>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
