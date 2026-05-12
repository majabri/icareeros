"use client";

/**
 * ApplicationsPipeline — main /applications client component.
 *
 * - Lists the user's applications, sortable + filterable by status.
 * - Inline status dropdown PATCHes the row.
 * - Add form opens above the table; pre-fills from sessionStorage when the
 *   user came in via /jobs Track button.
 * - Delete with confirm.
 *
 * Phase 5 Item 4 — see docs/specs/COWORK-BRIEF-phase5-v1.md.
 */

import { useCallback, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { AddApplicationForm } from "./AddApplicationForm";
import {
  STATUS_ORDER,
  STATUS_LABEL,
  countApplications,
  filterApplications,
  sortApplications,
  readIncomingTrack,
  clearIncomingTrack,
  isApplicationStatus,
  type Application,
  type ApplicationStatus,
  type SortKey,
  type IncomingTrackPayload,
} from "./pipelineFilters";

const STATUS_PILL: Record<ApplicationStatus, string> = {
  researching:  "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:border-sky-500/30",
  applying:     "bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-500/10 dark:text-cyan-300 dark:border-cyan-500/30",
  applied:      "bg-gray-100 text-gray-700 border-gray-200",
  interviewing: "bg-brand-50 text-brand-700 border-brand-200",
  offer:        "bg-green-50 text-green-700 border-green-200",
  rejected:     "bg-red-50 text-red-700 border-red-200",
  withdrawn:    "bg-amber-50 text-amber-700 border-amber-200",
};

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function ApplicationsPipeline() {
  const router       = useRouter();
  const searchParams = useSearchParams();

  const [rows,        setRows]        = useState<Application[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<ApplicationStatus | "all">("all");
  const [sort,        setSort]        = useState<SortKey>("applied_at_desc");
  const [showForm,    setShowForm]    = useState(false);
  const [initialPayload, setInitialPayload] = useState<IncomingTrackPayload | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/applications");
      if (!res.ok) {
        setError(`HTTP ${res.status}`);
        setLoading(false);
        return;
      }
      const body = (await res.json()) as { applications: Application[] };
      setRows(body.applications ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => { void reload(); }, [reload]);

  // /jobs Track handoff — open add-form pre-filled when ?track=1 is present.
  useEffect(() => {
    if (searchParams?.get("track") === "1") {
      const incoming = readIncomingTrack();
      if (incoming) setInitialPayload(incoming);
      setShowForm(true);
      clearIncomingTrack();
      // Strip the param so a refresh doesn't re-open the form.
      router.replace("/applications", { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleStatusChange(id: string, next: ApplicationStatus) {
    if (!isApplicationStatus(next)) return;
    setRows(prev => prev.map(r => r.id === id ? { ...r, status: next } : r));
    const res = await fetch(`/api/applications/${encodeURIComponent(id)}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    if (!res.ok) {
      // revert on failure
      setError(`Failed to update status (HTTP ${res.status}).`);
      void reload();
    }
  }

  async function handleDelete(id: string) {
    const target = rows.find(r => r.id === id);
    const label  = target ? `${target.job_title} @ ${target.company}` : "this application";
    if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return;
    setRows(prev => prev.filter(r => r.id !== id));
    const res = await fetch(`/api/applications/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!res.ok) {
      setError(`Failed to delete (HTTP ${res.status}).`);
      void reload();
    }
  }

  const visible  = sortApplications(filterApplications(rows, { status: statusFilter }), sort);
  const counts   = countApplications(rows);

  return (
    <div className="space-y-6" data-testid="applications-pipeline">
      {/* Header counters */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Counter label="Total"        value={counts.total} />
        <Counter label="In progress"  value={counts.active}      tint="brand" />
        <Counter label="Offers"       value={counts.offer}       tint="green" />
        <Counter label="Rejected"     value={counts.rejected}    tint="red"   />
      </section>

      {/* Add + filters */}
      <section className="flex flex-wrap items-center justify-between gap-3">
        {!showForm ? (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            data-testid="open-add-application"
          >
            + Track new application
          </button>
        ) : <span /> /* keep flex justify */ }

        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as ApplicationStatus | "all")}
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs"
          >
            <option value="all">All</option>
            {STATUS_ORDER.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
          <label className="text-xs text-gray-500 ml-2">Sort</label>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs"
          >
            <option value="applied_at_desc">Newest first</option>
            <option value="applied_at_asc">Oldest first</option>
            <option value="status_asc">By status</option>
          </select>
        </div>
      </section>

      {showForm && (
        <AddApplicationForm
          initial={initialPayload}
          onCreated={(row) => {
            setRows(prev => [row, ...prev]);
            setShowForm(false);
            setInitialPayload(null);
          }}
          onCancel={() => {
            setShowForm(false);
            setInitialPayload(null);
          }}
        />
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-gray-100" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div
          className="rounded-2xl border-2 border-dashed border-gray-200 bg-white p-10 text-center"
          data-testid="applications-empty-state"
        >
          <div className="text-4xl">📋</div>
          <h3 className="mt-3 text-base font-semibold text-gray-900">No applications yet</h3>
          <p className="mt-1 text-sm text-gray-500">
            Track every role you apply to — status, follow-ups, offers — in one place.
          </p>
          <div className="mt-4 flex items-center justify-center gap-3">
            <button
              onClick={() => setShowForm(true)}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            >
              + Track manually
            </button>
            <a
              href="/jobs"
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Browse jobs →
            </a>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full text-sm" data-testid="applications-table">
            <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Role</th>
                <th className="px-4 py-2 text-left font-medium">Company</th>
                <th className="px-4 py-2 text-left font-medium">Applied</th>
                <th className="px-4 py-2 text-left font-medium">Status</th>
                <th className="px-4 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visible.map((row) => (
                <tr key={row.id} data-testid={`application-row-${row.id}`}>
                  <td className="px-4 py-3 align-top">
                    <p className="font-medium text-gray-900">{row.job_title}</p>
                    {row.notes && (
                      <p className="text-xs text-gray-500 line-clamp-2 max-w-md">{row.notes}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 align-top text-gray-700">
                    {row.company}
                    {row.job_url && (
                      <a
                        href={row.job_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-1 text-xs text-brand-600 hover:text-brand-700"
                      >
                        ↗
                      </a>
                    )}
                  </td>
                  <td className="px-4 py-3 align-top text-gray-700">{fmtDate(row.applied_at)}</td>
                  <td className="px-4 py-3 align-top">
                    <select
                      value={row.status}
                      onChange={(e) => void handleStatusChange(row.id, e.target.value as ApplicationStatus)}
                      className={`rounded-lg border px-2 py-1 text-xs font-medium ${STATUS_PILL[row.status]}`}
                      data-testid={`status-${row.id}`}
                    >
                      {STATUS_ORDER.map((s) => (
                        <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 align-top text-right">
                    <button
                      onClick={() => void handleDelete(row.id)}
                      className="text-xs text-gray-400 hover:text-red-600"
                      data-testid={`delete-${row.id}`}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

interface CounterProps {
  label: string;
  value: number;
  tint?: "brand" | "green" | "red";
}

function Counter({ label, value, tint }: CounterProps) {
  const tintClass = tint === "brand" ? "text-brand-700"
                  : tint === "green" ? "text-green-700"
                  : tint === "red"   ? "text-red-700"
                  : "text-gray-900";
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-xs uppercase tracking-wider text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${tintClass}`}>{value}</p>
    </div>
  );
}
