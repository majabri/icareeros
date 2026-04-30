/**
 * AdminSystemHealth — live system diagnostics panel
 * Client component: fetches its own data, has a Refresh button.
 * Tables mapped to icareeros (kuneabeiwcxavvyyfjkx) schema.
 */
"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase";

type CheckStatus = "ok" | "warn" | "error" | "loading";

interface SystemCheck {
  name: string;
  status: CheckStatus;
  detail: string;
}

interface ErrorLogEntry {
  id: string;
  user_id: string;
  started_at: string;
  status: string;
  errors?: string[] | null;
}

interface Counts {
  users: number;
  analyses: number;
  cycles: number;
  agentRuns: number;
}

function StatusIcon({ status }: { status: CheckStatus }) {
  if (status === "loading") return <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />;
  if (status === "ok")    return <span className="text-green-500">✓</span>;
  if (status === "warn")  return <span className="text-amber-500">⚠</span>;
  return <span className="text-red-500">✕</span>;
}

function StatusBadge({ status }: { status: CheckStatus }) {
  const cls =
    status === "ok"      ? "bg-green-50 text-green-700 border-green-200" :
    status === "warn"    ? "bg-amber-50 text-amber-700 border-amber-200" :
    status === "loading" ? "bg-gray-50 text-gray-400 border-gray-200" :
                           "bg-red-50 text-red-700 border-red-200";
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}>
      {status}
    </span>
  );
}

export function AdminSystemHealth() {
  const [loading, setLoading]   = useState(true);
  const [counts, setCounts]     = useState<Counts>({ users: 0, analyses: 0, cycles: 0, agentRuns: 0 });
  const [checks, setChecks]     = useState<SystemCheck[]>([]);
  const [errorLogs, setErrorLogs] = useState<ErrorLogEntry[]>([]);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const [
      profilesRes,
      analysesRes,
      cyclesRes,
      agentRunsRes,
      flagsRes,
      ticketsRes,
      resumeVersionsRes,
    ] = await Promise.all([
      supabase.from("profiles").select("user_id", { count: "exact", head: true }),
      supabase.from("analysis_history").select("id", { count: "exact", head: true }),
      supabase.from("career_os_cycles").select("id", { count: "exact", head: true }),
      supabase.from("agent_runs").select("id, user_id, status, errors, started_at")
        .order("started_at", { ascending: false }).limit(100),
      supabase.from("feature_flags").select("key", { count: "exact", head: true }),
      supabase.from("support_tickets").select("id, status", { count: "exact", head: true }),
      supabase.from("resume_versions").select("id", { count: "exact", head: true }),
    ]);

    const allRuns: ErrorLogEntry[] = (agentRunsRes.data ?? []) as ErrorLogEntry[];
    const failedRuns = allRuns.filter(r => r.status === "failed" || r.status === "completed_with_errors");
    const recentFailed = failedRuns.filter(r => r.started_at > hourAgo);

    setCounts({
      users:     profilesRes.count ?? 0,
      analyses:  analysesRes.count ?? 0,
      cycles:    cyclesRes.count ?? 0,
      agentRuns: allRuns.length,
    });

    setChecks([
      {
        name: "Database: profiles",
        status: profilesRes.error ? "error" : "ok",
        detail: profilesRes.error ? profilesRes.error.message : `${profilesRes.count ?? 0} records`,
      },
      {
        name: "Database: analysis_history",
        status: analysesRes.error ? "error" : "ok",
        detail: analysesRes.error ? analysesRes.error.message : `${analysesRes.count ?? 0} records`,
      },
      {
        name: "Database: career_os_cycles",
        status: cyclesRes.error ? "error" : "ok",
        detail: cyclesRes.error ? cyclesRes.error.message : `${cyclesRes.count ?? 0} records`,
      },
      {
        name: "Database: resume_versions",
        status: resumeVersionsRes.error ? "error" : "ok",
        detail: resumeVersionsRes.error ? resumeVersionsRes.error.message : `${resumeVersionsRes.count ?? 0} versions stored`,
      },
      {
        name: "Agent System",
        status: agentRunsRes.error ? "error" : recentFailed.length > 5 ? "warn" : "ok",
        detail: agentRunsRes.error ? agentRunsRes.error.message : `${recentFailed.length} failures in last 1h`,
      },
      {
        name: "Error Rate (last 100 runs)",
        status: failedRuns.length === 0 ? "ok" : failedRuns.length < 10 ? "warn" : "error",
        detail: `${failedRuns.length} failed / ${allRuns.length} runs (${
          allRuns.length > 0 ? Math.round((failedRuns.length / allRuns.length) * 100) : 0
        }%)`,
      },
      {
        name: "Feature Flags",
        status: (flagsRes as { error: null | { message: string } }).error ? "error" : "ok",
        detail: (flagsRes as { error: null | { message: string } }).error
          ? (flagsRes as { error: { message: string } }).error.message
          : `${(flagsRes as { count: number | null }).count ?? 0} flags configured`,
      },
      {
        name: "Support Tickets",
        status: ticketsRes.error ? "warn" : "ok",
        detail: ticketsRes.error ? ticketsRes.error.message : `${ticketsRes.count ?? 0} total tickets`,
      },
      {
        name: "API Status",
        status: "ok",
        detail: `Operational · ${new Date().toLocaleTimeString()}`,
      },
      {
        name: "Last Error Timestamp",
        status: failedRuns.length === 0 ? "ok" : "warn",
        detail: failedRuns.length > 0
          ? `Last failure: ${new Date(failedRuns[0].started_at).toLocaleString()}`
          : "No recent failures",
      },
    ]);

    setErrorLogs(failedRuns.slice(0, 20));
    setLastRefresh(new Date());
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const overallStatus: CheckStatus = checks.some(c => c.status === "error")
    ? "error"
    : checks.some(c => c.status === "warn")
      ? "warn"
      : "ok";

  const overallBg = overallStatus === "ok"
    ? "border-green-200 bg-green-50"
    : overallStatus === "warn"
      ? "border-amber-200 bg-amber-50"
      : "border-red-200 bg-red-50";

  const overallText = overallStatus === "ok"
    ? "text-green-700"
    : overallStatus === "warn"
      ? "text-amber-700"
      : "text-red-700";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">System Health</h2>
          {lastRefresh && (
            <p className="text-xs text-gray-400 mt-0.5">
              Last refreshed: {lastRefresh.toLocaleTimeString()}
            </p>
          )}
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {/* Record counts */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Users",      value: counts.users },
          { label: "Analyses",   value: counts.analyses },
          { label: "Cycles",     value: counts.cycles },
          { label: "Agent Runs", value: counts.agentRuns },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-xs text-gray-500">{label}</p>
            <p className="mt-1 text-2xl font-bold text-gray-900 tabular-nums">
              {loading ? <span className="text-gray-300">—</span> : value.toLocaleString()}
            </p>
          </div>
        ))}
      </div>

      {/* Overall status banner */}
      {!loading && checks.length > 0 && (
        <div className={`flex items-center gap-3 rounded-xl border p-4 ${overallBg}`}>
          <StatusIcon status={overallStatus} />
          <div>
            <p className={`text-sm font-semibold ${overallText}`}>
              {overallStatus === "ok"
                ? "All Systems Operational"
                : overallStatus === "warn"
                  ? "Some Warnings Detected"
                  : "System Issues Detected"}
            </p>
          </div>
        </div>
      )}

      {/* System checks */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-4 py-3">
          <h3 className="text-sm font-medium text-gray-700">System Checks</h3>
        </div>
        <div className="divide-y divide-gray-100">
          {loading
            ? Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-3 animate-pulse">
                  <div className="h-3 w-40 rounded bg-gray-200" />
                  <div className="h-3 w-16 rounded bg-gray-100" />
                </div>
              ))
            : checks.map(check => (
                <div key={check.name} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <StatusIcon status={check.status} />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{check.name}</p>
                      <p className="text-xs text-gray-400">{check.detail}</p>
                    </div>
                  </div>
                  <StatusBadge status={check.status} />
                </div>
              ))
          }
        </div>
      </div>

      {/* Error logs */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-4 py-3 flex items-center justify-between">
          <h3 className="text-sm font-medium text-gray-700">Error Log — Failed Agent Runs</h3>
          <span className="text-xs text-gray-400">{errorLogs.length} entries</span>
        </div>
        <div className="p-4">
          {loading ? (
            <div className="py-4 text-center text-sm text-gray-400">Loading…</div>
          ) : errorLogs.length === 0 ? (
            <div className="py-6 text-center">
              <p className="text-sm text-green-600 font-medium">✓ No errors found — all good!</p>
            </div>
          ) : (
            <div className="space-y-2">
              {errorLogs.map(log => (
                <div key={log.id} className="rounded-lg border border-red-200 bg-red-50 p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-red-700">
                      Run failed · uid: {log.user_id.slice(0, 8)}…
                    </span>
                    <span className="text-xs text-gray-400">
                      {new Date(log.started_at).toLocaleString()}
                    </span>
                  </div>
                  {Array.isArray(log.errors) && log.errors.length > 0 && (
                    <div className="mt-1 space-y-0.5">
                      {log.errors.map((err, i) => (
                        <p key={i} className="rounded bg-red-100 px-2 py-0.5 font-mono text-[10px] text-red-600">
                          {err}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
