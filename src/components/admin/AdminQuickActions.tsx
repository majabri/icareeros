"use client";

/**
 * Sprint 4 W3-A — Dashboard widget: Quick-action buttons.
 *
 * MVP scope: Force ATS ingest + Toggle maintenance mode buttons.
 * Both are wired with optimistic UI + fetch call. The handlers themselves
 * are stubs in this PR — real wiring lives in:
 *   • Force ATS ingest → triggers /api/cron/ingest-ats with CRON_SECRET
 *     (Wave 3-E will add a server action that does this with audit logging)
 *   • Toggle maintenance mode → toggles feature_flags.maintenance_mode
 *     (W3-D flags page is the canonical home; this is a shortcut)
 */

import { useState } from "react";

interface ActionState { status: "idle" | "loading" | "ok" | "err"; message?: string }

export default function AdminQuickActions() {
  const [ingestState, setIngestState] = useState<ActionState>({ status: "idle" });
  const [maintState,   setMaintState]   = useState<ActionState>({ status: "idle" });

  async function handleForceIngest() {
    setIngestState({ status: "loading" });
    try {
      const res = await fetch("/api/admin/force-ingest-ats", { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json().catch(() => ({}));
      setIngestState({ status: "ok", message: j.message ?? "Triggered" });
    } catch (e) {
      setIngestState({ status: "err", message: (e as Error).message });
    }
  }

  async function handleToggleMaintenance() {
    setMaintState({ status: "loading" });
    try {
      const res = await fetch("/api/admin/maintenance/toggle", { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json().catch(() => ({}));
      setMaintState({ status: "ok", message: j.enabled ? "ON" : "OFF" });
    } catch (e) {
      setMaintState({ status: "err", message: (e as Error).message });
    }
  }

  return (
    <div className="space-y-2">
      <ActionButton
        emoji="🔄"
        label="Force ATS ingest"
        hint="Trigger /api/cron/ingest-ats now"
        state={ingestState}
        onClick={handleForceIngest}
      />
      <ActionButton
        emoji="🛠"
        label="Toggle maintenance mode"
        hint="Sets feature_flags.maintenance_mode"
        state={maintState}
        onClick={handleToggleMaintenance}
      />
    </div>
  );
}

function ActionButton({
  emoji, label, hint, state, onClick,
}: {
  emoji: string; label: string; hint: string;
  state: ActionState;
  onClick: () => void;
}) {
  const isBusy = state.status === "loading";
  return (
    <button
      onClick={onClick}
      disabled={isBusy}
      className="w-full flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-left text-sm shadow-sm hover:bg-gray-50 hover:shadow-md transition-all disabled:opacity-60 dark:bg-[var(--surface-card,#162338)] dark:border-[var(--surface-border,#243653)] dark:text-gray-200 dark:hover:bg-white/5"
    >
      <span className="text-lg flex-shrink-0">{emoji}</span>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-gray-800 dark:text-gray-100">{label}</div>
        <div className="text-xs text-gray-500 dark:text-gray-400">{hint}</div>
      </div>
      {state.status === "ok"      && <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">{state.message ?? "✓"}</span>}
      {state.status === "err"     && <span className="text-xs font-semibold text-rose-600 dark:text-rose-400" title={state.message}>✗</span>}
      {state.status === "loading" && <span className="text-xs text-gray-500">…</span>}
    </button>
  );
}
