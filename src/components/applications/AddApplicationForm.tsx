"use client";

/**
 * AddApplicationForm — inline add-form for the Applications pipeline page.
 *
 * Standalone client component so the pipeline page can mount/unmount it as
 * a panel above the table. POSTs /api/applications and bubbles the new row
 * up via onCreated.
 *
 * Phase 5 Item 4 — see docs/specs/COWORK-BRIEF-phase5-v1.md.
 */

import { useEffect, useRef, useState } from "react";
import {
  STATUS_ORDER,
  STATUS_LABEL,
  type Application,
  type ApplicationStatus,
  type IncomingTrackPayload,
} from "./pipelineFilters";

export interface AddApplicationFormProps {
  /** Initial values for /jobs Track handoff. */
  initial?:    IncomingTrackPayload | null;
  onCreated:   (row: Application) => void;
  onCancel:    () => void;
}

export function AddApplicationForm({ initial, onCreated, onCancel }: AddApplicationFormProps) {
  const [jobTitle, setJobTitle] = useState(initial?.job_title ?? "");
  const [company,  setCompany]  = useState(initial?.company   ?? "");
  const [jobUrl,   setJobUrl]   = useState(initial?.job_url   ?? "");
  const [status,   setStatus]   = useState<ApplicationStatus>("applied");
  const [notes,    setNotes]    = useState("");
  const [busy,     setBusy]     = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => { titleRef.current?.focus(); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!jobTitle.trim() || !company.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/applications", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_title:      jobTitle.trim(),
          company:        company.trim(),
          job_url:        jobUrl.trim() || null,
          status,
          notes,
          opportunity_id: initial?.opportunity_id ?? null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.error ?? `HTTP ${res.status}`);
        setBusy(false);
        return;
      }
      const body = (await res.json()) as { application: Application };
      onCreated(body.application);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-xl border border-brand-200 bg-brand-50 p-5 space-y-4 shadow-sm"
      data-testid="add-application-form"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-brand-900">Track an application</h3>
        <button
          type="button"
          onClick={onCancel}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          Cancel
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Job title *</label>
          <input
            ref={titleRef}
            type="text"
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
            required
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            placeholder="e.g. Senior Product Manager"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Company *</label>
          <input
            type="text"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            required
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            placeholder="e.g. Acme Inc."
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Job URL (optional)</label>
        <input
          type="url"
          value={jobUrl}
          onChange={(e) => setJobUrl(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          placeholder="https://..."
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as ApplicationStatus)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Notes (optional)</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          placeholder="Recruiter contact, interview prep notes, follow-up reminders…"
        />
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={busy || !jobTitle.trim() || !company.trim()}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Add application"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
