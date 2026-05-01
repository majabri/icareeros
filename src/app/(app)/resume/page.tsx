/**
 * /resume — Resume Advisor
 * Upload or pick a saved resume, paste or type a job description,
 * and get an AI-powered fit assessment with actionable recommendations.
 */
"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  parseResumeFile,
  listResumeVersions,
  type ResumeVersion,
  type RewriteResult,
  rewriteResume,
} from "@/services/ai/resumeService";
import { createClient } from "@/lib/supabase";

interface FitCheckResult {
  fitScore: number;
  summary: string;
  strengths: string[];
  gaps: string[];
  missingSkills: string[];
  recommendations: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function ScoreRing({ score }: { score: number }) {
  const color =
    score >= 80 ? "text-emerald-600" :
    score >= 60 ? "text-brand-600" :
    score >= 40 ? "text-amber-500" :
                  "text-red-500";
  const bg =
    score >= 80 ? "bg-emerald-50 border-emerald-200" :
    score >= 60 ? "bg-brand-50 border-brand-200" :
    score >= 40 ? "bg-amber-50 border-amber-200" :
                  "bg-red-50 border-red-200";
  const label =
    score >= 80 ? "Strong fit" :
    score >= 60 ? "Good fit" :
    score >= 40 ? "Partial fit" :
                  "Weak fit";

  return (
    <div className={`flex flex-col items-center justify-center rounded-2xl border-2 ${bg} px-8 py-6`}>
      <span className={`text-6xl font-black tabular-nums ${color}`}>{score}</span>
      <span className="mt-1 text-xs font-semibold uppercase tracking-widest text-gray-400">/100</span>
      <span className={`mt-2 text-sm font-semibold ${color}`}>{label}</span>
    </div>
  );
}

function Pill({ text, color }: { text: string; color: "green" | "red" | "amber" | "blue" }) {
  const cls = {
    green: "bg-emerald-50 text-emerald-700",
    red:   "bg-red-50 text-red-700",
    amber: "bg-amber-50 text-amber-700",
    blue:  "bg-brand-50 text-brand-700",
  }[color];
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>{text}</span>;
}

function downloadTxt(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = filename.endsWith(".txt") ? filename : `${filename}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Main Page ─────────────────────────────────────────────────────────────────

type ResumeSource = "upload" | "vault";
type JobSource    = "paste" | "url";

export default function ResumeAdvisorPage() {
  // ── Resume source ─────────────────────────────────────────────────
  const [resumeSource, setResumeSource] = useState<ResumeSource>("upload");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [dragOver, setDragOver]         = useState(false);
  const [versions, setVersions]         = useState<ResumeVersion[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<ResumeVersion | null>(null);
  const [versionsLoaded, setVersionsLoaded]   = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Job source ────────────────────────────────────────────────────
  const [jobSource, setJobSource]           = useState<JobSource>("paste");
  const [jobDescription, setJobDescription] = useState("");
  const [jobUrl, setJobUrl]                 = useState("");

  // ── Fit check state ───────────────────────────────────────────────
  const [checking, setChecking]   = useState(false);
  const [result, setResult]       = useState<FitCheckResult | null>(null);
  const [error, setError]         = useState<string | null>(null);

  // ── Rewrite state ─────────────────────────────────────────────────
  const [rewriting, setRewriting]         = useState(false);
  const [rewriteResult, setRewriteResult] = useState<RewriteResult | null>(null);
  const [showRewrite, setShowRewrite]     = useState(false);

  // ── Resume text (resolved from source) ───────────────────────────
  const [resolvedResumeText, setResolvedResumeText] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const vs = await listResumeVersions();
        setVersions(vs);
        setVersionsLoaded(true);
      } catch (e) {
        console.error("Failed to load versions", e);
        setVersionsLoaded(true);
      }
    })();
  }, []);

  const handleFile = useCallback((file: File) => {
    setUploadedFile(file);
    setResult(null);
    setRewriteResult(null);
    setError(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  // Derive the effective job text (URL is used as-is; we embed it in the prompt)
  const effectiveJob = jobSource === "paste" ? jobDescription.trim() : jobUrl.trim();

  const hasResume =
    resumeSource === "upload" ? !!uploadedFile : !!selectedVersion;
  const hasJob = effectiveJob.length > 10;
  const canCheck = hasResume && hasJob && !checking;

  async function handleCheck() {
    setChecking(true);
    setError(null);
    setResult(null);
    setRewriteResult(null);
    setShowRewrite(false);

    try {
      let resumeText = "";

      if (resumeSource === "upload" && uploadedFile) {
        // rawText = original extracted text — best quality for AI analysis
        const { rawText } = await parseResumeFile(uploadedFile);
        resumeText = rawText;
      } else if (resumeSource === "vault" && selectedVersion) {
        resumeText = selectedVersion.resume_text;
      }

      if (!resumeText) throw new Error("Could not extract resume text.");

      setResolvedResumeText(resumeText);

      const jobText =
        jobSource === "url"
          ? `Job URL: ${jobUrl}\n\n(Assess based on the URL context provided)`
          : jobDescription;

      const supabase = createClient();
      const { data, error: fnError } = await supabase.functions.invoke("fit-check", {
        body: { resumeText, jobDescription: jobText },
      });
      if (fnError) throw new Error(fnError.message ?? "Fit check failed");
      if (data?.error) throw new Error(data.error);
      const data2: FitCheckResult = data as FitCheckResult;
      setResult(data2);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fit check failed");
    } finally {
      setChecking(false);
    }
  }

  async function handleRewrite() {
    if (!resolvedResumeText) return;
    setRewriting(true);
    try {
      const rr = await rewriteResume({
        resumeText:     resolvedResumeText,
        jobDescription: jobSource === "paste" ? jobDescription : undefined,
        targetRole:     undefined,
      });
      setRewriteResult(rr);
      setShowRewrite(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Rewrite failed");
    } finally {
      setRewriting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">

        {/* ── Header ──────────────────────────────────────────────── */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">🎯 Resume Advisor</h1>
          <p className="mt-1 text-sm text-gray-500">
            Upload your resume, paste a job description, and get an instant AI-powered fit score with coaching to close the gap.
          </p>
        </div>

        <div className="space-y-6">

          {/* ── Step 1: Resume ─────────────────────────────────────── */}
          <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
              Step 1 — Your Resume
            </h2>

            {/* Source toggle */}
            <div className="mb-4 flex rounded-lg border border-gray-200 bg-gray-50 p-1">
              <button
                onClick={() => { setResumeSource("upload"); setResult(null); }}
                className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${resumeSource === "upload" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
              >
                📁 Upload file
              </button>
              <button
                onClick={() => { setResumeSource("vault"); setResult(null); }}
                className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${resumeSource === "vault" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
              >
                📚 Saved versions {versionsLoaded && versions.length > 0 && `(${versions.length})`}
              </button>
            </div>

            {resumeSource === "upload" ? (
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 transition-colors ${
                  dragOver ? "border-brand-400 bg-brand-50" :
                  uploadedFile ? "border-emerald-300 bg-emerald-50" :
                  "border-gray-300 bg-gray-50 hover:border-brand-300 hover:bg-brand-50/40"
                }`}
              >
                <span className="mb-2 text-2xl">{uploadedFile ? "✅" : "📄"}</span>
                {uploadedFile ? (
                  <p className="font-medium text-gray-800">{uploadedFile.name}</p>
                ) : (
                  <>
                    <p className="font-medium text-gray-700">Drop your resume here</p>
                    <p className="mt-1 text-xs text-gray-400">PDF, Word (.docx), or TXT · click to browse</p>
                  </>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx,.doc,.txt"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                  }}
                />
              </div>
            ) : (
              <div>
                {!versionsLoaded ? (
                  <div className="flex items-center justify-center py-6">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
                  </div>
                ) : versions.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-6 text-center">
                    <p className="text-sm text-gray-500">No saved versions yet.</p>
                    <p className="mt-1 text-xs text-gray-400">
                      Go to <a href="/mycareer" className="text-brand-500 underline">My Career</a> to upload and save a resume version.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {versions.map((v) => (
                      <button
                        key={v.id}
                        onClick={() => { setSelectedVersion(v); setResult(null); }}
                        className={`w-full rounded-lg border px-4 py-3 text-left transition-colors ${
                          selectedVersion?.id === v.id
                            ? "border-brand-400 bg-brand-50"
                            : "border-gray-200 bg-white hover:border-brand-200 hover:bg-brand-50/30"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <p className="font-medium text-gray-900">{v.version_name}</p>
                          {selectedVersion?.id === v.id && (
                            <span className="text-xs font-semibold text-brand-600">Selected ✓</span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-gray-400">
                          {v.job_type && <span className="mr-2 text-brand-500">{v.job_type}</span>}
                          {new Date(v.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* ── Step 2: Job ────────────────────────────────────────── */}
          <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
              Step 2 — The Job
            </h2>

            <div className="mb-4 flex rounded-lg border border-gray-200 bg-gray-50 p-1">
              <button
                onClick={() => { setJobSource("paste"); setResult(null); }}
                className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${jobSource === "paste" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
              >
                ✏️ Paste description
              </button>
              <button
                onClick={() => { setJobSource("url"); setResult(null); }}
                className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${jobSource === "url" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
              >
                🔗 Job URL
              </button>
            </div>

            {jobSource === "paste" ? (
              <textarea
                value={jobDescription}
                onChange={(e) => { setJobDescription(e.target.value); setResult(null); }}
                placeholder="Paste the full job description here…"
                rows={8}
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-700 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
            ) : (
              <input
                type="url"
                value={jobUrl}
                onChange={(e) => { setJobUrl(e.target.value); setResult(null); }}
                placeholder="https://www.linkedin.com/jobs/view/..."
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-700 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
            )}
          </section>

          {/* ── CTA ───────────────────────────────────────────────── */}
          <button
            onClick={() => void handleCheck()}
            disabled={!canCheck}
            className="w-full rounded-xl bg-brand-600 py-3.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
          >
            {checking ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Analyzing fit…
              </span>
            ) : "🎯 Analyze Resume"}
          </button>

          {/* ── Error ─────────────────────────────────────────────── */}
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              ⚠ {error}
            </div>
          )}

          {/* ── Results ───────────────────────────────────────────── */}
          {result && (
            <div className="space-y-5">

              {/* Score + summary */}
              <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
                  <ScoreRing score={result.fitScore} />
                  <div className="flex-1">
                    <h2 className="mb-2 text-base font-semibold text-gray-900">Overall Assessment</h2>
                    <p className="text-sm leading-relaxed text-gray-700">{result.summary}</p>
                  </div>
                </div>
              </section>

              {/* Strengths */}
              {result.strengths.length > 0 && (
                <section className="rounded-xl border border-emerald-100 bg-white p-6 shadow-sm">
                  <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-emerald-600">
                    ✓ Strengths
                  </h2>
                  <ul className="space-y-2">
                    {result.strengths.map((s, i) => (
                      <li key={i} className="flex gap-2 text-sm text-gray-700">
                        <span className="mt-0.5 shrink-0 text-emerald-500">●</span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Gaps */}
              {result.gaps.length > 0 && (
                <section className="rounded-xl border border-amber-100 bg-white p-6 shadow-sm">
                  <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-amber-600">
                    ⚠ Gaps
                  </h2>
                  <ul className="space-y-2">
                    {result.gaps.map((g, i) => (
                      <li key={i} className="flex gap-2 text-sm text-gray-700">
                        <span className="mt-0.5 shrink-0 text-amber-400">●</span>
                        <span>{g}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Missing skills */}
              {result.missingSkills.length > 0 && (
                <section className="rounded-xl border border-red-100 bg-white p-6 shadow-sm">
                  <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-red-500">
                    Missing Skills
                  </h2>
                  <div className="flex flex-wrap gap-2">
                    {result.missingSkills.map((s, i) => (
                      <Pill key={i} text={s} color="red" />
                    ))}
                  </div>
                </section>
              )}

              {/* Recommendations */}
              {result.recommendations.length > 0 && (
                <section className="rounded-xl border border-brand-100 bg-white p-6 shadow-sm">
                  <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-brand-600">
                    💡 Recommendations
                  </h2>
                  <ol className="space-y-2">
                    {result.recommendations.map((r, i) => (
                      <li key={i} className="flex gap-3 text-sm text-gray-700">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
                          {i + 1}
                        </span>
                        <span>{r}</span>
                      </li>
                    ))}
                  </ol>
                </section>
              )}

              {/* Rewrite CTA */}
              {!rewriteResult && (
                <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-6">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="font-semibold text-gray-900">Rewrite resume for this job</h2>
                      <p className="mt-0.5 text-sm text-gray-600">
                        AI tailors your resume to match the job description and address the gaps above.
                      </p>
                    </div>
                    <button
                      onClick={() => void handleRewrite()}
                      disabled={rewriting}
                      className="shrink-0 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                    >
                      {rewriting ? (
                        <span className="flex items-center gap-2">
                          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                          Rewriting…
                        </span>
                      ) : "✨ Rewrite Resume"}
                    </button>
                  </div>
                </section>
              )}

              {/* Rewrite result */}
              {rewriteResult && (
                <section className="rounded-xl border border-emerald-200 bg-white p-6 shadow-sm">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <h2 className="font-semibold text-gray-900">✨ Rewritten Resume</h2>
                    <div className="flex gap-2">
                      <button
                        onClick={() => downloadTxt("resume-rewritten.txt", rewriteResult.rewrittenText)}
                        className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                      >
                        ⬇ Download .txt
                      </button>
                    </div>
                  </div>

                  {rewriteResult.improvements.length > 0 && (
                    <div className="mb-4 rounded-lg bg-emerald-50 p-4">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-600">
                        Changes made ({rewriteResult.improvements.length})
                      </p>
                      <ul className="space-y-1">
                        {rewriteResult.improvements.map((imp, i) => (
                          <li key={i} className="flex gap-2 text-sm text-emerald-800">
                            <span className="mt-0.5 text-emerald-500">✓</span>
                            <span>{imp}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap rounded-xl bg-gray-50 p-4 text-sm text-gray-800">
                    {rewriteResult.rewrittenText}
                  </pre>
                </section>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
