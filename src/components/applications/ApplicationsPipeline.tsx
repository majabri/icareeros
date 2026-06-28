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

import { Fragment, useCallback, useEffect, useState } from "react";
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
  screening:    "bg-violet-50 text-violet-700 border-violet-200",
  interviewing: "bg-brand-50 text-brand-700 border-brand-200",
  final_round:  "bg-orange-50 text-orange-700 border-orange-200",
  offer:        "bg-green-50 text-green-700 border-green-200",
  accepted:     "bg-emerald-50 text-emerald-800 border-emerald-200 font-semibold",
  rejected:     "bg-red-50 text-red-700 border-red-200",
  withdrawn:    "bg-amber-50 text-amber-700 border-amber-200",
};

// 2026-06-28 (Brief Task 3) — application_events row shape returned by
// GET /api/applications/[id]/events. Newest first.
interface ApplicationEvent {
  id:             string;
  application_id: string;
  event_type:     string;
  metadata:       Record<string, unknown> | null;
  occurred_at:    string;
  created_at:     string;
}

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
  // Brief B3 Task 15 — view toggle.
  const [viewMode,    setViewMode]    = useState<"list" | "kanban">(
    () => (typeof window !== "undefined" && window.localStorage.getItem("pipelineViewMode") === "kanban") ? "kanban" : "list"
  );
  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem("pipelineViewMode", viewMode);
  }, [viewMode]);
  // Brief B3 Task 18 — per-row notes editing.
  const [editingNotesId, setEditingNotesId] = useState<string | null>(null);
  const [draftNotes,     setDraftNotes]     = useState<string>("");

  // 2026-06-28 (Brief Task 3) — Activity timeline: events fetched lazily per
  // row on first expand and cached in memory for the session.
  const [expandedRowId,   setExpandedRowId]   = useState<string | null>(null);
  const [eventsByApp,     setEventsByApp]     = useState<Record<string, ApplicationEvent[]>>({});
  const [eventsLoadingId, setEventsLoadingId] = useState<string | null>(null);
  const [eventsErrorById, setEventsErrorById] = useState<Record<string, string | null>>({});

  const toggleActivity = useCallback(async (id: string) => {
    if (expandedRowId === id) {
      setExpandedRowId(null);
      return;
    }
    setExpandedRowId(id);
    if (eventsByApp[id]) return; // already loaded — reuse cached
    setEventsLoadingId(id);
    setEventsErrorById(prev => ({ ...prev, [id]: null }));
    try {
      const res = await fetch(`/api/applications/${id}/events`);
      const data = await res.json();
      if (!res.ok) {
        setEventsErrorById(prev => ({ ...prev, [id]: data?.error ?? `HTTP ${res.status}` }));
        return;
      }
      const events: ApplicationEvent[] = Array.isArray(data?.events) ? data.events : [];
      setEventsByApp(prev => ({ ...prev, [id]: events }));
    } catch (err) {
      setEventsErrorById(prev => ({
        ...prev,
        [id]: err instanceof Error ? err.message : "Network error",
      }));
    } finally {
      setEventsLoadingId(prev => (prev === id ? null : prev));
    }
  }, [expandedRowId, eventsByApp]);

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
      router.replace("/pipeline", { scroll: false });
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

  async function handleNotesSave(id: string) {
    const cur = draftNotes;
    setRows(prev => prev.map(r => r.id === id ? { ...r, notes: cur } : r));
    setEditingNotesId(null);
    setDraftNotes("");
    const res = await fetch(`/api/applications/${encodeURIComponent(id)}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: cur }),
    });
    if (!res.ok) {
      setError(`Failed to save notes (HTTP ${res.status}).`);
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
          {/* Brief B3 Task 15 — view toggle */}
          <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden mr-2" role="tablist" aria-label="Pipeline view">
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === "list"}
              onClick={() => setViewMode("list")}
              className={`px-3 py-1.5 text-xs font-medium ${viewMode === "list" ? "bg-brand-600 text-white" : "bg-white text-gray-700 hover:bg-gray-50"}`}
            >
              List
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === "kanban"}
              onClick={() => setViewMode("kanban")}
              className={`px-3 py-1.5 text-xs font-medium border-l border-gray-300 ${viewMode === "kanban" ? "bg-brand-600 text-white" : "bg-white text-gray-700 hover:bg-gray-50"}`}
            >
              Kanban
            </button>
          </div>
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
              href="/opportunities"
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Browse jobs →
            </a>
          </div>
        </div>
      ) : viewMode === "list" ? (
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
                <Fragment key={row.id}>
                <tr data-testid={`application-row-${row.id}`}>
                  <td className="px-4 py-3 align-top">
                    <p className="font-medium text-gray-900">{row.job_title}</p>
                    {editingNotesId === row.id ? (
                      <div className="mt-1">
                        <textarea
                          value={draftNotes}
                          onChange={(e) => setDraftNotes(e.target.value)}
                          rows={3}
                          className="w-full max-w-md rounded border border-gray-300 px-2 py-1 text-xs"
                          placeholder="Notes (recruiter contact, follow-up reminders, prep links, etc.)"
                          autoFocus
                        />
                        <div className="mt-1 flex gap-2">
                          <button
                            type="button"
                            onClick={() => void handleNotesSave(row.id)}
                            className="rounded bg-brand-600 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-brand-700"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => { setEditingNotesId(null); setDraftNotes(""); }}
                            className="rounded border border-gray-300 px-2 py-0.5 text-[11px] text-gray-600 hover:bg-gray-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : row.notes ? (
                      <p
                        className="mt-1 text-xs text-gray-500 line-clamp-2 max-w-md cursor-pointer hover:text-gray-700"
                        onClick={() => { setEditingNotesId(row.id); setDraftNotes(row.notes ?? ""); }}
                        title="Click to edit notes"
                      >
                        {row.notes}
                      </p>
                    ) : (
                      <button
                        type="button"
                        onClick={() => { setEditingNotesId(row.id); setDraftNotes(""); }}
                        className="mt-1 text-xs text-gray-400 underline underline-offset-2 hover:text-brand-600"
                      >
                        + Add notes
                      </button>
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
                    <div className="flex flex-col items-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => void toggleActivity(row.id)}
                        className="text-xs font-medium text-brand-600 hover:text-brand-700"
                        aria-expanded={expandedRowId === row.id}
                        aria-controls={`activity-${row.id}`}
                        data-testid={`activity-toggle-${row.id}`}
                      >
                        {expandedRowId === row.id ? "Hide activity" : "Activity"}
                      </button>
                      <button
                        onClick={() => void handleDelete(row.id)}
                        className="text-xs text-gray-400 hover:text-red-600"
                        data-testid={`delete-${row.id}`}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
                {expandedRowId === row.id && (
                  <tr id={`activity-${row.id}`} data-testid={`activity-${row.id}`}>
                    <td colSpan={5} className="bg-gray-50 px-4 py-3">
                      <ApplicationActivityTimeline
                        loading={eventsLoadingId === row.id}
                        error={eventsErrorById[row.id] ?? null}
                        events={eventsByApp[row.id] ?? []}
                      />
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        // Brief B3 Task 15 — Kanban view: column per status, card per application.
        <div className="overflow-x-auto" data-testid="applications-kanban">
          <div className="flex gap-3 pb-2">
            {STATUS_ORDER.map((status) => {
              const col = visible.filter(r => r.status === status);
              return (
                <div key={status} className="flex w-64 shrink-0 flex-col rounded-xl border border-gray-200 bg-gray-50 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${STATUS_PILL[status]}`}>
                      {STATUS_LABEL[status]}
                    </span>
                    <span className="text-xs text-gray-500">{col.length}</span>
                  </div>
                  <div className="flex flex-col gap-2">
                    {col.length === 0 && (
                      <p className="rounded border border-dashed border-gray-300 bg-white px-2 py-3 text-center text-[11px] text-gray-400">
                        Empty
                      </p>
                    )}
                    {col.map((row) => (
                      <div
                        key={row.id}
                        className="rounded-lg border border-gray-200 bg-white p-2 shadow-sm"
                        data-testid={`kanban-card-${row.id}`}
                      >
                        <p className="text-sm font-medium text-gray-900 line-clamp-2">{row.job_title}</p>
                        <p className="text-xs text-gray-500">{row.company}</p>
                        <p className="mt-1 text-[10px] uppercase tracking-wider text-gray-400">{fmtDate(row.applied_at)}</p>
                        <select
                          value={row.status}
                          onChange={(e) => void handleStatusChange(row.id, e.target.value as ApplicationStatus)}
                          className="mt-2 w-full rounded border border-gray-300 px-1.5 py-0.5 text-[11px]"
                          aria-label={`Change status of ${row.job_title}`}
                        >
                          {STATUS_ORDER.map((s) => (
                            <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
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


// 2026-06-28 (Brief Task 3) — Activity timeline rendered inside the row's
// expanded section. Pure presentational; parent handles fetching + caching.
function ApplicationActivityTimeline({
  loading,
  error,
  events,
}: {
  loading: boolean;
  error:   string | null;
  events:  ApplicationEvent[];
}) {
  if (loading) return <p className="text-xs italic text-gray-500">Loading activity…</p>;
  if (error) {
    return (
      <p className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">
        Failed to load activity: {error}
      </p>
    );
  }
  if (events.length === 0) {
    return (
      <p className="text-xs italic text-gray-500">
        No activity logged for this application yet.
      </p>
    );
  }
  return (
    <ol className="space-y-2 border-l-2 border-brand-200 pl-4">
      {events.map((ev) => (
        <li key={ev.id} className="relative">
          <span className="absolute -left-[21px] mt-1 inline-block h-2 w-2 rounded-full bg-brand-500 ring-2 ring-white" />
          <p className="text-xs font-medium text-gray-900">{formatEventTitle(ev)}</p>
          {formatEventDetail(ev) && (
            <p className="text-[11px] text-gray-600">{formatEventDetail(ev)}</p>
          )}
          <p className="text-[10px] uppercase tracking-wider text-gray-400">
            {fmtDate(ev.occurred_at)}
          </p>
        </li>
      ))}
    </ol>
  );
}

function formatEventTitle(ev: ApplicationEvent): string {
  switch (ev.event_type) {
    case "created":             return "Application created";
    case "status_changed":      return "Status changed";
    case "note":                return "Note added";
    case "follow_up":           return "Follow-up logged";
    case "interview_scheduled": return "Interview scheduled";
    case "interview_completed": return "Interview completed";
    case "offer_received":      return "Offer received";
    case "offer_accepted":      return "Offer accepted";
    case "rejected":            return "Rejected";
    case "withdrawn":           return "Withdrawn";
    default:                    return ev.event_type;
  }
}

function formatEventDetail(ev: ApplicationEvent): string | null {
  const md = ev.metadata ?? {};
  if (ev.event_type === "status_changed") {
    const from = typeof md.from === "string" ? STATUS_LABEL[md.from as ApplicationStatus] ?? md.from : null;
    const to   = typeof md.to   === "string" ? STATUS_LABEL[md.to   as ApplicationStatus] ?? md.to   : null;
    if (from && to) return `${from} → ${to}`;
    if (to)         return `Now: ${to}`;
    return null;
  }
  if (ev.event_type === "note" && typeof md.note === "string") return md.note;
  if (ev.event_type === "created" && typeof md.status === "string") {
    const lbl = STATUS_LABEL[md.status as ApplicationStatus] ?? md.status;
    return `Initial status: ${lbl}`;
  }
  return null;
}
