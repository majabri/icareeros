"use client";

import { useState, useCallback, useEffect } from "react";
import { createClient } from "@/lib/supabase";
import { OpportunityCard } from "@/components/jobs/OpportunityCard";
import type { OpportunityResult } from "@/services/opportunityTypes";
import { scoreFitBatch, type FitScore } from "@/services/ai/fitScoreService";
import { enrichSalaries, type SalaryRange } from "@/services/ai/salaryIntelligenceService";
import { getActiveCycle } from "@/orchestrator/careerOsOrchestrator";

const PAGE_SIZE = 30;
const JOB_TYPES = ["Full-time", "Part-time", "Contract", "Internship", "Freelance"];

interface Filters {
  query: string;
  remote: boolean;
  jobType: string;
}

const DEFAULTS: Filters = { query: "", remote: false, jobType: "" };

export default function JobsPage() {
  const [filters,    setFilters]    = useState<Filters>(DEFAULTS);
  const [draft,      setDraft]      = useState<Filters>(DEFAULTS);
  const [results,    setResults]    = useState<OpportunityResult[]>([]);
  const [total,      setTotal]      = useState(0);
  const [offset,     setOffset]     = useState(0);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [searched,   setSearched]   = useState(false);
  // Fit score state — populated non-blocking after search
  const [fitScores,  setFitScores]  = useState<Record<string, FitScore>>({});
  const [scoringFit, setScoringFit] = useState(false);
  const [salaryRanges, setSalaryRanges] = useState<Record<string, SalaryRange>>({});
  const [enrichingSalary, setEnrichingSalary] = useState(false);
  const [cycleId,    setCycleId]    = useState<string | null>(null);

  // Load active cycle ID once on mount (needed for evaluate-stage enrichment)
  useEffect(() => {
    (async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const cycle = await getActiveCycle(user.id);
        if (cycle) setCycleId(cycle.id);
      } catch {
        // non-critical — fit scoring still works via user_profiles fallback
      }
    })();
  }, []);

  /** Fire background fit scoring for a page of results (non-blocking) */
  const runFitScoring = useCallback(async (opps: OpportunityResult[], cId: string | null) => {
    const ids = opps.map((o) => o.id).filter((id): id is string => !!id);
    if (ids.length === 0) return;

    setScoringFit(true);
    try {
      const result = await scoreFitBatch(ids, cId ?? undefined);
      setFitScores((prev) => ({ ...prev, ...result.scores }));
    } catch {
      // Scoring is non-critical — silently ignore errors
    } finally {
      setScoringFit(false);
    }
  }, []);

  /** Enrich salary ranges for null-salary opportunities (non-blocking) */
  const runSalaryEnrichment = useCallback(async (opps: OpportunityResult[]) => {
    const ids = opps
      .filter((o) => o.id && o.salary_min == null && o.salary_max == null && !o.salary)
      .map((o) => o.id as string);
    if (ids.length === 0) return;

    setEnrichingSalary(true);
    try {
      const result = await enrichSalaries(ids);
      setSalaryRanges((prev) => ({ ...prev, ...result.ranges }));
    } catch {
      // Enrichment is non-critical — silently ignore errors
    } finally {
      setEnrichingSalary(false);
    }
  }, []);

  const search = useCallback(async (f: Filters, off: number) => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      let q = supabase
        .from("opportunities")
        .select(
          "id,title,company,location,job_type,is_remote,salary_min,salary_max,salary_currency,source,quality_score,first_seen_at,description,url,is_flagged,flag_reasons",
          { count: "exact" }
        )
        .eq("is_active", true)
        .order("quality_score", { ascending: false, nullsFirst: false })
        .order("first_seen_at", { ascending: false })
        .range(off, off + PAGE_SIZE - 1);

      if (f.query.trim()) {
        q = q.or(`title.ilike.%${f.query.trim()}%,company.ilike.%${f.query.trim()}%`);
      }
      if (f.remote)  q = q.eq("is_remote", true);
      if (f.jobType) q = q.ilike("job_type", `%${f.jobType}%`);

      const { data, error: qErr, count } = await q;
      if (qErr) throw new Error(qErr.message);

      type Row = {
        id: string; title: string; company: string; location: string;
        job_type: string; is_remote: boolean; salary_min: number | null;
        salary_max: number | null; salary_currency: string | null;
        source: string; quality_score: number | null; first_seen_at: string;
        description: string; url: string; is_flagged: boolean;
        flag_reasons: string[] | null;
      };

      const mapped: OpportunityResult[] = (data as Row[] ?? []).map((row) => ({
        id:            row.id,
        title:         row.title,
        company:       row.company,
        location:      row.location,
        type:          row.job_type ?? "",
        is_remote:     row.is_remote,
        salary:        undefined,
        source:        row.source,
        quality_score: row.quality_score ?? undefined,
        first_seen_at: row.first_seen_at,
        description:   row.description,
        url:           row.url,
        is_flagged:    row.is_flagged,
        flag_reasons:  row.flag_reasons ?? undefined,
        matchReason:   "",
        ...(row.salary_min != null ? { salary_min: row.salary_min } : {}),
        ...(row.salary_max != null ? { salary_max: row.salary_max } : {}),
      }));

      if (off === 0) {
        setResults(mapped);
        // Clear stale scores when starting a new search
        setFitScores({});
        setSalaryRanges({});
      } else {
        setResults((prev) => [...prev, ...mapped]);
      }

      setTotal(count ?? 0);
      setSearched(true);

      // Fire background fit scoring — don't await (non-blocking)
      void runFitScoring(mapped, cycleId);
      // Fire background salary enrichment for null-salary jobs — don't await (non-blocking)
      void runSalaryEnrichment(mapped);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed — please try again.");
    } finally {
      setLoading(false);
    }
  }, [cycleId, runFitScoring, runSalaryEnrichment]);

  useEffect(() => { search(DEFAULTS, 0); }, [search]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setOffset(0);
    setFilters(draft);
    search(draft, 0);
  }

  function handleLoadMore() {
    const next = offset + PAGE_SIZE;
    setOffset(next);
    search(filters, next);
  }

  function handleReset() {
    setDraft(DEFAULTS);
    setFilters(DEFAULTS);
    setOffset(0);
    search(DEFAULTS, 0);
  }

  /** Merge live fit scores into an opportunity result */
  function withFitScore(opp: OpportunityResult): OpportunityResult {
    if (!opp.id) return opp;
    const fs = fitScores[opp.id];
    if (!fs) return opp;
    return {
      ...opp,
      fit_score:     fs.fit_score,
      match_summary: fs.match_summary,
      strengths:     fs.strengths,
      skill_gaps:    fs.skill_gaps,
    };
  }

  /** Merge AI-estimated salary ranges into an opportunity result */
  function withSalary(opp: OpportunityResult): OpportunityResult {
    if (!opp.id) return opp;
    const range = salaryRanges[opp.id];
    // Only enrich when the DB has no salary data
    if (!range || opp.salary || opp.salary_min != null || opp.salary_max != null) return opp;
    return { ...opp, salary: range.label };
  }

  const loadingFirst = loading && offset === 0;
  const loadingMore  = loading && offset > 0;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">

        {/* Page header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Find Opportunities</h1>
          <p className="mt-1 text-sm text-gray-500">
            Search curated job listings matched to your career profile.
          </p>
        </div>

        {/* Search form */}
        <form
          onSubmit={handleSubmit}
          className="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
        >
          <div className="flex gap-2">
            <input
              type="text"
              value={draft.query}
              onChange={(e) => setDraft((d) => ({ ...d, query: e.target.value }))}
              placeholder="Search job titles or companies…"
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2.5 text-sm
                         text-gray-900 placeholder-gray-400 shadow-sm
                         focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={loadingFirst}
              className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white
                         shadow-sm hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {loadingFirst ? "Searching…" : "Search"}
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <select
              value={draft.jobType}
              onChange={(e) => setDraft((d) => ({ ...d, jobType: e.target.value }))}
              className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm
                         text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
            >
              <option value="">All types</option>
              {JOB_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>

            <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700 select-none">
              <input
                type="checkbox"
                checked={draft.remote}
                onChange={(e) => setDraft((d) => ({ ...d, remote: e.target.checked }))}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              Remote only
            </label>

            <button
              type="button"
              onClick={handleReset}
              className="ml-auto text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              Reset filters
            </button>
          </div>
        </form>

        {/* Error */}
        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Result count + scoring indicator */}
        {searched && !loadingFirst && (
          <div className="mb-4 flex items-center gap-3">
            <p className="text-sm text-gray-500">
              {total === 0
                ? "No opportunities found — try different keywords or remove filters."
                : `Showing ${results.length} of ${total.toLocaleString()} opportunit${total === 1 ? "y" : "ies"}`}
            </p>
            {scoringFit && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-0.5
                               text-xs font-medium text-blue-600">
                <span className="h-1.5 w-1.5 animate-ping rounded-full bg-blue-400" />
                Scoring fit…
              </span>
            )}
            {enrichingSalary && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-0.5
                               text-xs font-medium text-green-600">
                <span className="h-1.5 w-1.5 animate-ping rounded-full bg-green-400" />
                Enriching salaries…
              </span>
            )}
          </div>
        )}

        {/* Loading skeleton */}
        {loadingFirst && (
          <div className="space-y-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-40 animate-pulse rounded-xl bg-gray-100" />
            ))}
          </div>
        )}

        {/* Results */}
        {!loadingFirst && (
          <>
            {results.length > 0 && (
              <div className="grid gap-4 sm:grid-cols-2">
                {results.map((opp) => (
                  <OpportunityCard
                    key={opp.id ?? `${opp.company}::${opp.title}`}
                    opportunity={withFitScore(withSalary(opp))}
                    cycleId={cycleId}
                  />
                ))}
              </div>
            )}

            {/* Empty state */}
            {searched && results.length === 0 && (
              <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-white p-12 text-center">
                <div className="text-4xl">🔍</div>
                <h3 className="mt-4 text-lg font-semibold text-gray-900">No opportunities found</h3>
                <p className="mt-2 text-sm text-gray-500">
                  Try a broader search or remove filters.
                </p>
                <button
                  onClick={handleReset}
                  className="mt-6 rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold
                             text-white hover:bg-blue-700 transition-colors"
                >
                  Clear filters
                </button>
              </div>
            )}

            {/* Load more */}
            {results.length < total && !loadingMore && (
              <div className="mt-6 text-center">
                <button
                  onClick={handleLoadMore}
                  className="rounded-lg border border-gray-300 bg-white px-6 py-2.5 text-sm
                             font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors"
                >
                  Load more ({total - results.length} remaining)
                </button>
              </div>
            )}

            {loadingMore && (
              <p className="mt-6 text-center text-sm text-gray-400">Loading more…</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
