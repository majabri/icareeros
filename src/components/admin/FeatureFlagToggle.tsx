"use client";

/**
 * Sprint 4 W3-D — Feature flag list with inline toggle, description, last-updater
 * metadata, and a confirmation modal for production flags.
 *
 * Toggle flow:
 *   - non-production flag → immediate PATCH on click
 *   - production flag → opens AdminConfirmDialog with type-to-confirm; only
 *     PATCH after the user types the flag key exactly
 *
 * All toggles audit-log via the server-side route's logAdminAction call.
 */

import { useState, useTransition } from "react";
import AdminConfirmDialog from "@/components/admin/ui/AdminConfirmDialog";

interface Flag {
  key:              string;
  enabled:          boolean;
  description:      string | null;
  value:            number | null;
  updated_at:       string;
  updated_by:       string | null;
  updated_by_email: string | null;
  is_production:    boolean;
}

const FLAG_DOMAIN_PILL: Record<string, { label: string; cls: string }> = {
  // Domain hints rendered as a small pill next to the key
  cron:     { label: "cron",       cls: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300" },
  feature:  { label: "feature",    cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
  support:  { label: "support",    cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  prod:     { label: "production", cls: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300 ring-1 ring-rose-300" },
};

function domainFor(flag: Flag): string | null {
  if (flag.is_production)               return "prod";
  if (flag.key.endsWith("_cron"))       return "cron";
  if (flag.key.startsWith("feature_"))  return "feature";
  if (flag.key.startsWith("support_"))  return "support";
  return null;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000)     return "just now";
  if (ms < 3_600_000)  return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

export function FeatureFlagToggle({ initial }: { initial: Flag[] }) {
  const [flags, setFlags]             = useState<Flag[]>(initial);
  const [isPending, startTransition]  = useTransition();
  const [togglingKey, setTogglingKey] = useState<string | null>(null);
  const [error, setError]             = useState<string | null>(null);
  const [confirming, setConfirming]   = useState<{ key: string; nextState: boolean } | null>(null);

  function requestToggle(flag: Flag) {
    setError(null);
    const nextState = !flag.enabled;
    if (flag.is_production) {
      setConfirming({ key: flag.key, nextState });
    } else {
      doToggle(flag.key, nextState);
    }
  }

  function doToggle(key: string, nextState: boolean) {
    setTogglingKey(key);
    startTransition(async () => {
      try {
        const res = await fetch("/api/admin/feature-flags", {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key, enabled: nextState }),
        });
        const json = (await res.json()) as { flag?: Flag; error?: string };
        if (!res.ok || !json.flag) throw new Error(json.error ?? `HTTP ${res.status}`);
        setFlags(prev => prev.map(f => f.key === key ? json.flag! : f));
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setTogglingKey(null);
        setConfirming(null);
      }
    });
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-md bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700 dark:bg-rose-900/20 dark:border-rose-500/30 dark:text-rose-300">
          {error}
        </div>
      )}

      {flags.length === 0 && (
        <p className="text-sm text-gray-500 dark:text-gray-400">No feature flags found.</p>
      )}

      {flags.map(flag => {
        const isToggling = togglingKey === flag.key && isPending;
        const domain     = domainFor(flag);

        return (
          <div
            key={flag.key}
            className={`flex items-start justify-between gap-6 rounded-xl border bg-white px-5 py-4 shadow-sm transition-shadow hover:shadow-md dark:bg-[var(--surface-card,#162338)] dark:hover:border-gray-500 ${
              flag.is_production
                ? "border-rose-200 dark:border-rose-500/30"
                : "border-gray-200 dark:border-[var(--surface-border,#243653)]"
            }`}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <code className="font-mono text-sm font-semibold text-gray-900 dark:text-gray-100">{flag.key}</code>
                {domain && (
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${FLAG_DOMAIN_PILL[domain].cls}`}>
                    {FLAG_DOMAIN_PILL[domain].label}
                  </span>
                )}
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                  flag.enabled
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                    : "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400"
                }`}>
                  {flag.enabled ? "ON" : "OFF"}
                </span>
                {flag.value != null && (
                  <span className="text-[11px] text-gray-500 dark:text-gray-400">
                    value: <strong className="text-gray-700 dark:text-gray-200">{flag.value}</strong>
                  </span>
                )}
              </div>
              {flag.description && (
                <p className="mt-1.5 text-sm text-gray-600 dark:text-gray-300">{flag.description}</p>
              )}
              <p className="mt-1.5 text-[11px] text-gray-400 dark:text-gray-500">
                updated {timeAgo(flag.updated_at)}
                {flag.updated_by_email && <> by <span className="font-mono text-gray-500 dark:text-gray-400">{flag.updated_by_email}</span></>}
                <span className="mx-1.5 text-gray-300 dark:text-gray-600">·</span>
                <time dateTime={flag.updated_at} title={flag.updated_at}>{new Date(flag.updated_at).toLocaleString()}</time>
              </p>
            </div>

            {/* Toggle switch */}
            <button
              type="button"
              role="switch"
              aria-checked={flag.enabled}
              aria-label={`${flag.enabled ? "Disable" : "Enable"} ${flag.key}`}
              disabled={isToggling || isPending}
              onClick={() => requestToggle(flag)}
              className={`relative inline-flex h-7 w-12 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:cursor-wait disabled:opacity-60 ${
                flag.enabled ? "bg-brand-600" : "bg-gray-200 dark:bg-gray-700"
              }`}
            >
              <span
                className={`inline-block h-6 w-6 transform rounded-full bg-white shadow-md ring-0 transition-transform duration-200 ease-in-out ${
                  flag.enabled ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        );
      })}

      {/* Production-flag confirmation modal */}
      <AdminConfirmDialog
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        onConfirm={() => { if (confirming) doToggle(confirming.key, confirming.nextState); }}
        title={`${confirming?.nextState ? "Enable" : "Disable"} production flag?`}
        description={
          <>
            <p>
              <code className="font-mono font-semibold">{confirming?.key}</code> is marked as a <strong>production</strong> flag — toggling it has user-visible, hard-to-reverse impact.
            </p>
            <p className="mt-2">Type the flag key below to confirm.</p>
          </>
        }
        confirmLabel={confirming?.nextState ? "Enable" : "Disable"}
        destructive={!confirming?.nextState}
        typeToConfirm={confirming?.key}
      />
    </div>
  );
}
