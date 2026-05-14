"use client";

/**
 * Sprint 4 W2-B — confirmation dialog for destructive admin actions.
 * Optional type-to-confirm string for irreversible operations.
 */

import { useState, useEffect } from "react";

export interface AdminConfirmDialogProps {
  open:        boolean;
  onClose:     () => void;
  onConfirm:   () => void | Promise<void>;
  title:       string;
  description: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?:  string;
  /** Danger styling for the confirm button. */
  destructive?: boolean;
  /** If set, user must type this string exactly to enable the confirm button. */
  typeToConfirm?: string;
}

export default function AdminConfirmDialog({
  open, onClose, onConfirm,
  title, description,
  confirmLabel = "Confirm", cancelLabel = "Cancel",
  destructive = false,
  typeToConfirm,
}: AdminConfirmDialogProps) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (!open) { setTyped(""); setBusy(false); } }, [open]);

  if (!open) return null;
  const armed = !typeToConfirm || typed === typeToConfirm;

  async function handleConfirm() {
    if (!armed || busy) return;
    setBusy(true);
    try { await onConfirm(); } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-2xl dark:bg-[var(--surface-card,#162338)] dark:border-[var(--surface-border,#243653)]">
        <h2 id="confirm-title" className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
        <div className="mt-2 text-sm text-gray-600 dark:text-gray-300">{description}</div>

        {typeToConfirm && (
          <div className="mt-4">
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-400 mb-1">
              Type <code className="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100">{typeToConfirm}</code> to confirm:
            </label>
            <input
              type="text"
              value={typed}
              onChange={e => setTyped(e.target.value)}
              autoFocus
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-rose-500 focus:border-rose-500 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
            />
          </div>
        )}

        <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button onClick={onClose} disabled={busy} className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-white/5 disabled:opacity-60">
            {cancelLabel}
          </button>
          <button
            onClick={handleConfirm}
            disabled={!armed || busy}
            className={`rounded-md px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-50 disabled:cursor-not-allowed ${
              destructive
                ? "bg-rose-600 hover:bg-rose-700"
                : "bg-brand-600 hover:bg-brand-700"
            }`}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
