"use client";

import { useState, useTransition } from "react";

interface Flag {
  key: string;
  enabled: boolean;
  updated_at: string;
}

const FLAG_LABELS: Record<string, { label: string; description: string }> = {
  monetization_enabled: {
    label: "Billing / Monetization",
    description:
      "Show pricing UI, enforce plan limits, and gate premium features. Turn off for testing.",
  },
};

function defaultLabel(key: string) {
  return {
    label: key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    description: "",
  };
}

export function FeatureFlagToggle({ initial }: { initial: Flag[] }) {
  const [flags, setFlags] = useState<Flag[]>(initial);
  const [isPending, startTransition] = useTransition();
  const [togglingKey, setTogglingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(key: string, current: boolean) {
    setError(null);
    setTogglingKey(key);
    startTransition(async () => {
      try {
        const res = await fetch("/api/admin/feature-flags", {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key, enabled: !current }),
        });
        const json = (await res.json()) as { flag?: Flag; error?: string };
        if (!res.ok) throw new Error(json.error ?? "Toggle failed");
        setFlags((prev) =>
          prev.map((f) => (f.key === key ? (json.flag as Flag) : f))
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setTogglingKey(null);
      }
    });
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {flags.length === 0 && (
        <p className="text-sm text-gray-500">No feature flags found.</p>
      )}

      {flags.map((flag) => {
        const meta = FLAG_LABELS[flag.key] ?? defaultLabel(flag.key);
        const isToggling = togglingKey === flag.key && isPending;

        return (
          <div
            key={flag.key}
            className="flex items-start justify-between gap-6 rounded-lg border border-gray-200 bg-white px-5 py-4 shadow-sm"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-900">{meta.label}</span>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                    flag.enabled
                      ? "bg-green-100 text-green-700"
                      : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {flag.enabled ? "ON" : "OFF"}
                </span>
              </div>
              {meta.description && (
                <p className="mt-1 text-sm text-gray-500">{meta.description}</p>
              )}
              <p className="mt-1 font-mono text-xs text-gray-400">
                key: {flag.key} · updated{" "}
                {new Date(flag.updated_at).toLocaleString()}
              </p>
            </div>

            {/* Toggle switch */}
            <button
              type="button"
              role="switch"
              aria-checked={flag.enabled}
              disabled={isToggling}
              onClick={() => toggle(flag.key, flag.enabled)}
              className={`relative inline-flex h-7 w-12 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-wait disabled:opacity-60 ${
                flag.enabled ? "bg-indigo-600" : "bg-gray-200"
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

      <p className="text-xs text-gray-400">
        Changes take effect immediately in Supabase.{" "}
        <strong className="text-gray-500">
          Note:
        </strong>{" "}
        The Vercel env var{" "}
        <code className="rounded bg-gray-100 px-1">
          NEXT_PUBLIC_MONETIZATION_ENABLED
        </code>{" "}
        is baked into the build — update it in Vercel Settings and redeploy when
        you&apos;re ready to go live.
      </p>
    </div>
  );
}
