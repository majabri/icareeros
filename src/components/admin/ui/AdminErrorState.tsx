/**
 * Sprint 4 W2-B — consistent error display for admin pages.
 * Use for non-fatal data-fetch errors. For permission-denied use AdminEmptyState
 * with a "request access" CTA instead.
 */

export interface AdminErrorStateProps {
  title?:      string;
  message:     string;
  retry?:      () => void;
}

export default function AdminErrorState({ title = "Something went wrong", message, retry }: AdminErrorStateProps) {
  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700 dark:bg-rose-900/20 dark:border-rose-500/30 dark:text-rose-300">
      <div className="font-semibold">{title}</div>
      <p className="mt-1">{message}</p>
      {retry && (
        <button
          onClick={retry}
          className="mt-3 inline-flex items-center gap-1 rounded-md bg-rose-600 text-white px-3 py-1 text-xs font-medium hover:bg-rose-700 dark:bg-rose-500 dark:hover:bg-rose-600"
        >
          ↻ Retry
        </button>
      )}
    </div>
  );
}
