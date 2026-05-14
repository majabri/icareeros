"use client";

/**
 * Sprint 4 W3-E — Manual triggers for each ingest cron. All routes are
 * permission-gated and audit-logged on the server side.
 */

import { useState } from "react";

interface ActionState { kind: "idle" | "loading" | "ok" | "err"; message?: string }

interface Trigger {
  key:      string;
  label:    string;
  hint:     string;
  endpoint: string;
}

const TRIGGERS: Trigger[] = [
  { key: "ats",        label: "Trigger ATS ingest",        hint: "/api/cron/ingest-ats (Greenhouse / Ashby / Rippling)", endpoint: "/api/admin/force-ingest-ats" },
  { key: "rss",        label: "Trigger RSS discovery",     hint: "/api/cron/discover-rss (WWR / Remotive / HN)",        endpoint: "/api/admin/force-discover-rss" },
  { key: "perplexity", label: "Trigger Perplexity sweep",  hint: "/api/cron/discover-perplexity (sonar-pro daily)",     endpoint: "/api/admin/force-discover-perplexity" },
];

export default function OpportunitiesQuickActions() {
  const [states, setStates] = useState<Record<string, ActionState>>(
    Object.fromEntries(TRIGGERS.map(t => [t.key, { kind: "idle" }]))
  );

  async function run(t: Trigger) {
    setStates(s => ({ ...s, [t.key]: { kind: "loading" } }));
    try {
      const res = await fetch(t.endpoint, { method: "POST" });
      const j = await res.json().catch(() => ({} as { ok?: boolean; error?: string; message?: string }));
      if (!res.ok || j.ok === false) {
        setStates(s => ({ ...s, [t.key]: { kind: "err", message: j.error ?? `HTTP ${res.status}` } }));
        return;
      }
      setStates(s => ({ ...s, [t.key]: { kind: "ok", message: j.message ?? "Triggered" } }));
    } catch (e) {
      setStates(s => ({ ...s, [t.key]: { kind: "err", message: (e as Error).message } }));
    }
  }

  return (
    <div className="space-y-2">
      {TRIGGERS.map(t => {
        const state = states[t.key];
        const busy  = state.kind === "loading";
        return (
          <button
            key={t.key}
            onClick={() => run(t)}
            disabled={busy}
            className="w-full flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-left text-sm shadow-sm hover:bg-gray-50 hover:shadow-md transition-all disabled:opacity-60 dark:bg-[var(--surface-card,#162338)] dark:border-[var(--surface-border,#243653)] dark:text-gray-200 dark:hover:bg-white/5"
          >
            <span className="text-lg flex-shrink-0">⚡</span>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-gray-800 dark:text-gray-100">{t.label}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{t.hint}</div>
            </div>
            {state.kind === "loading" && <span className="text-xs text-gray-500">…</span>}
            {state.kind === "ok"      && <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400" title={state.message}>✓</span>}
            {state.kind === "err"     && <span className="text-xs font-semibold text-rose-600 dark:text-rose-400" title={state.message}>✗</span>}
          </button>
        );
      })}
      <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-3">
        Each trigger forwards to the matching `/api/cron/*` route with `CRON_SECRET` and audit-logs the attempt.
      </p>
    </div>
  );
}
