/**
 * /fit-check — Fit Check (Evaluate stage)
 *
 * Lightweight UI surface over POST /api/resume/fit-check.
 * Mirrors the Resume Advisor flow but stripped to one job:
 *  - pick a saved resume (or paste one)
 *  - paste a job description
 *  - get fit score + strengths + missing skills + recommendations
 *
 * Stage accent: STAGE_COLORS.evaluate (#00B8A9).
 *
 * Out of scope (v1): per-category breakdown bars, JD URL/file import,
 *   "save to opportunities" / rewrite / cover-letter actions — those
 *   live on /resumeadvisor.
 */
"use client";

import { useState, useEffect, useCallback } from "react";
import {
  listResumeVersions,
  type ResumeVersion,
} from "@/services/ai/resumeService";
import { STAGE_COLORS } from "@/lib/career-os/stage-colors";

interface FitCheckResult {
  fitScore: number;
  summary: string;
  strengths: string[];
  gaps: string[];
  missingSkills: string[];
  recommendations: string[];
}

const STAGE_HEX = STAGE_COLORS.evaluate; // teal — #00B8A9
const CORAL_HEX = STAGE_COLORS.advise;   // coral — #FF6B6B
const GOLD_HEX  = STAGE_COLORS.learn;    // gold  — #F5A623
const GREEN_HEX = STAGE_COLORS.act;      // green — #10B981

// ── Score Ring ────────────────────────────────────────────────────────────────
function ScoreRing({ score }: { score: number }) {
  // > 70 green · 50–70 gold · < 50 coral (per brief)
  const color = score > 70 ? GREEN_HEX : score >= 50 ? GOLD_HEX : CORAL_HEX;
  const label = score > 70 ? "Strong fit" : score >= 50 ? "Moderate fit" : "Weak fit";

  // SVG ring — circumference = 2πr; r=54 → C≈339.29
  const r = 54;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.max(0, Math.min(100, score)) / 100) * c;

  return (
    <div className="flex flex-col items-center justify-center" aria-label={`Fit score ${score} out of 100 — ${label}`}>
      <div className="relative" style={{ width: 140, height: 140 }}>
        <svg width={140} height={140} viewBox="0 0 140 140" aria-hidden="true">
          <circle cx={70} cy={70} r={r} fill="none" stroke="#F3F4F6" strokeWidth={10} />
          <circle
            cx={70} cy={70} r={r} fill="none"
            stroke={color} strokeWidth={10} strokeLinecap="round"
            strokeDasharray={c} strokeDashoffset={offset}
            transform="rotate(-90 70 70)"
            style={{ transition: "stroke-dashoffset 600ms ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-4xl font-black tabular-nums" style={{ color }}>{score}</span>
          <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">/100</span>
        </div>
      </div>
      <span className="mt-2 text-sm font-semibold" style={{ color }}>{label}</span>
    </div>
  );
}

// ── Skeleton (loading state) ──────────────────────────────────────────────────
function ResultsSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Analysing fit">
      <div className="flex items-center justify-center py-6">
        <div className="h-[140px] w-[140px] rounded-full border-[10px] border-gray-100 animate-pulse" />
      </div>
      <p className="text-center text-sm font-medium text-gray-500">Analysing fit…</p>
      <div className="space-y-2">
        <div className="h-3 w-3/4 rounded bg-gray-100 animate-pulse" />
        <div className="h-3 w-full rounded bg-gray-100 animate-pulse" />
        <div className="h-3 w-5/6 rounded bg-gray-100 animate-pulse" />
      </div>
      <div className="grid grid-cols-2 gap-3 pt-2">
        <div className="h-20 rounded-lg bg-gray-100 animate-pulse" />
        <div className="h-20 rounded-lg bg-gray-100 animate-pulse" />
      </div>
    </div>
  );
}

// ── Empty-state right panel ───────────────────────────────────────────────────
function EmptyRightPanel() {
  return (
    <div className="flex h-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 px-6 py-12 text-center">
      <div
        className="mb-3 grid h-12 w-12 place-items-center rounded-full"
        style={{ background: `${STAGE_HEX}1A` }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={STAGE_HEX} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="6" />
          <circle cx="12" cy="12" r="2" />
        </svg>
      </div>
      <h3 className="text-sm font-semibold text-gray-700">Pick a resume and paste a job description</h3>
      <p className="mt-1 max-w-sm text-xs text-gray-500">
        We&apos;ll score how well your resume fits the role and tell you what&apos;s missing.
      </p>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type ResumeSource = "vault" | "paste";
type JdMode = "paste" | "url";

export default function FitCheckPage() {
  const [userLoaded, setUserLoaded]               = useState(false);
  const [versions, setVersions]                   = useState<ResumeVersion[]>([]);
  const [versionsLoaded, setVersionsLoaded]       = useState(false);
  const [resumeSource, setResumeSource]           = useState<ResumeSource>("vault");
  const [selectedVersion, setSelectedVersion]    = useState<ResumeVersion | null>(null);
  const [pastedResume, setPastedResume]           = useState("");
  const [jobDescription, setJobDescription]       = useState("");
  const [jdMode, setJdMode]                       = useState<JdMode>("paste");
  const [jdUrl, setJdUrl]                         = useState("");
  const [jdFetchedFrom, setJdFetchedFrom]         = useState<string | null>(null);
  const [jdFetching, setJdFetching]               = useState(false);
  const [jdFetchError, setJdFetchError]           = useState<string | null>(null);
  const [running, setRunning]                     = useState(false);
  const [error, setError]                         = useState<string | null>(null);
  const [result, setResult]                       = useState<FitCheckResult | null>(null);

  // Load saved resume versions on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const vs = await listResumeVersions();
        if (cancelled) return;
        setVersions(vs);
        if (vs.length > 0) setSelectedVersion(vs[0]);
        else setResumeSource("paste");
      } catch {
        // Auth or network — swallow; the UI will show the empty picker
      } finally {
        if (!cancelled) {
          setVersionsLoaded(true);
          setUserLoaded(true);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const resumeText =
    resumeSource === "vault"
      ? (selectedVersion?.resume_text ?? "")
      : pastedResume.trim();

  const canSubmit =
    !running &&
    resumeText.length > 0 &&
    jobDescription.trim().length > 0;

  const runFitCheck = useCallback(async () => {
    if (!canSubmit) return;
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/resume/fit-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeText,
          jobDescription: jobDescription.trim(),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(body.error || `Request failed (${res.status})`);
      }
      const data: FitCheckResult = await res.json();
      setResult(data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Fit check failed";
      setError(msg);
    } finally {
      setRunning(false);
    }
  }, [canSubmit, resumeText, jobDescription]);

  // Fetch JD from a URL → POST /api/jobs/fetch-jd
  const fetchJdFromUrl = useCallback(async () => {
    const trimmed = jdUrl.trim();
    if (trimmed.length === 0 || jdFetching) return;
    setJdFetching(true);
    setJdFetchError(null);
    setJdFetchedFrom(null);
    setResult(null);
    setError(null);
    try {
      const res = await fetch("/api/jobs/fetch-jd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });
      const body = await res.json().catch(() => ({} as { error?: string; jobDescription?: string }));
      if (!res.ok) {
        throw new Error(body.error || `Fetch failed (${res.status})`);
      }
      const text: string = (body.jobDescription ?? "").trim();
      if (!text) {
        throw new Error("The fetched page did not contain a usable job description.");
      }
      setJobDescription(text);
      // Extract a friendly domain label
      try {
        setJdFetchedFrom(new URL(trimmed).hostname.replace(/^www\./, ""));
      } catch {
        setJdFetchedFrom(null);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Fetch failed";
      setJdFetchError(msg);
      // Auto-switch to paste mode so the user can recover without losing their place
      setJdMode("paste");
    } finally {
      setJdFetching(false);
    }
  }, [jdUrl, jdFetching]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
      {/* Header */}
      <header className="mb-6">
        <div className="flex items-center gap-2">
          <span
            className="text-[10px] font-bold uppercase tracking-widest"
            style={{ color: STAGE_HEX }}
          >
            Stage 1 · Evaluate
          </span>
        </div>
        <h1 className="mt-1 text-2xl sm:text-3xl font-black text-gray-900 tracking-tight">
          Fit Check
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-gray-600">
          See how well your resume matches a specific job description — fit score, strengths,
          missing skills, and what to fix before you apply.
        </p>
      </header>

      {/* Two-column on desktop, stacked on mobile */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── Left column: inputs ─────────────────────────────────────────── */}
        <section
          aria-label="Inputs"
          className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6 shadow-sm"
        >
          {/* Resume picker */}
          <div className="mb-5">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">Your resume</h2>
              {versions.length > 0 && (
                <div
                  role="tablist"
                  aria-label="Resume source"
                  className="inline-flex rounded-md border border-gray-200 p-0.5 text-[11px] font-medium"
                >
                  <button
                    role="tab"
                    aria-selected={resumeSource === "vault"}
                    onClick={() => setResumeSource("vault")}
                    className={`rounded px-2.5 py-1 transition-colors ${
                      resumeSource === "vault"
                        ? "bg-gray-900 text-white"
                        : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    Saved
                  </button>
                  <button
                    role="tab"
                    aria-selected={resumeSource === "paste"}
                    onClick={() => setResumeSource("paste")}
                    className={`rounded px-2.5 py-1 transition-colors ${
                      resumeSource === "paste"
                        ? "bg-gray-900 text-white"
                        : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    Paste
                  </button>
                </div>
              )}
            </div>

            {!versionsLoaded && (
              <div className="space-y-2" aria-busy="true">
                <div className="h-14 rounded-lg bg-gray-100 animate-pulse" />
                <div className="h-14 rounded-lg bg-gray-100 animate-pulse" />
              </div>
            )}

            {versionsLoaded && resumeSource === "vault" && (
              <>
                {versions.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-5 text-center">
                    <p className="text-sm text-gray-600">No saved resumes yet.</p>
                    <p className="mt-1 text-xs text-gray-500">
                      Upload one on{" "}
                      <a href="/mycareer/profile" className="font-semibold underline" style={{ color: STAGE_HEX }}>
                        your Career Profile
                      </a>{" "}
                      — or paste resume text below.
                    </p>
                    <button
                      onClick={() => setResumeSource("paste")}
                      className="mt-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                    >
                      Paste instead
                    </button>
                  </div>
                ) : (
                  <div className="max-h-60 space-y-2 overflow-y-auto pr-1">
                    {versions.map((v) => {
                      const selected = selectedVersion?.id === v.id;
                      return (
                        <button
                          key={v.id}
                          onClick={() => { setSelectedVersion(v); setResult(null); setError(null); }}
                          className="w-full rounded-lg border px-4 py-3 text-left transition-colors"
                          style={{
                            borderColor: selected ? STAGE_HEX : "#E5E7EB",
                            backgroundColor: selected ? `${STAGE_HEX}0D` : "#FFFFFF",
                          }}
                        >
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-gray-900">{v.version_name}</p>
                            {selected && (
                              <span className="text-[11px] font-semibold" style={{ color: STAGE_HEX }}>
                                Selected ✓
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-[11px] text-gray-400">
                            {new Date(v.created_at).toLocaleDateString("en-US", {
                              month: "short", day: "numeric", year: "numeric",
                            })}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {versionsLoaded && resumeSource === "paste" && (
              <textarea
                value={pastedResume}
                onChange={(e) => { setPastedResume(e.target.value); setResult(null); setError(null); }}
                rows={6}
                placeholder="Paste your resume text here…"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm leading-relaxed text-gray-800 placeholder:text-gray-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-brand-500 resize-y"
              />
            )}
          </div>

          {/* Job description */}
          <div className="mb-5">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">Job description</h2>
              <div
                role="tablist"
                aria-label="Job description source"
                className="inline-flex rounded-md border border-gray-200 p-0.5 text-[11px] font-medium"
              >
                <button
                  role="tab"
                  aria-selected={jdMode === "paste"}
                  onClick={() => { setJdMode("paste"); setJdFetchError(null); }}
                  className={`rounded px-2.5 py-1 transition-colors ${
                    jdMode === "paste"
                      ? "bg-gray-900 text-white"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  Paste
                </button>
                <button
                  role="tab"
                  aria-selected={jdMode === "url"}
                  onClick={() => { setJdMode("url"); setJdFetchError(null); }}
                  className={`rounded px-2.5 py-1 transition-colors ${
                    jdMode === "url"
                      ? "bg-gray-900 text-white"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  URL
                </button>
              </div>
            </div>

            {/* URL mode: fetch input + read-only preview */}
            {jdMode === "url" && (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={jdUrl}
                    onChange={(e) => { setJdUrl(e.target.value); setJdFetchError(null); }}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void fetchJdFromUrl(); } }}
                    placeholder="https://boards.greenhouse.io/…   or any job posting URL"
                    className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  <button
                    onClick={fetchJdFromUrl}
                    disabled={jdUrl.trim().length === 0 || jdFetching}
                    className="inline-flex shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 shadow-sm transition-opacity hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {jdFetching ? (
                      <>
                        <svg className="mr-1.5 h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
                          <path d="M4 12a8 8 0 0 1 8-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                        </svg>
                        Fetching
                      </>
                    ) : (
                      "Fetch"
                    )}
                  </button>
                </div>

                {jdFetchedFrom && jobDescription.trim().length > 0 && (
                  <p className="text-[11px] text-gray-500">
                    Fetched from <span className="font-medium text-gray-700">{jdFetchedFrom}</span>
                  </p>
                )}

                <textarea
                  value={jobDescription}
                  readOnly
                  rows={8}
                  placeholder="Paste a URL above and press Fetch to populate the job description here."
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm leading-relaxed text-gray-700 placeholder:text-gray-400 resize-y"
                  aria-label="Fetched job description preview"
                />
                <p className="text-[11px] text-gray-400">
                  {jobDescription.trim().length === 0
                    ? "Preview is read-only. Switch to Paste to edit."
                    : `${jobDescription.trim().split(/\s+/).length} words`}
                </p>
              </div>
            )}

            {/* Paste mode: editable textarea */}
            {jdMode === "paste" && (
              <>
                <textarea
                  value={jobDescription}
                  onChange={(e) => { setJobDescription(e.target.value); setResult(null); setError(null); setJdFetchedFrom(null); }}
                  rows={10}
                  placeholder="Paste the full job description here — the more detail, the better the fit assessment…"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm leading-relaxed text-gray-800 placeholder:text-gray-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-brand-500 resize-y"
                />
                <p className="mt-1 text-[11px] text-gray-400">
                  {jobDescription.trim().length === 0
                    ? "Paste the JD text — or switch to URL above to auto-fetch."
                    : `${jobDescription.trim().split(/\s+/).length} words`}
                </p>
              </>
            )}

            {/* Fetch error — surfaces below the input, persists until user retries or edits */}
            {jdFetchError && (
              <div
                role="alert"
                className="mt-2 rounded-md border px-3 py-2 text-[11px]"
                style={{
                  color: CORAL_HEX,
                  background: `${CORAL_HEX}0D`,
                  borderColor: `${CORAL_HEX}33`,
                }}
              >
                <strong className="font-semibold">Could not fetch:</strong> {jdFetchError}
                <span className="block opacity-80">Switched to paste mode — paste the JD manually or try a different URL.</span>
              </div>
            )}
          </div>

          {/* Submit */}
          <button
            onClick={runFitCheck}
            disabled={!canSubmit}
            className="inline-flex w-full items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
            style={{ backgroundColor: STAGE_HEX }}
          >
            {running ? (
              <>
                <svg className="mr-2 h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
                  <path d="M4 12a8 8 0 0 1 8-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                </svg>
                Checking…
              </>
            ) : (
              "Check Fit"
            )}
          </button>

          {/* Validation hint */}
          {!running && !canSubmit && (resumeText.length > 0 || jobDescription.trim().length > 0) && (
            <p className="mt-2 text-[11px] text-gray-500">
              {resumeText.length === 0
                ? "Pick or paste a resume to continue."
                : "Paste a job description to continue."}
            </p>
          )}
        </section>

        {/* ── Right column: results ───────────────────────────────────────── */}
        <section
          aria-label="Results"
          aria-live="polite"
          className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6 shadow-sm min-h-[480px]"
        >
          {/* Error */}
          {error && (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="mb-3 grid h-12 w-12 place-items-center rounded-full" style={{ background: `${CORAL_HEX}1A` }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={CORAL_HEX} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-gray-900">Something went wrong</h3>
              <p className="mt-1 max-w-sm text-xs text-gray-500">{error}</p>
              <button
                onClick={runFitCheck}
                className="mt-4 inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
              >
                Try again
              </button>
            </div>
          )}

          {/* Loading */}
          {!error && running && <ResultsSkeleton />}

          {/* Empty */}
          {!error && !running && !result && userLoaded && <EmptyRightPanel />}

          {/* Results */}
          {!error && !running && result && (
            <div className="space-y-6">
              <div className="flex flex-col items-center justify-center">
                <ScoreRing score={result.fitScore} />
                <p className="mt-4 max-w-md text-center text-sm leading-relaxed text-gray-700">
                  {result.summary}
                </p>
              </div>

              {result.strengths.length > 0 && (
                <div>
                  <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-gray-500">
                    Strong matches
                  </h3>
                  <ul className="flex flex-wrap gap-2">
                    {result.strengths.map((s, i) => (
                      <li
                        key={i}
                        className="rounded-full px-3 py-1 text-xs font-medium"
                        style={{
                          color: STAGE_HEX,
                          background: `${STAGE_HEX}14`,
                          border: `1px solid ${STAGE_HEX}33`,
                        }}
                      >
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {result.missingSkills.length > 0 && (
                <div>
                  <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-gray-500">
                    Missing skills
                  </h3>
                  <ul className="flex flex-wrap gap-2">
                    {result.missingSkills.map((s, i) => (
                      <li
                        key={i}
                        className="rounded-full px-3 py-1 text-xs font-medium"
                        style={{
                          color: CORAL_HEX,
                          background: `${CORAL_HEX}14`,
                          border: `1px solid ${CORAL_HEX}33`,
                        }}
                      >
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {result.recommendations.length > 0 && (
                <div>
                  <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-gray-500">
                    Recommendations
                  </h3>
                  <ol className="space-y-2">
                    {result.recommendations.map((r, i) => (
                      <li key={i} className="flex gap-3 text-sm text-gray-700">
                        <span
                          className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white"
                          style={{ background: STAGE_HEX }}
                          aria-hidden="true"
                        >
                          {i + 1}
                        </span>
                        <span>{r}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              <div className="border-t border-gray-100 pt-5">
                <a
                  href="/evaluate"
                  className="inline-flex w-full items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
                  style={{ backgroundColor: STAGE_HEX }}
                >
                  Start your Evaluate stage →
                </a>
                <p className="mt-2 text-center text-[11px] text-gray-400">
                  Take this into your Career OS cycle and turn it into a plan.
                </p>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
