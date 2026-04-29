"use client";

import { useState, useEffect, useCallback } from "react";
import {
  fetchAlertSubscription,
  saveAlertSubscription,
  deleteAlertSubscription,
  type AlertSubscription,
  type AlertPreferences,
} from "@/services/ai/jobAlertService";

const JOB_TYPES = ["Full-time", "Part-time", "Contract", "Internship", "Freelance"];

interface Props {
  /** Pre-fill the query from the current search bar value */
  initialQuery?: string;
  onClose: () => void;
}

type Status = "idle" | "loading" | "saving" | "deleting" | "success" | "error";

export function JobAlertModal({ initialQuery = "", onClose }: Props) {
  const [existing, setExisting] = useState<AlertSubscription | null>(null);
  const [query,     setQuery]   = useState(initialQuery);
  const [isRemote,  setRemote]  = useState(false);
  const [jobType,   setJobType] = useState("");
  const [frequency, setFreq]    = useState<"daily" | "weekly">("daily");
  const [status,    setStatus]  = useState<Status>("loading");
  const [errorMsg,  setError]   = useState<string | null>(null);

  // Load existing subscription on mount
  const loadSub = useCallback(async () => {
    setStatus("loading");
    try {
      const sub = await fetchAlertSubscription();
      setExisting(sub);
      if (sub) {
        setQuery(sub.query ?? initialQuery);
        setRemote(sub.is_remote);
        setJobType(sub.job_type ?? "");
        setFreq(sub.frequency);
      }
      setStatus("idle");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load subscription");
      setStatus("error");
    }
  }, [initialQuery]);

  useEffect(() => { loadSub(); }, [loadSub]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");
    setError(null);
    try {
      const prefs: AlertPreferences = {
        query:     query.trim() || undefined,
        is_remote: isRemote,
        job_type:  jobType || undefined,
        frequency,
      };
      const saved = await saveAlertSubscription(prefs);
      setExisting(saved);
      setStatus("success");
      // Auto-close after 1.5 s
      setTimeout(onClose, 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save alert");
      setStatus("idle");
    }
  }

  async function handleDelete() {
    setStatus("deleting");
    setError(null);
    try {
      await deleteAlertSubscription();
      setExisting(null);
      setStatus("success");
      setTimeout(onClose, 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove alert");
      setStatus("idle");
    }
  }

  const busy = status === "loading" || status === "saving" || status === "deleting";

  return (
    /* Backdrop */
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Job alert settings"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white shadow-2xl ring-1 ring-gray-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between rounded-t-2xl border-b border-gray-100 bg-gradient-to-r from-amber-50 to-orange-50 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">🔔 Job Alerts</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              {existing?.is_active ? "Editing your active alert" : "Get matching jobs by email"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-gray-400 hover:bg-white hover:text-gray-600 transition-colors"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-5">
          {/* Loading */}
          {status === "loading" && (
            <div className="flex items-center gap-2 py-6 text-sm text-gray-400">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
              Loading your alert settings…
            </div>
          )}

          {/* Success */}
          {status === "success" && (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <span className="text-4xl">✅</span>
              <p className="text-sm font-medium text-gray-700">
                {existing ? "Alert saved!" : "Alert removed."}
              </p>
            </div>
          )}

          {/* Form */}
          {(status === "idle" || status === "saving" || status === "deleting" || status === "error") && (
            <form onSubmit={handleSave} className="space-y-4">
              {/* Keywords */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Job keywords
                </label>
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="e.g. Product Manager, AI, SaaS…"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                             text-gray-900 placeholder-gray-400 shadow-sm
                             focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
                  disabled={busy}
                />
              </div>

              {/* Job type */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Job type
                </label>
                <select
                  value={jobType}
                  onChange={(e) => setJobType(e.target.value)}
                  disabled={busy}
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm
                             text-gray-700 focus:outline-none focus:ring-1 focus:ring-amber-400"
                >
                  <option value="">Any type</option>
                  {JOB_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              {/* Remote toggle */}
              <label className="flex cursor-pointer items-center gap-3 text-sm text-gray-700 select-none">
                <input
                  type="checkbox"
                  checked={isRemote}
                  onChange={(e) => setRemote(e.target.checked)}
                  disabled={busy}
                  className="h-4 w-4 rounded border-gray-300 text-amber-500 focus:ring-amber-400"
                />
                Remote only
              </label>

              {/* Frequency */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Digest frequency
                </label>
                <div className="flex gap-3">
                  {(["daily", "weekly"] as const).map((f) => (
                    <label
                      key={f}
                      className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border py-2.5 text-sm font-medium transition-colors
                        ${frequency === f
                          ? "border-amber-400 bg-amber-50 text-amber-700"
                          : "border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300"
                        }`}
                    >
                      <input
                        type="radio"
                        name="frequency"
                        value={f}
                        checked={frequency === f}
                        onChange={() => setFreq(f)}
                        disabled={busy}
                        className="sr-only"
                      />
                      {f === "daily" ? "📅 Daily" : "📆 Weekly"}
                    </label>
                  ))}
                </div>
              </div>

              {/* Error */}
              {errorMsg && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{errorMsg}</p>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  disabled={busy}
                  className="flex-1 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold
                             text-white shadow-sm hover:bg-amber-600 disabled:opacity-50 transition-colors"
                >
                  {status === "saving"
                    ? "Saving…"
                    : existing?.is_active
                    ? "Update Alert"
                    : "Activate Alert"}
                </button>

                {existing?.is_active && (
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={busy}
                    className="rounded-lg border border-red-200 px-4 py-2.5 text-sm font-medium
                               text-red-500 hover:bg-red-50 disabled:opacity-50 transition-colors"
                  >
                    {status === "deleting" ? "Removing…" : "Remove"}
                  </button>
                )}
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
