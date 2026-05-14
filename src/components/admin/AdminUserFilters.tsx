"use client";

/**
 * Sprint 4 W3-B — Filters bar for /admin/users.
 *
 * GET form (URL-encoded query string) so navigations are bookmarkable
 * and the page renders server-side with the filters already applied.
 * Resets pagination by clearing the limit param on form submit; the user
 * can override via the page-size selector.
 */

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

const PLANS = [
  { value: "all",      label: "All plans" },
  { value: "free",     label: "Free" },
  { value: "starter",  label: "Starter" },
  { value: "standard", label: "Standard" },
  { value: "pro",      label: "Pro" },
];

const STATUSES = [
  { value: "all",       label: "Any status" },
  { value: "active",    label: "Active" },
  { value: "trialing",  label: "Trialing" },
  { value: "past_due",  label: "Past due" },
  { value: "canceled",  label: "Canceled" },
];

const LIMITS = ["50", "100", "200", "500"];

export interface AdminUserFiltersProps {
  initialQ:      string;
  initialPlan:   string;
  initialStatus: string;
  initialLimit:  string;
}

export default function AdminUserFilters({
  initialQ, initialPlan, initialStatus, initialLimit,
}: AdminUserFiltersProps) {
  const router       = useRouter();
  const sp           = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [q,       setQ]      = useState(initialQ);
  const [plan,    setPlan]   = useState(initialPlan);
  const [status,  setStatus] = useState(initialStatus);
  const [limit,   setLimit]  = useState(initialLimit);

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const next = new URLSearchParams(sp?.toString());
    if (q) next.set("q", q); else next.delete("q");
    next.set("plan", plan);
    next.set("status", status);
    next.set("limit", limit);
    startTransition(() => router.push(`/admin/users?${next.toString()}`));
  }

  function clearFilters() {
    setQ("");
    setPlan("all");
    setStatus("all");
    startTransition(() => router.push("/admin/users"));
  }

  const isFiltered = q || plan !== "all" || status !== "all";

  return (
    <form
      onSubmit={submit}
      className="flex flex-col sm:flex-row sm:items-end gap-2 rounded-xl border border-gray-200 bg-white p-3 shadow-sm dark:bg-[var(--surface-card,#162338)] dark:border-[var(--surface-border,#243653)]"
    >
      {/* Search */}
      <div className="flex-1 min-w-0">
        <label htmlFor="user-q" className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">
          Search email or name
        </label>
        <input
          id="user-q"
          type="search"
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="majabri@…"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
        />
      </div>

      <FilterSelect id="user-plan" label="Plan" value={plan} onChange={setPlan} options={PLANS} />
      <FilterSelect id="user-status" label="Status" value={status} onChange={setStatus} options={STATUSES} />
      <FilterSelect id="user-limit" label="Page size" value={limit} onChange={setLimit} options={LIMITS.map(l => ({ value: l, label: l }))} />

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
  id, label, value, onChange, options,
}: {
  id: string; label: string; value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="min-w-[120px]">
      <label htmlFor={id} className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">{label}</label>
      <select
        id={id}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}
