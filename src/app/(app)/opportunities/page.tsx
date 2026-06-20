"use client";

/**
 * /jobs — Opportunities page (Career OS Stage 4: Act)
 *
 * Two modes:
 *   - "auto"   (default): server derives the search from the user's
 *              career_profile + user_profiles preferences (target roles,
 *              location, work mode, salary, job type) and queries Adzuna.
 *   - "manual" (toggle): user provides keyword + filters directly.
 *
 * Both modes hit /api/jobs/search which calls the Adzuna adapter, then
 * the page kicks off non-blocking fit scoring against the active cycle.
 */

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import { OpportunityCard } from "@/components/jobs/OpportunityCard";
import { JobDetailDrawer } from "@/components/jobs/JobDetailDrawer";
import type { OpportunityResult } from "@/services/opportunityTypes";
import { scoreFitBatch, type FitScore } from "@/services/ai/fitScoreService";
import { getActiveCycle } from "@/orchestrator/careerOsOrchestrator";

type Mode = "auto" | "manual";

interface ManualFilters {
  what:    string;
  where:   string;
  remote:  boolean;
  jobType: string;     // "" | "full_time" | "part_time" | "contract" | "permanent"
}

const EMPTY_MANUAL: ManualFilters = { what: "", where: "", remote: false, jobType: "" };

const JOB_TYPE_OPTIONS = [
  { value: "",           label: "Any type"  },
  { value: "full_time",  label: "Full-time" },
  { value: "part_time",  label: "Part-time" },
  { value: "contract",   label: "Contract"  },
  { value: "permanent",  label: "Permanent" },
];

export default function JobsPage() {
  // ── Mode state ─────────────────────────────────────────────────────────
  const [mode,           setMode]           = useState<Mode>("auto");
  const [manual,         setManual]         = useState<ManualFilters>(EMPTY_MANUAL);
  const [hasAutoSearched, setHasAutoSearched] = useState(false);

  // ── Result state ──────────────────────────────────────────────────────
  const [results,        setResults]        = useState<OpportunityResult[]>([]);
  const [total,          setTotal]          = useState(0);
  const [derivedFrom,    setDerivedFrom]    = useState<{ source: "auto" | "manual"; what: string; where: string } | null>(null);
  const [warning,        setWarning]        = useState<string | null>(null);
  // 2026-06-18 — per-source counts from the aggregator. Used by the small
  // "from Adzuna · LinkedIn · Database" line below the results count.
  const [sources,        setSources]        = useState<Record<string, { count: number; fallback?: boolean }>>({});
  // 2026-06-20 — Brief Task 3: quality-gate filtered postings drawer.
  const [filtered,       setFiltered]       = useState<{ count: number; reasons: Array<{ title: string; company: string; reason: string }> }>({ count: 0, reasons: [] });
  const [filteredOpen,   setFilteredOpen]   = useState(false);
  const [loading,        setLoading]        = useState(false);
  const [error,          setError]          = useState<string | null>(null);

  // ── Fit scoring ────────────────────────────────────────────────────────
  const [fitScores,  setFitScores]  = useState<Record<string, FitScore>>({});
  const [scoringFit, setScoringFit] = useState(false);
  const [cycleId,    setCycleId]    = useState<string | null>(null);

  // ── Wave 2: in-platform Job Detail Drawer state ─────────────────────────
  // `selectedJob` is the OpportunityResult currently shown in the drawer,
  // or null when the drawer is closed. URL is kept in sync via `?job=<id>`
  // so the view is shareable + back-button-safe.
  const [selectedJob, setSelectedJob] = useState<OpportunityResult | null>(null);

  // ── Load active cycle (for fit scoring) ───────────────────────────────
  useEffect(() => {
    void (async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const cycle = await getActiveCycle(user.id);
        if (cycle) setCycleId(cycle.id);
      } catch { /* fit scoring still works via user_profiles fallback */ }
    })();
  }, []);

  // ── Search ─────────────────────────────────────────────────────────────
  const runSearch = useCallback(async (m: Mode, manualFilters: ManualFilters) => {
    setLoading(true);
    setError(null);
    setWarning(null);
    setResults([]);
    setFitScores({});
    setSources({});
    setFiltered({ count: 0, reasons: [] });

    try {
      // Auto mode → AI agent (multi-query plan + parallel run + dedupe)
      // Manual mode → direct single-query search
      let res: Response;
      if (m === "auto") {
        res = await fetch("/api/jobs/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
      } else {
        res = await fetch("/api/jobs/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode:    "manual" as const,
            what:    manualFilters.what,
            where:   manualFilters.where,
            remote:  manualFilters.remote,
            jobType: manualFilters.jobType || undefined,
          }),
        });
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Search failed (${res.status})`);

      const opps: OpportunityResult[] = Array.isArray(data.opportunities) ? data.opportunities : [];
      setResults(opps);
      setTotal(typeof data.total === "number" ? data.total : opps.length);
      setDerivedFrom(data.derivedFrom ?? null);
      if (data.sources && typeof data.sources === "object") {
        setSources(data.sources as Record<string, { count: number; fallback?: boolean }>);
      }
      if (data.filtered && typeof data.filtered === "object") {
        setFiltered(data.filtered as { count: number; reasons: Array<{ title: string; company: string; reason: string }> });
      }
      if (data.warning) setWarning(data.warning);

      // Non-blocking fit scoring against active cycle
      if (opps.length > 0) {
        runFitScoring(opps, cycleId);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }, [cycleId]);

  // ── Auto-search on first mount, when mode is 'auto' ───────────────────
  useEffect(() => {
    if (mode === "auto" && !hasAutoSearched) {
      setHasAutoSearched(true);
      void runSearch("auto", EMPTY_MANUAL);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, hasAutoSearched]);

  // ── Fit scoring ────────────────────────────────────────────────────────
  const runFitScoring = useCallback(async (opps: OpportunityResult[], cId: string | null) => {
    const ids = opps.map(o => o.id).filter((id): id is string => !!id && /^[0-9a-f-]{36}$/.test(id));
    if (ids.length === 0) return;
    setScoringFit(true);
    try {
      const result = await scoreFitBatch(ids, cId ?? undefined);
      if (result?.scores) {
        const map: Record<string, FitScore> = {};
        for (const [oppId, fit] of Object.entries(result.scores)) {
          if (fit) map[oppId] = fit;
        }
        setFitScores(map);
      }
    } catch (e) {
      console.warn("[jobs] fit scoring failed:", e instanceof Error ? e.message : e);
    } finally {
      setScoringFit(false);
    }
  }, []);

  // ── URL sync for the drawer (Wave 2) ────────────────────────────────────
  // On mount and whenever results land, look at `?job=<id>` and open the
  // matching opportunity in the drawer. Closing the drawer strips the
  // `job` param without a navigation.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const id = params.get("job");
    if (!id || results.length === 0) return;
    const match = results.find(r => r.id === id);
    if (match) setSelectedJob(match);
  }, [results]);

  function openJob(opp: OpportunityResult) {
    setSelectedJob(opp);
    if (opp.id && typeof window !== "undefined") {
      const u = new URL(window.location.href);
      u.searchParams.set("job", opp.id);
      window.history.pushState({}, "", u.toString());
    }
  }

  function closeJob() {
    setSelectedJob(null);
    if (typeof window !== "undefined") {
      const u = new URL(window.location.href);
      u.searchParams.delete("job");
      window.history.replaceState({}, "", u.toString());
    }
  }

  // Augment results with fit scores (non-mutating)
  const decoratedResults = results.map(r => {
    const fit = r.id ? fitScores[r.id] : null;
    if (!fit) return r;
    return {
      ...r,
      fit_score:     fit.fit_score      ?? r.fit_score,
      match_summary: fit.match_summary  ?? r.match_summary,
      matched_skills: fit.strengths     ?? r.matched_skills,
      skill_gaps:    fit.skill_gaps     ?? r.skill_gaps,
    };
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 space-y-6">
      <header>
        <h1 className="mb-1 text-2xl font-bold text-gray-900">Opportunities</h1>
        <p className="text-sm text-gray-500">
          {mode === "auto"
            ? "Curated for you."
            : "Search by keyword, location, and filters."}
        </p>
      </header>

      {/* Mode toggle */}
      <div className="flex gap-0 rounded-xl border border-gray-200 bg-white p-1 w-fit shadow-sm">
        <button
          type="button"
          onClick={() => setMode("auto")}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors
            ${mode === "auto" ? "bg-brand-600 text-white" : "text-gray-600 hover:bg-gray-50"}`}
        >
          For you
        </button>
        <button
          type="button"
          onClick={() => setMode("manual")}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors
            ${mode === "manual" ? "bg-brand-600 text-white" : "text-gray-600 hover:bg-gray-50"}`}
        >
          Search
        </button>
      </div>

      {/* Manual filters */}
      {mode === "manual" && (
        <form
          onSubmit={(e) => { e.preventDefault(); void runSearch("manual", manual); }}
          className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-3"
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="lg:col-span-2">
              <label className="mb-1 block text-xs font-medium text-gray-600">Keyword</label>
              <input
                type="text"
                value={manual.what}
                onChange={e => setManual({ ...manual, what: e.target.value })}
                placeholder="e.g. accountant, product manager"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Location</label>
              <input
                type="text"
                value={manual.where}
                onChange={e => setManual({ ...manual, where: e.target.value })}
                placeholder="City, State"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Job type</label>
              <select
                value={manual.jobType}
                onChange={e => setManual({ ...manual, jobType: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 bg-white"
              >
                {JOB_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={manual.remote}
                onChange={e => setManual({ ...manual, remote: e.target.checked })}
                className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              />
              Remote-only
            </label>
            <button
              type="submit"
              disabled={loading || !manual.what.trim()}
              className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-50"
            >
              {loading ? "Searching…" : "Search jobs"}
            </button>
          </div>
        </form>
      )}

      {/* Refresh button (auto mode) */}
      {mode === "auto" && !loading && (
        <div className="flex items-center gap-3 text-sm">
          <button
            type="button"
            onClick={() => void runSearch("auto", EMPTY_MANUAL)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            ↻ Refresh
          </button>
          {scoringFit && <span className="text-xs text-gray-500">Ranking results…</span>}
          <a href="/careerprofile/preferences" className="ml-auto text-xs text-gray-400 hover:text-gray-600">Tune your preferences</a>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center text-sm text-gray-500">
          <div className="mx-auto mb-3 h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
          Finding matches…
        </div>
      )}

      {/* Error / warning */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          ⚠ {error}
        </div>
      )}
      {warning && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {warning}
        </div>
      )}

      {/* Results */}
      {!loading && !error && results.length > 0 && (
        <>
          <div className="text-sm text-gray-500">
            <strong className="text-gray-900">{total.toLocaleString()}</strong> job{total === 1 ? "" : "s"} found
            {scoringFit && <span className="ml-2 text-xs">· Ranking…</span>}
            {filtered.count > 0 && (
              <div className="mt-1">
                <button
                  type="button"
                  onClick={() => setFilteredOpen(true)}
                  className="text-xs underline underline-offset-2 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-300 rounded"
                  style={{ color: "#7B9AC0" }}
                >
                  Filtered out {filtered.count} low-quality posting{filtered.count === 1 ? "" : "s"}
                </button>
              </div>
            )}

            {/* 2026-06-18 — per-source indicator. Renders muted slate-blue,
                only sources that actually returned results. Sorted by count
                desc so the heaviest source reads first. */}
            {Object.keys(sources).length > 0 && (() => {
              const labels: Record<string, string> = {
                adzuna:    "Adzuna",
                linkedin:  "LinkedIn",
                indeed:    "Indeed",
                database:  "Database",
                ats:       "ATS Direct",
                hackernews:"Hacker News",
              };
              const active = Object.entries(sources)
                .filter(([, info]) => (info?.count ?? 0) > 0)
                .sort(([, a], [, b]) => (b.count ?? 0) - (a.count ?? 0))
                .map(([k]) => labels[k] ?? k);
              if (active.length === 0) return null;
              return (
                <div
                  className="mt-1 text-[11px]"
                  style={{ color: "#7B9AC0" }}
                  aria-label={`Sources: ${active.join(", ")}`}
                >
                  from {active.join(" · ")}
                  {filtered.count > 0 && (
                    <>
                      {" · "}
                      <button
                        type="button"
                        onClick={() => setFilteredOpen(true)}
                        className="underline underline-offset-2 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-300 rounded"
                        style={{ color: "#7B9AC0" }}
                        aria-label={`Show ${filtered.count} filtered postings and reasons`}
                      >
                        {filtered.count} filtered
                      </button>
                    </>
                  )}
                </div>
              );
            })()}
          </div>
          <div className="space-y-3">
            {decoratedResults.map((opp, i) => (
              <OpportunityCard key={opp.id ?? `${opp.url}-${i}`} opportunity={opp} cycleId={cycleId} onSelect={openJob} />
            ))}
          </div>
        </>
      )}

      {/* Empty state */}
      {!loading && !error && results.length === 0 && hasAutoSearched && !warning && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-12 text-center text-sm text-gray-500">
          No jobs matched. Try the “Search” mode or update your preferences.
        </div>
      )}

      {/* Wave 2 — in-platform Job Detail Drawer. Renders only when
          selectedJob is set; the drawer manages its own scrim. */}
      <JobDetailDrawer job={selectedJob} onClose={closeJob} cycleId={cycleId} />

      {/* Brief Task 3 — quality-gate filtered drawer.
          Opens from the "N filtered" link; shows up to 50 reason rows. */}
      {filteredOpen && (
        <div
          className="fixed inset-0 z-40 flex justify-end"
          aria-modal="true"
          role="dialog"
          aria-label="Filtered postings"
          onClick={() => setFilteredOpen(false)}
        >
          <div className="absolute inset-0 bg-black/30" />
          <div
            className="relative h-full w-full max-w-md overflow-y-auto bg-white shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-gray-200 bg-white px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">
                  {filtered.count} posting{filtered.count === 1 ? "" : "s"} filtered out
                </h2>
                <p className="mt-0.5 text-xs text-gray-500">
                  Removed by the quality gate (stale, thin, or red-flag content). Showing first {Math.min(50, filtered.reasons.length)}.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFilteredOpen(false)}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-300"
                aria-label="Close filtered postings"
              >
                ✕
              </button>
            </div>
            <ul className="divide-y divide-gray-100">
              {filtered.reasons.slice(0, 50).map((r, i) => (
                <li key={`${r.company}-${r.title}-${i}`} className="px-5 py-3">
                  <div className="text-sm font-medium text-gray-900">{r.title || "—"}</div>
                  <div className="text-xs text-gray-500">{r.company || "—"}</div>
                  <div className="mt-1 text-xs" style={{ color: "#FF6B6B" }}>
                    {r.reason}
                  </div>
                </li>
              ))}
              {filtered.reasons.length === 0 && (
                <li className="px-5 py-6 text-center text-xs text-gray-400">
                  No reason details available.
                </li>
              )}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
