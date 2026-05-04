/**
 * /resumeadvisor — Resume Advisor v2 (renamed from /resume 2026-05-04)
 *
 * Upload or pick a saved resume, paste/import a job description, get an
 * AI-powered fit assessment with actionable recommendations + 9 features:
 *   1. URL renamed to /resumeadvisor (this folder)
 *   2. Different file upload offers to update Career Profile
 *   3. Missing skills can be added to Career Profile (one-click)
 *   4. Recommendations can be added to Target Skills (one-click)
 *   5. Rewrite resume → Save to Vault + Export DOCX / PDF / TXT / ATS
 *   6. Generate Cover Letter (one-click)
 *   7. Professional Critique — "why no interviews" (combined self + market)
 *   8. Interview Prep Questions (links to /interview with this JD)
 *   9. Save Job to Opportunities (writes opportunities row)
 */
"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  parseResumeFile,
  listResumeVersions,
  saveResumeVersion,
  type ResumeVersion,
  type RewriteResult,
  rewriteResume,
} from "@/services/ai/resumeService";
import { createClient } from "@/lib/supabase";
import { exportProfile, type ExportFormat, type ExportableProfile } from "@/lib/profile-export";
import type { ParsedResume } from "@/lib/parseResumeLocally";

interface FitCheckResult {
  fitScore: number;
  summary: string;
  strengths: string[];
  gaps: string[];
  missingSkills: string[];
  recommendations: string[];
}

interface CritiqueResult {
  overall_grade: string;
  interview_likelihood: "high" | "medium" | "low" | "very_low";
  summary: string;
  self_critique: Array<{ severity: string; issue: string; detail: string; fix: string }>;
  market_critique: Array<{ severity: string; issue: string; detail: string; fix: string }>;
  top_three_actions: string[];
}

interface CoverLetterResult {
  subject: string;
  body: string;
  word_count: number;
  tips: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function ScoreRing({ score }: { score: number }) {
  const color = score >= 80 ? "text-emerald-600" : score >= 60 ? "text-brand-600" : score >= 40 ? "text-amber-500" : "text-red-500";
  const bg    = score >= 80 ? "bg-emerald-50 border-emerald-200" : score >= 60 ? "bg-brand-50 border-brand-200" : score >= 40 ? "bg-amber-50 border-amber-200" : "bg-red-50 border-red-200";
  const label = score >= 80 ? "Strong fit" : score >= 60 ? "Good fit" : score >= 40 ? "Partial fit" : "Weak fit";
  return (
    <div className={`flex flex-col items-center justify-center rounded-2xl border-2 ${bg} px-8 py-6`}>
      <span className={`text-6xl font-black tabular-nums ${color}`}>{score}</span>
      <span className="mt-1 text-xs font-semibold uppercase tracking-widest text-gray-400">/100</span>
      <span className={`mt-2 text-sm font-semibold ${color}`}>{label}</span>
    </div>
  );
}

function downloadText(filename: string, content: string, mime = "text/plain") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// Build a minimal ExportableProfile from raw resume text (used when exporting
// the rewritten resume — we don't have all the structured fields, so we put
// the rewritten text in summary so the exporters render it).
function profileFromRewrittenText(text: string): ExportableProfile {
  return {
    fullName: "", email: "", phone: "", location: "", linkedinUrl: "",
    headline: "", summary: text,
    workExp: [], education: [], certifications: [], skills: [], portfolioItems: [],
  };
}

// ── Main Page ─────────────────────────────────────────────────────────────────

type ResumeSource = "upload" | "vault";
type JobSource = "paste" | "url";

export default function ResumeAdvisorPage() {
  const supabase = createClient();
  const [userId, setUserId] = useState<string | null>(null);

  // Resume source
  const [resumeSource, setResumeSource] = useState<ResumeSource>("upload");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [versions, setVersions] = useState<ResumeVersion[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<ResumeVersion | null>(null);
  const [versionsLoaded, setVersionsLoaded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Job source
  const [jobSource, setJobSource] = useState<JobSource>("paste");
  const [jobDescription, setJobDescription] = useState("");
  const [jobUrl, setJobUrl] = useState("");

  // Fit check state
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<FitCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Rewrite state
  const [rewriting, setRewriting] = useState(false);
  const [rewriteResult, setRewriteResult] = useState<RewriteResult | null>(null);

  // Resolved resume text (used by all downstream actions)
  const [resolvedResumeText, setResolvedResumeText] = useState("");
  const [parsedFromUpload, setParsedFromUpload] = useState<ParsedResume | null>(null);

  // Profile-update prompt (item #2)
  const [showProfileUpdatePrompt, setShowProfileUpdatePrompt] = useState(false);

  // Action state
  const [busy, setBusy] = useState<{ kind: string; idx?: number } | null>(null);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // Critique state (item #7)
  const [critiquing, setCritiquing] = useState(false);
  const [critique, setCritique] = useState<CritiqueResult | null>(null);

  // Cover letter state (item #6)
  const [coverLetter, setCoverLetter] = useState<CoverLetterResult | null>(null);

  // ── Load versions + user ────────────────────────────────────────────────
  useEffect(() => {
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setUserId(user.id);
      try {
        const vs = await listResumeVersions();
        setVersions(vs);
      } catch (e) { console.error("Failed to load versions", e); }
      setVersionsLoaded(true);
    })();
  }, [supabase]);

  // Toast auto-dismiss
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const handleFile = useCallback((file: File) => {
    setUploadedFile(file);
    setResult(null); setRewriteResult(null); setError(null);
    setParsedFromUpload(null); setShowProfileUpdatePrompt(false);
    setCritique(null); setCoverLetter(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const effectiveJob = jobSource === "paste" ? jobDescription.trim() : jobUrl.trim();
  const hasResume = resumeSource === "upload" ? !!uploadedFile : !!selectedVersion;
  const hasJob = effectiveJob.length > 10;
  const canCheck = hasResume && hasJob && !checking;

  // ── Fit check ──────────────────────────────────────────────────────────
  async function handleCheck() {
    setChecking(true); setError(null); setResult(null); setRewriteResult(null);
    setCritique(null); setCoverLetter(null);
    try {
      let resumeText = "";
      if (resumeSource === "upload" && uploadedFile) {
        const { rawText, parsed } = await parseResumeFile(uploadedFile);
        resumeText = rawText;
        setParsedFromUpload(parsed);
        // Item #2 — offer to update profile if upload looks like a real resume
        if (parsed.experience.length > 0 || parsed.contact.name) {
          setShowProfileUpdatePrompt(true);
        }
      } else if (resumeSource === "vault" && selectedVersion) {
        resumeText = selectedVersion.resume_text;
      }
      if (!resumeText) throw new Error("Could not extract resume text.");
      setResolvedResumeText(resumeText);

      const jobText = jobSource === "url" ? `Job URL: ${jobUrl}\n\n(Assess based on the URL context provided)` : jobDescription;
      const { data, error: fnError } = await supabase.functions.invoke("fit-check", {
        body: { resumeText, jobDescription: jobText },
      });
      if (fnError) throw new Error(fnError.message ?? "Fit check failed");
      if (data?.error) throw new Error(data.error);
      setResult(data as FitCheckResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fit check failed");
    } finally {
      setChecking(false);
    }
  }

  // ── Rewrite ────────────────────────────────────────────────────────────
  async function handleRewrite() {
    if (!resolvedResumeText) return;
    setRewriting(true);
    try {
      const rr = await rewriteResume({
        resumeText: resolvedResumeText,
        jobDescription: jobSource === "paste" ? jobDescription : undefined,
      });
      setRewriteResult(rr);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Rewrite failed");
    } finally {
      setRewriting(false);
    }
  }

  // ── Item #2: confirm profile update ────────────────────────────────────
  async function handleUpdateProfile() {
    if (!userId || !parsedFromUpload) return;
    setBusy({ kind: "profile-update" });
    try {
      const p = parsedFromUpload;
      const { error: e } = await supabase.from("career_profiles").upsert({
        user_id: userId,
        full_name: p.contact.name || null,
        phone: p.contact.phone || null,
        contact_email: p.contact.email || null,
        linkedin_url: p.contact.linkedin || null,
        location: p.contact.location || null,
        summary: p.summary || null,
        skills: p.skills,
        work_experience: p.experience.map(ex => ({
          title: ex.title, company: ex.company,
          startDate: ex.period.split(/[-–—]/)[0]?.trim() ?? "",
          endDate: ex.period.split(/[-–—]/)[1]?.trim() ?? "",
          description: ex.bullets.join("\n"),
        })),
        education: p.education.map(ed => ({ degree: ed.degree, institution: ed.school, year: ed.year })),
        certifications: p.certifications.map(c => ({ name: c, issuer: "", date: "", license_number: "" })),
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
      if (e) throw new Error(e.message);
      setShowProfileUpdatePrompt(false);
      setToast({ kind: "ok", text: "Career profile updated from this resume." });
    } catch (e) {
      setToast({ kind: "err", text: e instanceof Error ? e.message : "Update failed" });
    } finally {
      setBusy(null);
    }
  }

  // ── Item #3: add missing skill to profile ───────────────────────────────
  async function handleAddSkillToProfile(skill: string, idx: number) {
    if (!userId) return;
    setBusy({ kind: "add-skill", idx });
    try {
      // Read current skills, append, write back
      const { data: row } = await supabase.from("career_profiles").select("skills").eq("user_id", userId).maybeSingle();
      const current = (row?.skills as string[]) ?? [];
      if (current.some(s => s.toLowerCase() === skill.toLowerCase())) {
        setToast({ kind: "ok", text: `"${skill}" already in your profile.` });
        return;
      }
      const next = [...current, skill];
      const { error: e } = await supabase.from("career_profiles").upsert(
        { user_id: userId, skills: next, updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      );
      if (e) throw new Error(e.message);
      setToast({ kind: "ok", text: `Added "${skill}" to your profile. Re-run analysis to update fit.` });
    } catch (e) {
      setToast({ kind: "err", text: e instanceof Error ? e.message : "Add failed" });
    } finally {
      setBusy(null);
    }
  }

  // ── Item #4: add recommendation to target skills ────────────────────────
  async function handleAddRecommendationToTargets(rec: string, idx: number) {
    if (!userId) return;
    setBusy({ kind: "add-target", idx });
    try {
      const { data: row } = await supabase.from("career_profiles").select("target_skills").eq("user_id", userId).maybeSingle();
      const current = (row?.target_skills as string[]) ?? [];
      // Use the recommendation text as a skill goal — user can edit later
      const label = rec.slice(0, 80);
      if (current.some(s => s.toLowerCase() === label.toLowerCase())) {
        setToast({ kind: "ok", text: "Already in your target skills." });
        return;
      }
      const { error: e } = await supabase.from("career_profiles").upsert(
        { user_id: userId, target_skills: [...current, label], updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      );
      if (e) throw new Error(e.message);
      setToast({ kind: "ok", text: "Added to your Target Skills." });
    } catch (e) {
      setToast({ kind: "err", text: e instanceof Error ? e.message : "Add failed" });
    } finally {
      setBusy(null);
    }
  }

  // ── Item #5a: save rewritten resume to vault ────────────────────────────
  async function handleSaveRewriteToVault() {
    if (!rewriteResult) return;
    setBusy({ kind: "save-vault" });
    try {
      const versionName = "Rewritten — " + new Date().toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
      await saveResumeVersion({ versionName, resumeText: rewriteResult.rewrittenText });
      const vs = await listResumeVersions(); setVersions(vs);
      setToast({ kind: "ok", text: `Saved to vault as "${versionName}".` });
    } catch (e) {
      setToast({ kind: "err", text: e instanceof Error ? e.message : "Save failed" });
    } finally { setBusy(null); }
  }

  // ── Item #5b: export rewritten resume ───────────────────────────────────
  async function handleExportRewrite(format: ExportFormat) {
    if (!rewriteResult) return;
    setBusy({ kind: "export-" + format });
    try {
      // For TXT/ATS we use raw text directly. For DOCX/DOC/PDF use exportProfile
      // by stuffing the rewritten text into the summary field.
      if (format === "txt") {
        downloadText("resume-rewritten.txt", rewriteResult.rewrittenText);
      } else if (format === "ats") {
        downloadText("resume-rewritten-ATS.txt", rewriteResult.rewrittenText);
      } else {
        await exportProfile(format, profileFromRewrittenText(rewriteResult.rewrittenText));
      }
      setToast({ kind: "ok", text: `Downloaded ${format.toUpperCase()}.` });
    } catch (e) {
      setToast({ kind: "err", text: e instanceof Error ? e.message : "Export failed" });
    } finally { setBusy(null); }
  }

  // ── Item #6: cover letter ──────────────────────────────────────────────
  async function handleCoverLetter() {
    if (!resolvedResumeText || !jobDescription.trim()) {
      setToast({ kind: "err", text: "Need both resume + pasted job description for cover letter." });
      return;
    }
    setBusy({ kind: "cover-letter" });
    try {
      const r = await fetch("/api/resume/cover-letter-from-text", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeText: resolvedResumeText, jobDescription }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.error ?? `Cover letter failed (${r.status})`);
      }
      const cl = (await r.json()) as CoverLetterResult;
      setCoverLetter(cl);
      setToast({ kind: "ok", text: "Cover letter generated." });
    } catch (e) {
      setToast({ kind: "err", text: e instanceof Error ? e.message : "Cover letter failed" });
    } finally { setBusy(null); }
  }

  // ── Item #7: professional critique ─────────────────────────────────────
  async function handleCritique() {
    if (!resolvedResumeText) return;
    setCritiquing(true);
    try {
      const r = await fetch("/api/resume/critique", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeText: resolvedResumeText }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.error ?? `Critique failed (${r.status})`);
      }
      const c = (await r.json()) as CritiqueResult;
      setCritique(c);
    } catch (e) {
      setToast({ kind: "err", text: e instanceof Error ? e.message : "Critique failed" });
    } finally { setCritiquing(false); }
  }

  // ── Item #8: interview prep questions (link out) ───────────────────────
  function handleInterviewPrep() {
    // Pass the JD via session storage so /interview can pre-fill it
    if (typeof window !== "undefined" && jobDescription) {
      try { sessionStorage.setItem("interviewPrep:jd", jobDescription); } catch {/* ignore */}
    }
    window.location.href = "/interview";
  }

  // ── Item #9: save job to opportunities ─────────────────────────────────
  async function handleSaveJob() {
    if (!userId) return;
    if (jobSource !== "paste" || !jobDescription.trim()) {
      setToast({ kind: "err", text: "Paste the job description to save." });
      return;
    }
    setBusy({ kind: "save-job" });
    try {
      // Heuristic title/company from first non-blank line
      const firstLine = jobDescription.split("\n").map(s => s.trim()).find(Boolean) ?? "Saved opportunity";
      const titleGuess = firstLine.slice(0, 80);
      const { error: e } = await supabase.from("opportunities").insert({
        title: titleGuess,
        company: "Manual entry",
        description: jobDescription,
        source: "manual",
        source_id: `manual-${userId}-${Date.now()}`,
        is_active: true,
      });
      if (e) throw new Error(e.message);
      setToast({ kind: "ok", text: "Saved to Opportunities. View it in the Jobs tab." });
    } catch (e) {
      setToast({ kind: "err", text: e instanceof Error ? e.message : "Save failed" });
    } finally { setBusy(null); }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">🎯 Resume Advisor</h1>
          <p className="mt-1 text-sm text-gray-500">
            Upload a resume, paste a job description, get an AI-powered fit score plus actions to improve it.
          </p>
        </div>

        {/* Toast */}
        {toast && (
          <div className={`fixed top-4 right-4 z-50 rounded-lg px-4 py-3 text-sm shadow-lg ${toast.kind === "ok" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"}`}>
            {toast.kind === "ok" ? "✓ " : "⚠ "}{toast.text}
          </div>
        )}

        <div className="space-y-6">
          {/* Step 1: Resume */}
          <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">Step 1 — Your Resume</h2>
            <div className="mb-4 flex rounded-lg border border-gray-200 bg-gray-50 p-1">
              <button onClick={() => { setResumeSource("upload"); setResult(null); }} className={`flex-1 rounded-md py-2 text-sm font-medium ${resumeSource === "upload" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>📁 Upload file (different from profile)</button>
              <button onClick={() => { setResumeSource("vault"); setResult(null); }} className={`flex-1 rounded-md py-2 text-sm font-medium ${resumeSource === "vault" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>📚 Saved versions {versionsLoaded && versions.length > 0 && `(${versions.length})`}</button>
            </div>
            {resumeSource === "upload" ? (
              <div onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={handleDrop} onClick={() => fileInputRef.current?.click()} className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 ${dragOver ? "border-brand-400 bg-brand-50" : uploadedFile ? "border-emerald-300 bg-emerald-50" : "border-gray-300 bg-gray-50 hover:border-brand-300"}`}>
                <span className="mb-2 text-2xl">{uploadedFile ? "✅" : "📄"}</span>
                {uploadedFile ? <p className="font-medium text-gray-800">{uploadedFile.name}</p> : <><p className="font-medium text-gray-700">Drop your resume here</p><p className="mt-1 text-xs text-gray-400">PDF, Word (.doc, .docx), or TXT · click to browse</p></>}
                <input ref={fileInputRef} type="file" accept=".pdf,.docx,.doc,.txt" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
              </div>
            ) : (
              <div>
                {!versionsLoaded ? <div className="flex items-center justify-center py-6"><div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" /></div>
                : versions.length === 0 ? <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-6 text-center"><p className="text-sm text-gray-500">No saved versions yet.</p></div>
                : <div className="space-y-2">{versions.map(v => <button key={v.id} onClick={() => { setSelectedVersion(v); setResult(null); }} className={`w-full rounded-lg border px-4 py-3 text-left ${selectedVersion?.id === v.id ? "border-brand-400 bg-brand-50" : "border-gray-200 bg-white hover:border-brand-200"}`}><div className="flex items-center justify-between"><p className="font-medium text-gray-900">{v.version_name}</p>{selectedVersion?.id === v.id && <span className="text-xs font-semibold text-brand-600">Selected ✓</span>}</div><p className="mt-0.5 text-xs text-gray-400">{new Date(v.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p></button>)}</div>}
              </div>
            )}
          </section>

          {/* Step 2: Job */}
          <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">Step 2 — The Job</h2>
            <div className="mb-4 flex rounded-lg border border-gray-200 bg-gray-50 p-1">
              <button onClick={() => { setJobSource("paste"); setResult(null); }} className={`flex-1 rounded-md py-2 text-sm font-medium ${jobSource === "paste" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>✏️ Paste description</button>
              <button onClick={() => { setJobSource("url"); setResult(null); }} className={`flex-1 rounded-md py-2 text-sm font-medium ${jobSource === "url" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>🔗 Job URL</button>
            </div>
            {jobSource === "paste" ? <textarea value={jobDescription} onChange={(e) => { setJobDescription(e.target.value); setResult(null); }} placeholder="Paste the full job description here…" rows={8} className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:border-brand-400 focus:ring-2 focus:ring-brand-100" />
            : <input type="url" value={jobUrl} onChange={(e) => { setJobUrl(e.target.value); setResult(null); }} placeholder="https://www.linkedin.com/jobs/view/..." className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:border-brand-400 focus:ring-2 focus:ring-brand-100" />}
          </section>

          {/* CTA */}
          <button onClick={() => void handleCheck()} disabled={!canCheck} className="w-full rounded-xl bg-brand-600 py-3.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-40">
            {checking ? "Analyzing fit…" : "🎯 Analyze Resume"}
          </button>

          {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">⚠ {error}</div>}

          {/* Profile-update prompt (item #2) */}
          {showProfileUpdatePrompt && parsedFromUpload && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 flex items-start gap-3">
              <span className="text-lg">💡</span>
              <div className="flex-1">
                <p className="text-sm font-medium text-blue-900">Update your Career Profile from this resume?</p>
                <p className="mt-0.5 text-xs text-blue-700">This uploaded resume looks different from your saved profile. Would you like to overwrite your Career Profile with this one?</p>
              </div>
              <button onClick={() => void handleUpdateProfile()} disabled={busy?.kind === "profile-update"} className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">{busy?.kind === "profile-update" ? "Updating…" : "Yes, update profile"}</button>
              <button onClick={() => setShowProfileUpdatePrompt(false)} className="rounded-md border border-blue-200 bg-white px-3 py-1.5 text-xs font-medium text-blue-700">No thanks</button>
            </div>
          )}

          {/* Results */}
          {result && (
            <div className="space-y-5">
              <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
                  <ScoreRing score={result.fitScore} />
                  <div className="flex-1"><h2 className="mb-2 text-base font-semibold text-gray-900">Overall Assessment</h2><p className="text-sm leading-relaxed text-gray-700">{result.summary}</p></div>
                </div>
              </section>

              {result.strengths.length > 0 && (
                <section className="rounded-xl border border-emerald-100 bg-white p-6 shadow-sm">
                  <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-emerald-600">✓ Strengths</h2>
                  <ul className="space-y-2">{result.strengths.map((s, i) => <li key={i} className="flex gap-2 text-sm text-gray-700"><span className="mt-0.5 shrink-0 text-emerald-500">●</span><span>{s}</span></li>)}</ul>
                </section>
              )}

              {result.gaps.length > 0 && (
                <section className="rounded-xl border border-amber-100 bg-white p-6 shadow-sm">
                  <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-amber-600">⚠ Gaps</h2>
                  <ul className="space-y-2">{result.gaps.map((g, i) => <li key={i} className="flex gap-2 text-sm text-gray-700"><span className="mt-0.5 shrink-0 text-amber-400">●</span><span>{g}</span></li>)}</ul>
                </section>
              )}

              {/* Missing skills with "Add to profile" buttons (item #3) */}
              {result.missingSkills.length > 0 && (
                <section className="rounded-xl border border-red-100 bg-white p-6 shadow-sm">
                  <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-red-500">Missing Skills</h2>
                  <p className="mb-3 text-xs text-gray-500">Click + to add a missing skill to your Career Profile, then re-run analysis.</p>
                  <div className="flex flex-wrap gap-2">
                    {result.missingSkills.map((s, i) => (
                      <span key={i} className="inline-flex items-center gap-1 rounded-full bg-red-50 pl-3 pr-1 py-0.5 text-sm text-red-700 border border-red-100">
                        {s}
                        <button onClick={() => void handleAddSkillToProfile(s, i)} disabled={busy?.kind === "add-skill" && busy.idx === i} className="ml-1 rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50" aria-label={`Add ${s} to profile`}>{busy?.kind === "add-skill" && busy.idx === i ? "…" : "+"}</button>
                      </span>
                    ))}
                  </div>
                </section>
              )}

              {/* Recommendations with "Add to target skills" buttons (item #4) */}
              {result.recommendations.length > 0 && (
                <section className="rounded-xl border border-brand-100 bg-white p-6 shadow-sm">
                  <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-brand-600">💡 Recommendations</h2>
                  <ol className="space-y-3">
                    {result.recommendations.map((r, i) => (
                      <li key={i} className="flex gap-3 text-sm text-gray-700">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">{i + 1}</span>
                        <span className="flex-1">{r}</span>
                        <button onClick={() => void handleAddRecommendationToTargets(r, i)} disabled={busy?.kind === "add-target" && busy.idx === i} className="shrink-0 rounded-md border border-brand-200 bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700 hover:bg-brand-100 disabled:opacity-50">{busy?.kind === "add-target" && busy.idx === i ? "Adding…" : "+ Target"}</button>
                      </li>
                    ))}
                  </ol>
                </section>
              )}

              {/* Action grid — items #6, #7, #8, #9 */}
              <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Take action</h2>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <button onClick={() => void handleCoverLetter()} disabled={busy?.kind === "cover-letter"} className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-left text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">📝 {busy?.kind === "cover-letter" ? "Generating…" : "Write cover letter"}</button>
                  <button onClick={() => void handleCritique()} disabled={critiquing} className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-left text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">🔍 {critiquing ? "Reviewing…" : "Why am I not getting interviews?"}</button>
                  <button onClick={handleInterviewPrep} className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-left text-sm font-medium text-gray-700 hover:bg-gray-50">🎤 Interview prep questions →</button>
                  <button onClick={() => void handleSaveJob()} disabled={busy?.kind === "save-job"} className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-left text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">⭐ {busy?.kind === "save-job" ? "Saving…" : "Save job to Opportunities"}</button>
                </div>
              </section>

              {/* Cover letter result (item #6) */}
              {coverLetter && (
                <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-semibold text-gray-900">📝 Cover Letter</h2>
                    <button onClick={() => downloadText("cover-letter.txt", `Subject: ${coverLetter.subject}\n\n${coverLetter.body}`)} className="rounded-md border border-gray-200 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50">⬇ Download</button>
                  </div>
                  <p className="text-xs text-gray-500"><strong>Subject:</strong> {coverLetter.subject} <span className="ml-2 text-gray-400">~{coverLetter.word_count} words</span></p>
                  <pre className="whitespace-pre-wrap rounded-lg bg-gray-50 p-4 text-sm text-gray-800">{coverLetter.body}</pre>
                  {coverLetter.tips.length > 0 && (
                    <div className="rounded-lg bg-blue-50 p-3"><p className="mb-1 text-xs font-semibold uppercase tracking-wide text-blue-700">Personalisation tips</p><ul className="space-y-1 text-xs text-blue-800">{coverLetter.tips.map((t, i) => <li key={i}>• {t}</li>)}</ul></div>
                  )}
                </section>
              )}

              {/* Critique result (item #7) */}
              {critique && (
                <section className="rounded-xl border border-purple-200 bg-white p-6 shadow-sm space-y-4">
                  <div className="flex items-baseline justify-between">
                    <h2 className="text-base font-semibold text-gray-900">🔍 Professional Critique</h2>
                    <span className="text-2xl font-bold text-purple-700">{critique.overall_grade}</span>
                  </div>
                  <p className="text-sm text-gray-700">{critique.summary}</p>
                  <p className="text-xs text-gray-500">Interview likelihood: <strong className={critique.interview_likelihood === "high" ? "text-emerald-700" : critique.interview_likelihood === "medium" ? "text-amber-700" : "text-red-700"}>{critique.interview_likelihood}</strong></p>

                  <div>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Resume self-critique</h3>
                    <ul className="space-y-2">{critique.self_critique.map((c, i) => <li key={i} className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm"><div className="flex items-baseline justify-between"><strong className="text-gray-800">{c.issue}</strong><span className={`rounded px-1.5 py-0.5 text-xs font-medium ${c.severity === "critical" ? "bg-red-100 text-red-700" : c.severity === "major" ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-700"}`}>{c.severity}</span></div><p className="mt-1 text-xs text-gray-600">{c.detail}</p><p className="mt-1 text-xs text-emerald-700"><strong>Fix:</strong> {c.fix}</p></li>)}</ul>
                  </div>

                  {critique.market_critique.length > 0 && (
                    <div>
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Market-fit critique</h3>
                      <ul className="space-y-2">{critique.market_critique.map((c, i) => <li key={i} className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm"><div className="flex items-baseline justify-between"><strong className="text-gray-800">{c.issue}</strong><span className={`rounded px-1.5 py-0.5 text-xs font-medium ${c.severity === "critical" ? "bg-red-100 text-red-700" : c.severity === "major" ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-700"}`}>{c.severity}</span></div><p className="mt-1 text-xs text-gray-600">{c.detail}</p><p className="mt-1 text-xs text-emerald-700"><strong>Fix:</strong> {c.fix}</p></li>)}</ul>
                    </div>
                  )}

                  {critique.top_three_actions.length > 0 && (
                    <div className="rounded-lg bg-purple-50 p-4"><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-purple-700">Top 3 actions to take today</p><ol className="space-y-1 text-sm text-purple-900">{critique.top_three_actions.map((a, i) => <li key={i}><strong>{i + 1}.</strong> {a}</li>)}</ol></div>
                  )}
                </section>
              )}

              {/* Rewrite */}
              {!rewriteResult ? (
                <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-6">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div><h2 className="font-semibold text-gray-900">Rewrite resume for this job</h2><p className="mt-0.5 text-sm text-gray-600">AI tailors your resume to match the job description and address the gaps.</p></div>
                    <button onClick={() => void handleRewrite()} disabled={rewriting} className="shrink-0 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">{rewriting ? "Rewriting…" : "✨ Rewrite Resume"}</button>
                  </div>
                </section>
              ) : (
                <section className="rounded-xl border border-emerald-200 bg-white p-6 shadow-sm space-y-4">
                  <h2 className="font-semibold text-gray-900">✨ Rewritten Resume</h2>
                  {rewriteResult.improvements.length > 0 && (
                    <div className="rounded-lg bg-emerald-50 p-4"><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-600">Changes made ({rewriteResult.improvements.length})</p><ul className="space-y-1">{rewriteResult.improvements.map((imp, i) => <li key={i} className="flex gap-2 text-sm text-emerald-800"><span className="mt-0.5 text-emerald-500">✓</span><span>{imp}</span></li>)}</ul></div>
                  )}
                  <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap rounded-xl bg-gray-50 p-4 text-sm text-gray-800">{rewriteResult.rewrittenText}</pre>

                  {/* Item #5 — vault save + 4 export formats */}
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                    <button onClick={() => void handleSaveRewriteToVault()} disabled={busy?.kind === "save-vault"} className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50">{busy?.kind === "save-vault" ? "Saving…" : "💾 Save to Vault"}</button>
                    <button onClick={() => void handleExportRewrite("docx")} disabled={busy?.kind === "export-docx"} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">{busy?.kind === "export-docx" ? "…" : "📄 Word"}</button>
                    <button onClick={() => void handleExportRewrite("pdf")} disabled={busy?.kind === "export-pdf"} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">{busy?.kind === "export-pdf" ? "…" : "📕 PDF"}</button>
                    <button onClick={() => void handleExportRewrite("txt")} disabled={busy?.kind === "export-txt"} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">{busy?.kind === "export-txt" ? "…" : "📝 Text"}</button>
                    <button onClick={() => void handleExportRewrite("ats")} disabled={busy?.kind === "export-ats"} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">{busy?.kind === "export-ats" ? "…" : "🤖 ATS"}</button>
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
