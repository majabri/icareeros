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
import { SmartApplyPanel, type SmartApplyJob } from "@/components/opportunities/SmartApplyPanel";
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
  const [sources,        setSources]        = useState<Record<string, { count?: number; fallback?: boolean; total?: number; companies?: number }>>({});
  const [sourcesInfoOpen, setSourcesInfoOpen] = useState(false);
  // feat/jobs-search-db (Task 4) — where did results come from?
  const [searchOrigin, setSearchOrigin] = useState<"database" | "live" | "mixed" | null>(null);
  // feat/jobs-smart-apply — slide-in Smart Apply panel state
  const [smartApplyJob, setSmartApplyJob] = useState<SmartApplyJob | null>(null);
  // fix/jobs-ux-feedback Fix 2 — auto-prefill search query from target_roles
  const [targetRoleQuery, setTargetRoleQuery] = useState<string>("");
  const [editingQuery, setEditingQuery] = useState(false);
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

  // 2026-06-30 (feat/jobs-opportunities-refresh) — "last updated N minutes ago"
  // + manual Refresh button. Auto-search still fires on first mount; the tick
  // effect below re-computes the relative-time label every 30 s so the display
  // stays fresh without a full page render.
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [nowTick,       setNowTick]       = useState<number>(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

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

  // fix/jobs-ux-feedback Fix 2 — pre-fill search query from user's first
  // target_role in career_profiles. Runs once on mount. Falls back to
  // empty query (existing "show all" behaviour) when target_roles is empty.
  useEffect(() => {
    void (async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase
          .from("career_profiles")
          .select("target_roles")
          .eq("user_id", user.id)
          .maybeSingle();
        const roles = (data?.target_roles ?? []) as string[];
        if (roles.length > 0 && roles[0].trim().length > 0) {
          setTargetRoleQuery(roles[0]);
          setManual(prev => ({ ...prev, what: roles[0] }));
        }
      } catch { /* silent — falls back to empty query */ }
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
      // feat/jobs-search-db (Task 4) — try /api/jobs/search-db first in auto
      // mode. The DB is refreshed every 4h and returns in ~500ms (vs the
      // 3-5s the AI agent takes on a fresh cold cache). Fall back to the
      // agent when search-db returns fewer than 5 hits (source==="live"
      // OR empty result).
      let res: Response;
      let dbFirstUsed = false;
      if (m === "auto") {
        const dbRes = await fetch("/api/jobs/search-db", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: "", limit: 50 }),
        }).catch(() => null);
        const dbData = dbRes && dbRes.ok ? await dbRes.clone().json().catch(() => null) : null;
        if (dbRes && dbRes.ok && dbData && Array.isArray(dbData.opportunities) && dbData.opportunities.length >= 5) {
          res = dbRes;
          dbFirstUsed = true;
        } else {
          res = await fetch("/api/jobs/agent", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
          });
        }
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
      setLastUpdatedAt(new Date());
      setNowTick(Date.now());
      setDerivedFrom(data.derivedFrom ?? null);
      if (data.sources && typeof data.sources === "object") {
        // /api/jobs/search-db returns sources as Record<string, number>
        // (per-ATS row count). /api/jobs/agent returns Record<string, {count,fallback}>.
        // Normalise both to the { count?, fallback?, total?, companies? } shape
        // the source-indicator block expects.
        const srcMap = data.sources as Record<string, unknown>;
        const normalised: Record<string, { count?: number; fallback?: boolean; total?: number; companies?: number }> = {};
        for (const [k, v] of Object.entries(srcMap)) {
          if (typeof v === "number")               normalised[k] = { count: v };
          else if (v && typeof v === "object")     normalised[k] = v as { count?: number; fallback?: boolean; total?: number; companies?: number };
        }
        setSources(normalised);
      }
      // feat/jobs-search-db (Task 4) — search-db exposes `source` +
      // `freshestAt` at the top level. Use freshestAt for the "Last updated"
      // widget when the DB path served results so the timestamp reflects
      // the DB's last_seen_at max, not the page-load moment.
      if (typeof data.freshestAt === "string" && data.freshestAt.length > 0) {
        setLastUpdatedAt(new Date(data.freshestAt));
        setNowTick(Date.now());
      }
      // Persist source label so the indicator can render "database + live"
      if (typeof data.source === "string") {
        setSearchOrigin(data.source as "database" | "live" | "mixed");
      } else if (dbFirstUsed) {
        setSearchOrigin("database");
      } else {
        setSearchOrigin("live");
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
        <LastUpdatedRow
          lastUpdatedAt={lastUpdatedAt}
          nowMs={nowTick}
          loading={loading}
          onRefresh={() => void runSearch(mode, manual)}
        />
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
                adzuna:      "Adzuna",
                linkedin:    "LinkedIn",
                indeed:      "Indeed",
                database:    "Database",
                ats:         "ATS Direct",
                hackernews:  "Hacker News",
                curated_ats: "Curated ATS",
              };
              // feat/jobs-ats-aggregation Phase 3 — surface company count
              // from the curated_ats breakdown when present.
              const curated  = sources.curated_ats as { companies?: number; total?: number } | undefined;
              const active = Object.entries(sources)
                .filter(([k, info]) => (info?.count ?? info?.total ?? 0) > 0 && k !== "curated_ats")
                .sort(([, a], [, b]) => ((b.count ?? b.total ?? 0) - (a.count ?? a.total ?? 0)))
                .map(([k]) => labels[k] ?? k);
              if (active.length === 0 && !curated) return null;
              return (
                <div
                  className="mt-1 text-[11px]"
                  style={{ color: "#7B9AC0" }}
                  aria-label={`Sources: ${active.join(", ")}`}
                >
                  {searchOrigin === "database" && <><span className="font-medium text-teal-700">database</span>{" · "}</>}
                  {searchOrigin === "mixed"    && <><span className="font-medium text-teal-700">database + live</span>{" · "}</>}
                  {searchOrigin === "live"     && <><span className="font-medium">live search</span>{" · "}</>}
                  from {active.join(" · ")}
                  {curated && curated.companies ? (
                    <> · <span title={`Fanned out to ${curated.companies} curated companies across 9 ATS platforms`}>ATS Direct ({curated.companies} companies)</span></>
                  ) : null}
                  {" · "}
                  <button
                    type="button"
                    onClick={() => setSourcesInfoOpen(true)}
                    className="underline underline-offset-2 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-300 rounded"
                    style={{ color: "#7B9AC0" }}
                    aria-label="Where do these jobs come from?"
                  >
                    Sources
                  </button>
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
              <OpportunityCard
                key={opp.id ?? `${opp.url}-${i}`}
                opportunity={opp}
                cycleId={cycleId}
                onSelect={openJob}
                onSmartApply={(o) => setSmartApplyJob({
                  title:          o.title,
                  company:        o.company,
                  description:    o.description,
                  url:            o.apply_url_company ?? o.url,
                  opportunity_id: (typeof o.id === "string" ? o.id : null),
                })}
              />
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

      {/* feat/jobs-smart-apply — slide-in Smart Apply panel */}
      {smartApplyJob && <SmartApplyPanel job={smartApplyJob} onClose={() => setSmartApplyJob(null)} cycleId={cycleId} />}

      {/* feat/jobs-ats-aggregation Phase 3 — Sources info popover. Simple
          light-weight modal explaining where opportunities come from. */}
      {sourcesInfoOpen && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center"
          aria-modal="true"
          role="dialog"
          aria-label="Sources info"
          onClick={() => setSourcesInfoOpen(false)}
        >
          <div className="absolute inset-0 bg-black/30" />
          <div
            className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-base font-semibold text-gray-900">Where jobs come from</h2>
              <button
                type="button"
                onClick={() => setSourcesInfoOpen(false)}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-300"
                aria-label="Close sources info"
              >
                ✕
              </button>
            </div>
            <p className="mt-2 text-xs text-gray-500">
              iCareerOS aggregates open positions from multiple sources in real time.
              We prioritise direct-from-ATS listings (the highest-trust source) and
              back off to job-board aggregators for coverage.
            </p>
            <ul className="mt-3 space-y-2 text-xs text-gray-700">
              <li><strong className="text-brand-700">ATS Direct</strong> — Greenhouse, Lever, Ashby, Workday, Workable, Recruitee, SmartRecruiters, Breezy, Pinpoint. Canonical apply URL, weighted 1.0.</li>
              <li><strong>Adzuna</strong> — global job-board aggregator; weighted 0.8.</li>
              <li><strong>LinkedIn / Indeed</strong> — supplementary; weighted 0.9 / 0.8.</li>
              <li><strong>Hacker News</strong> — the monthly "Who is hiring?" thread; weighted 0.9.</li>
              <li><strong>Database</strong> — iCareerOS-curated internal listings; weighted 0.75.</li>
            </ul>
            <p className="mt-3 text-[11px] text-gray-400">
              Listings that fail our quality gate (thin descriptions, expired postings, red-flag phrases) are filtered out — click the "N filtered" link on the results list to review.
            </p>
          </div>
        </div>
      )}

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

// ── 2026-06-30 (feat/jobs-opportunities-refresh) — Last-updated row ─────
//
// Small header row: relative timestamp on the left, Refresh button on the
// right. Staleness rules:
//   • < 1h  → muted slate blue (#7B9AC0), plain "Last updated 4 minutes ago"
//   • 1-24h → amber, appends "results may be outdated"
//   • 24h+  → coral, appends "click Refresh to update"
//
// The parent's 30 s tick drives re-renders so "4 minutes ago" ticks to
// "5 minutes ago" without a full data reload.

interface LastUpdatedRowProps {
  lastUpdatedAt: Date | null;
  nowMs:         number;  // ticks every 30 s from parent
  loading:       boolean;
  onRefresh:     () => void;
}

function LastUpdatedRow({ lastUpdatedAt, nowMs, loading, onRefresh }: LastUpdatedRowProps) {
  // Suppress the widget entirely until the first successful search lands.
  if (!lastUpdatedAt) return null;

  const ageMs = Math.max(0, nowMs - lastUpdatedAt.getTime());
  const label = formatRelativeAge(ageMs);

  // Color + suffix based on staleness buckets.
  const hourMs = 60 * 60 * 1000;
  let color = "#7B9AC0";
  let suffix = "";
  let refreshColor = "#7B9AC0";
  if (ageMs >= 24 * hourMs) {
    color = "#FF6B6B"; // coral
    refreshColor = "#FF6B6B";
    suffix = " — click Refresh to update";
  } else if (ageMs >= hourMs) {
    color = "#B45309"; // amber-700
    refreshColor = "#B45309";
    suffix = " — results may be outdated";
  }

  return (
    <div className="mt-1 flex items-center justify-between gap-3" data-testid="opps-last-updated-row">
      <span className="text-xs" style={{ color }} aria-live="polite">
        Last updated {label}{suffix}
      </span>
      <button
        type="button"
        onClick={onRefresh}
        disabled={loading}
        className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ color: refreshColor, borderColor: loading ? undefined : refreshColor + "33" }}
        aria-label="Refresh opportunities"
        data-testid="opps-refresh-btn"
      >
        <span aria-hidden>{loading ? "↻" : "↻"}</span>
        {loading ? "Refreshing…" : "Refresh"}
      </button>
    </div>
  );
}

/**
 * Format a millisecond age into the copy expected by the brief:
 *   < 1 min                    → "just now"
 *   1-59 min                   → "X minutes ago"
 *   1-23 h                     → "X hours ago"
 *   24-47 h                    → "yesterday"
 *   48h+                       → "X days ago"
 * Exported for potential future testing, otherwise module-local.
 */
function formatRelativeAge(ageMs: number): string {
  const minMs = 60 * 1000;
  const hourMs = 60 * minMs;
  const dayMs = 24 * hourMs;
  if (ageMs < minMs) return "just now";
  if (ageMs < hourMs) {
    const m = Math.floor(ageMs / minMs);
    return `${m} minute${m === 1 ? "" : "s"} ago`;
  }
  if (ageMs < dayMs) {
    const h = Math.floor(ageMs / hourMs);
    return `${h} hour${h === 1 ? "" : "s"} ago`;
  }
  const days = Math.floor(ageMs / dayMs);
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}
