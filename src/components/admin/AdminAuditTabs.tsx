"use client";

/**
 * Sprint 4 W3-F — Tab switcher for /admin/audit.
 *
 * Two tabs:
 *  • Admin Actions   → reads admin_audit_log   (everything logAdminAction wrote)
 *  • Infrastructure  → reads infrastructure_events (cron + webhook + sentry signals)
 *
 * Switching tabs preserves the rest of the URL (q / since / limit) so a user
 * who's filtering "last 24h" doesn't lose their filter when toggling tabs.
 * Severity is dropped on switch-to-admin since it only applies to infra.
 */

import Link from "next/link";
import { useSearchParams } from "next/navigation";

export interface AdminAuditTabsProps {
  active:     "admin" | "infra";
  adminCount: number;
  infraCount: number;
}

export default function AdminAuditTabs({ active, adminCount, infraCount }: AdminAuditTabsProps) {
  const sp = useSearchParams();

  function hrefFor(target: "admin" | "infra"): string {
    const next = new URLSearchParams(sp?.toString());
    next.set("tab", target);
    // Severity only applies to the infra tab; drop it when switching to admin.
    if (target === "admin") next.delete("severity");
    return `/admin/audit?${next.toString()}`;
  }

  const base =
    "inline-flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors";
  const activeCls =
    "border-brand-600 text-brand-700 dark:border-brand-400 dark:text-brand-300";
  const inactiveCls =
    "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:border-gray-700";

  return (
    <nav
      role="tablist"
      aria-label="Audit log tabs"
      className="flex gap-2 border-b border-gray-200 dark:border-[var(--surface-border,#243653)]"
    >
      <Link
        href={hrefFor("admin")}
        role="tab"
        aria-selected={active === "admin"}
        className={`${base} ${active === "admin" ? activeCls : inactiveCls}`}
      >
        Admin Actions
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
            active === "admin"
              ? "bg-brand-100 text-brand-800 dark:bg-brand-900/40 dark:text-brand-200"
              : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"
          }`}
        >
          {adminCount.toLocaleString()}
        </span>
      </Link>

      <Link
        href={hrefFor("infra")}
        role="tab"
        aria-selected={active === "infra"}
        className={`${base} ${active === "infra" ? activeCls : inactiveCls}`}
      >
        Infrastructure Events
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
            active === "infra"
              ? "bg-brand-100 text-brand-800 dark:bg-brand-900/40 dark:text-brand-200"
              : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"
          }`}
        >
          {infraCount.toLocaleString()}
        </span>
      </Link>
    </nav>
  );
}
