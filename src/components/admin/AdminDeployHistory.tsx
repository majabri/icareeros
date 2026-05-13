"use client";

/**
 * Sprint 2 W2-D — Deploy history panel for /admin/system
 *
 * Reads from /api/admin/deployment-history (server-side, service-role).
 * This route handles the admin gate + bypasses RLS so the client-side
 * read no longer depends on the deployment_history RLS policy matching
 * the signed-in user.
 *
 * Rewrite 2026-05-13 — see UAT-SPRINT2-REPORT.md B1.
 */

import { useEffect, useState } from "react";

interface DeploymentRow {
  id: string;
  vercel_deployment_id: string;
  vercel_url: string;
  environment: string;
  branch: string | null;
  commit_sha: string;
  commit_message: string | null;
  state: string;
  created_at: string;
  ready_at: string | null;
  gate_decision: string | null;
  gate_rationale: string | null;
}

function stateBadge(state: string): { label: string; cls: string } {
  switch (state) {
    case "READY":    return { label: "READY",    cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" };
    case "BUILDING": return { label: "BUILDING", cls: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300" };
    case "ERROR":    return { label: "ERROR",    cls: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300" };
    case "CANCELED": return { label: "CANCELED", cls: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300" };
    default:         return { label: state,      cls: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300" };
  }
}

function gateBadge(decision: string | null): { label: string; cls: string } | null {
  if (!decision) return null;
  switch (decision) {
    case "pass":    return { label: "✓ pass",    cls: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" };
    case "fail":    return { label: "✗ fail",    cls: "bg-rose-50 text-rose-700 ring-1 ring-rose-200" };
    case "pending": return { label: "… pending", cls: "bg-amber-50 text-amber-700 ring-1 ring-amber-200" };
    default:        return { label: decision,    cls: "bg-gray-50 text-gray-700 ring-1 ring-gray-200" };
  }
}

export function AdminDeployHistory() {
  const [rows, setRows]       = useState<DeploymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/admin/deployment-history", { cache: "no-store" });
        if (cancelled) return;
        if (!res.ok) {
          const body = await res.json().catch(() => ({} as { error?: string }));
          setError(body.error ?? `HTTP ${res.status}`);
          return;
        }
        const body = await res.json() as { deployments: DeploymentRow[] };
        setRows(body.deployments ?? []);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="h-4 w-48 animate-pulse rounded bg-gray-200" />
        <div className="mt-3 h-3 w-72 animate-pulse rounded bg-gray-100" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
        Failed to load deployment history: {error}
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white shadow-sm">
      <header className="flex items-center justify-between px-6 py-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Deploy history</h2>
          <p className="mt-0.5 text-xs text-gray-500">Last 20 Vercel deployments · ADR-005 Phase 2</p>
        </div>
        <span className="text-xs text-gray-400">{rows.length} row{rows.length === 1 ? "" : "s"}</span>
      </header>

      {rows.length === 0 ? (
        <div className="border-t border-gray-100 px-6 py-12 text-center text-sm text-gray-500">
          No deployments recorded yet. The first one will land via the Vercel webhook.
        </div>
      ) : (
        <div className="overflow-x-auto border-t border-gray-100">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-6 py-3 font-medium">State</th>
                <th className="px-6 py-3 font-medium">Commit</th>
                <th className="px-6 py-3 font-medium">Gate</th>
                <th className="px-6 py-3 font-medium">When</th>
                <th className="px-6 py-3 font-medium">Branch</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(r => {
                const s = stateBadge(r.state);
                const g = gateBadge(r.gate_decision);
                return (
                  <tr key={r.id} className="hover:bg-gray-50/50">
                    <td className="px-6 py-3">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${s.cls}`}>{s.label}</span>
                    </td>
                    <td className="px-6 py-3">
                      <div className="font-mono text-xs text-gray-700">{r.commit_sha.slice(0, 7)}</div>
                      {r.commit_message && (
                        <div className="mt-0.5 line-clamp-1 max-w-md text-xs text-gray-500">{r.commit_message}</div>
                      )}
                    </td>
                    <td className="px-6 py-3">
                      {g ? (
                        <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-medium ${g.cls}`}>{g.label}</span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                      {r.gate_rationale && (
                        <div className="mt-0.5 line-clamp-1 max-w-xs text-xs text-gray-500">{r.gate_rationale}</div>
                      )}
                    </td>
                    <td className="px-6 py-3 text-xs text-gray-500">
                      {new Date(r.created_at).toLocaleString()}
                    </td>
                    <td className="px-6 py-3">
                      <code className="rounded bg-gray-50 px-1.5 py-0.5 text-xs text-gray-600">{r.branch ?? "—"}</code>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
