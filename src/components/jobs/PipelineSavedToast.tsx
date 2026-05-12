"use client";

/**
 * PipelineSavedToast — auto-dismissing inline toast after Apply.
 *
 * Lives inside the same React tree as the card/drawer; no global
 * provider. Dismisses after 4s. Honours dark-mode tokens.
 */

import { useEffect } from "react";

interface PipelineSavedToastProps {
  message: string;
  variant?: "success" | "warning";
  onDismiss: () => void;
}

export function PipelineSavedToast({ message, variant = "success", onDismiss }: PipelineSavedToastProps) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 4000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  const cls = variant === "warning"
    ? "border-amber-500/40 bg-amber-50 text-amber-900 dark:bg-amber-500/10 dark:text-amber-200"
    : "border-emerald-500/40 bg-emerald-50 text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-200";

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-6 right-6 z-[95] rounded-xl border px-4 py-3 shadow-lg ${cls} animate-in slide-in-from-bottom-2 duration-200`}
    >
      <div className="flex items-center gap-3 text-sm font-medium">
        <span>{variant === "success" ? "✓" : "⚠"}</span>
        <span>{message}</span>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="ml-2 opacity-60 hover:opacity-100"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
