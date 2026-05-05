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
  const [loading,        setLoading]        = useState(false);
  const [error,          setError]          = useState<string | null>(null);

  // ── Fit scoring ────────────────────────────────────────────────────────
  const [fitScores,  setFitScores]  = useState<Record<string, FitScore>>({});
  const [scoringFit, setScoringFit] = useState(false);
  const [cycleId,    setCycleId]    = useState<string | null>(null);

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

    try {
      const body = m === "auto"
        ? { mode: "auto" as const }
        : {
            mode:    "manual" as const,
            what:    manualFilters.what,
            where:   manualFilters.where,
            remote:  manualFilters.remote,
            jobType: manualFilters.jobType || undefined,
          };

      const res = await fetch("/api/jobs/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Search failed (${res.status})`);

      const opps: OpportunityResult[] = Array.isArray(data.opportunities) ? data.opportunities : [];
      setResults(opps);
      setTotal(typeof data.total === "number" ? data.total : opps.length);
      setDerivedFrom(data.derivedFrom ?? null);
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
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 space-y-6">
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
          <a href="/mycareer/preferences" className="ml-auto text-xs text-gray-400 hover:text-gray-600">Tune your preferences</a>
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
          </div>
          <div className="space-y-3">
            {decoratedResults.map((opp, i) => (
              <OpportunityCard key={opp.id ?? `${opp.url}-${i}`} opportunity={opp} cycleId={cycleId} />
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
    </div>
  );
}
