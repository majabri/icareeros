"use client";

/**
 * Sprint 4 W3-F — Filter bar for /admin/audit.
 *
 * GET form (URL-encoded) so navigations are bookmarkable and the server
 * renders with filters already applied. Mirrors AdminUserFilters / AdminTicketFilters
 * patterns for consistency across the admin shell.
 *
 * Severity dropdown is disabled when tab === "admin" (it only applies to
 * infrastructure_events; admin actions don't have a severity column).
 */

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

const SEVERITIES = [
  { value: "all",      label: "Any severity" },
  { value: "info",     label: "Info" },
  { value: "warning",  label: "Warning" },
  { value: "error",    label: "Error" },
  { value: "critical", label: "Critical" },
];

const SINCE = [
  { value: "1h",  label: "Last hour" },
  { value: "24h", label: "Last 24 hours" },
  { value: "7d",  label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "all", label: "All time" },
];

const LIMITS = ["25", "50", "100", "200", "500"];

export interface AdminAuditFiltersProps {
  tab:             "admin" | "infra";
  initialQ:        string;
  initialSeverity: string;
  initialSince:    string;
  initialLimit:    string;
}

export default function AdminAuditFilters({
  tab, initialQ, initialSeverity, initialSince, initialLimit,
}: AdminAuditFiltersProps) {
  const router = useRouter();
  const sp     = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [q,        setQ]        = useState(initialQ);
  const [severity, setSeverity] = useState(initialSeverity);
  const [since,    setSince]    = useState(initialSince);
  const [limit,    setLimit]    = useState(initialLimit);

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const next = new URLSearchParams(sp?.toString());
    next.set("tab", tab);
    if (q) next.set("q", q); else next.delete("q");
    if (tab === "infra") next.set("severity", severity);
    else next.delete("severity");
    next.set("since", since);
    next.set("limit", limit);
    startTransition(() => router.push(`/admin/audit?${next.toString()}`));
  }

  function clearFilters() {
    setQ("");
    setSeverity("all");
    setSince("7d");
    setLimit("100");
    startTransition(() => router.push(`/admin/audit?tab=${tab}`));
  }

  const isFiltered =
    q !== "" ||
    (tab === "infra" && severity !== "all") ||
    since !== "7d" ||
    limit !== "100";

  return (
    <form
      onSubmit={submit}
      className="flex flex-col sm:flex-row sm:items-end gap-2 rounded-xl border border-gray-200 bg-white p-3 shadow-sm dark:bg-[var(--surface-card,#162338)] dark:border-[var(--surface-border,#243653)]"
    >
      {/* Search */}
      <div className="flex-1 min-w-0">
        <label htmlFor="audit-q" className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">
          {tab === "admin" ? "Search action / admin / target" : "Search event / source"}
        </label>
        <input
          id="audit-q"
          type="search"
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder={tab === "admin" ? "users.delete or majabri@…" : "cron.run_summary or vercel.deploy"}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
        />
      </div>

      <FilterSelect
        id="audit-severity"
        label="Severity"
        value={severity}
        onChange={setSeverity}
        options={SEVERITIES}
        disabled={tab === "admin"}
      />
      <FilterSelect
        id="audit-since"
        label="Time range"
        value={since}
        onChange={setSince}
        options={SINCE}
      />
      <FilterSelect
        id="audit-limit"
        label="Page size"
        value={limit}
        onChange={setLimit}
        options={LIMITS.map(l => ({ value: l, label: l }))}
      />

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center rounded-md bg-brand-600 text-white px-4 py-2 text-sm font-medium hover:bg-brand-700 disabled:opacity-60"
        >
          {isPending ? "Filtering…" : "Apply"}
        </button>
        {isFiltered && (
          <button
            type="button"
            onClick={clearFilters}
            className="inline-flex items-center rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-white/5"
          >
            Clear
          </button>
        )}
      </div>
    </form>
  );
}

function FilterSelect({
  id, label, value, onChange, options, disabled,
}: {
  id: string; label: string; value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
}) {
  return (
    <div className="min-w-[140px]">
      <label htmlFor={id} className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">{label}</label>
      <select
        id={id}
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 disabled:bg-gray-100 disabled:text-gray-400 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 dark:disabled:bg-gray-900 dark:disabled:text-gray-600"
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}
