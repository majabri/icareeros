"use client";
/**
 * /resume/generate — Tailored Resume Generator page.
 * feat/jobs-smart-apply Feature 1 client UI.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { GeneratedResume } from "@/app/api/resume/generate/route";
import { saveResumeVersion } from "@/services/ai/resumeService";

export default function TailorResumePage() {
  const router = useRouter();
  const [jobTitle,      setJobTitle]      = useState("");
  const [targetCompany, setTargetCompany] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [busy,     setBusy]     = useState(false);
  const [savedBusy, setSavedBusy] = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [result,   setResult]   = useState<GeneratedResume | null>(null);
  const [showWhy,  setShowWhy]  = useState(false);
  const [saveMsg,  setSaveMsg]  = useState<string | null>(null);

  // fix/jobs-ux-feedback Fix 6 — consume the job-card handoff. Reads
  // tailorResume:incomingJob from sessionStorage and pre-populates the
  // form so the user can immediately click Generate.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = sessionStorage.getItem("tailorResume:incomingJob");
      if (!raw) return;
      const j = JSON.parse(raw) as { title?: string; company?: string; description?: string };
      if (j.title)       setJobTitle(j.title);
      if (j.company)     setTargetCompany(j.company);
      if (j.description) setJobDescription(j.description);
      sessionStorage.removeItem("tailorResume:incomingJob");
    } catch { /* malformed — ignore */ }
  }, []);

  async function handleGenerate() {
    if (!jobTitle.trim() || !targetCompany.trim() || !jobDescription.trim()) {
      setError("All three fields are required.");
      return;
    }
    setBusy(true); setError(null); setResult(null); setSaveMsg(null);
    try {
      const res = await fetch("/api/resume/generate", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobTitle, jobDescription, targetCompany }),
      });
      const data = await res.json().catch(() => ({} as { error?: string }));
      if (!res.ok) throw new Error((data as { error?: string })?.error ?? `Failed (${res.status})`);
      setResult(data as GeneratedResume);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setBusy(false);
    }
  }

  function handleDownloadPdf() {
    if (typeof window !== "undefined") window.print();
  }

  async function handleSaveVersion() {
    if (!result) return;
    setSavedBusy(true); setSaveMsg(null);
    try {
      const versionName = `${jobTitle} @ ${targetCompany}`;
      const resumeText  = serializeResume(result);
      await saveResumeVersion({ versionName, resumeText, jobType: "tailored" });
      setSaveMsg("Saved to your resume vault.");
    } catch (e) {
      setSaveMsg(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSavedBusy(false);
    }
  }

  function handleUseInSmartApply() {
    if (!result) return;
    // Stash the generated resume + JD context so /opportunities' Smart
    // Apply panel can consume it without a round-trip. sessionStorage
    // scoped to this tab; cleared after Smart Apply reads it.
    try {
      sessionStorage.setItem("smartApply:preloadedResume", JSON.stringify(result));
      sessionStorage.setItem("smartApply:preloadedJob", JSON.stringify({
        title: jobTitle, company: targetCompany, description: jobDescription,
      }));
    } catch { /* private mode — non-fatal */ }
    router.push("/opportunities?smartApply=preloaded");
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 space-y-6">
      {/* Print-only CSS — hide chrome, expand result panel */}
      <style jsx global>{`
        @media print {
          nav, header, aside, footer, .no-print { display: none !important; }
          body { background: white; }
          .print-resume { padding: 0 !important; border: none !important; box-shadow: none !important; }
        }
      `}</style>

      <div className="no-print">
        <h1 className="text-2xl font-bold text-gray-900">🎯 Tailor Resume for a Job</h1>
        <p className="mt-1 text-sm text-gray-500">
          Generate a resume tuned to a specific role. Reads your profile, picks the most
          relevant experiences, and rewrites bullets to match the JD.
        </p>
      </div>

      {/* Input form */}
      {!result && (
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm space-y-3 no-print">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-600">Job title</span>
              <input
                type="text"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                placeholder="e.g. Senior Security Engineer"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-600">Target company</span>
              <input
                type="text"
                value={targetCompany}
                onChange={(e) => setTargetCompany(e.target.value)}
                placeholder="e.g. Stripe"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-600">Job description</span>
            <textarea
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              rows={10}
              placeholder="Paste the full job description here…"
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            />
          </label>
          {error && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}
          <div className="flex items-center gap-3">
            <button
              onClick={handleGenerate}
              disabled={busy}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {busy ? `Tailoring your resume for ${jobTitle || "…"} at ${targetCompany || "…"}` : "Generate Tailored Resume"}
            </button>
            <Link href="/evaluate/job-fit" className="text-xs text-gray-500 underline hover:text-gray-700">
              Or run a fit-check first →
            </Link>
          </div>
        </section>
      )}

      {/* Result */}
      {result && (
        <>
          <section className="print-resume rounded-2xl border border-gray-200 bg-white p-8 shadow-sm space-y-5">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">{result.name || "Your Name"}</h2>
              {result.headline && <p className="text-sm text-gray-600">{result.headline}</p>}
              <p className="mt-2 text-xs text-gray-400">Tailored for: {result.targetedFor}</p>
            </div>

            {result.summary && (
              <section>
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-500">Summary</h3>
                <p className="text-sm text-gray-800">{result.summary}</p>
              </section>
            )}

            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Experience</h3>
              <div className="space-y-4">
                {result.experience.map((exp, i) => (
                  <div key={`${exp.company}-${i}`}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-sm font-semibold text-gray-900">{exp.title}</p>
                      <p className="text-xs text-gray-500">{exp.dates}</p>
                    </div>
                    <p className="text-xs text-gray-600">{exp.company}</p>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-gray-700">
                      {exp.bullets.map((b, j) => <li key={j}>{b}</li>)}
                    </ul>
                  </div>
                ))}
              </div>
            </section>

            {result.skills.length > 0 && (
              <section>
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-500">Skills</h3>
                <p className="text-sm text-gray-800">{result.skills.join(" · ")}</p>
              </section>
            )}

            {result.education.length > 0 && (
              <section>
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-500">Education</h3>
                <div className="space-y-1">
                  {result.education.map((ed, i) => (
                    <p key={i} className="text-xs text-gray-700">
                      <span className="font-medium">{ed.degree}</span>, {ed.institution} <span className="text-gray-400">({ed.year})</span>
                    </p>
                  ))}
                </div>
              </section>
            )}
          </section>

          {/* Why these experiences */}
          {result.whyTheseProjects && (
            <section className="no-print rounded-xl border border-brand-200 bg-brand-50/50 p-4">
              <button
                onClick={() => setShowWhy(v => !v)}
                className="flex w-full items-center justify-between text-left text-sm font-medium text-brand-900"
                aria-expanded={showWhy}
              >
                <span>💡 Why these experiences?</span>
                <span aria-hidden>{showWhy ? "▾" : "▸"}</span>
              </button>
              {showWhy && <p className="mt-2 text-sm text-brand-900">{result.whyTheseProjects}</p>}
            </section>
          )}

          {/* Actions */}
          <div className="no-print flex flex-wrap items-center gap-3">
            <button
              onClick={handleDownloadPdf}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            >
              📄 Download as PDF
            </button>
            <button
              onClick={handleSaveVersion}
              disabled={savedBusy}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {savedBusy ? "Saving…" : "💾 Save as Version"}
            </button>
            <button
              onClick={handleUseInSmartApply}
              className="rounded-lg border border-brand-200 bg-brand-50 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-100"
            >
              Use in Smart Apply →
            </button>
            <button
              onClick={() => { setResult(null); setShowWhy(false); }}
              className="text-xs text-gray-500 underline hover:text-gray-700"
            >
              Generate another
            </button>
            {saveMsg && <span className="text-xs text-gray-600">{saveMsg}</span>}
          </div>
        </>
      )}
    </div>
  );
}

// ── Utilities ───────────────────────────────────────────────────────────

function serializeResume(r: GeneratedResume): string {
  const lines: string[] = [];
  if (r.name) lines.push(r.name);
  if (r.headline) lines.push(r.headline);
  lines.push("");
  if (r.summary) { lines.push("SUMMARY"); lines.push(r.summary); lines.push(""); }
  if (r.experience.length) {
    lines.push("EXPERIENCE");
    for (const exp of r.experience) {
      lines.push(`${exp.title} — ${exp.company} (${exp.dates})`);
      for (const b of exp.bullets) lines.push(`  • ${b}`);
      lines.push("");
    }
  }
  if (r.skills.length) { lines.push("SKILLS"); lines.push(r.skills.join(" · ")); lines.push(""); }
  if (r.education.length) {
    lines.push("EDUCATION");
    for (const ed of r.education) lines.push(`${ed.degree} — ${ed.institution} (${ed.year})`);
  }
  return lines.join("\n");
}
