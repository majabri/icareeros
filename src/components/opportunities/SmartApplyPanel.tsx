"use client";
/**
 * SmartApplyPanel — feat/jobs-smart-apply Feature 2.
 *
 * Slide-in guided-apply side panel. NOT auto-apply — the human always
 * clicks the actual application link. This panel pre-populates:
 *   Step 1 — Tailored resume (via /api/resume/generate)
 *   Step 2 — Cover letter (via /api/cover-letter or /api/resume/cover-letter-from-text)
 *   Step 3 — Outreach messages (via /api/outreach — optional)
 *   Step 4 — Opens the job URL + auto-tracks the application
 *
 * Renders as fixed panel on the right (480px on desktop, full-screen on
 * mobile). ESC or click-outside closes. Steps expand/collapse. Progress
 * indicator at the top shows step completion.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { autoTrackApplication } from "./autoTrackApplication";
import type { GeneratedResume } from "@/app/api/resume/generate/route";

export interface SmartApplyJob {
  title:       string;
  company:     string;
  description: string;
  url:         string;
  opportunity_id?: string | null;
}

export interface SmartApplyPanelProps {
  job: SmartApplyJob | null;
  onClose: () => void;
  /** Optional cycle id — attaches applications to a specific Career OS cycle. */
  cycleId?: string | null;
}

export function SmartApplyPanel({ job, onClose, cycleId }: SmartApplyPanelProps) {
  const [resumeStep,   setResumeStep]   = useState<"idle" | "loading" | "done" | "err">("idle");
  const [resume,       setResume]       = useState<GeneratedResume | null>(null);
  const [resumeError,  setResumeError]  = useState<string | null>(null);
  const [coverStep,    setCoverStep]    = useState<"idle" | "loading" | "done" | "err">("idle");
  const [coverLetter,  setCoverLetter]  = useState<{ subject?: string; body?: string } | null>(null);
  const [coverError,   setCoverError]   = useState<string | null>(null);
  const [outreachStep, setOutreachStep] = useState<"idle" | "loading" | "done" | "err">("idle");
  const [outreach,     setOutreach]     = useState<{ linkedin?: string; email?: string; founder?: string } | null>(null);
  const [applied,      setApplied]      = useState(false);
  const [applyMsg,     setApplyMsg]     = useState<string | null>(null);
  const [expanded,     setExpanded]     = useState<Record<string, boolean>>({ r: true, c: true, o: true, a: true });

  // ESC closes
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Consume any pre-loaded resume from /resume/generate → "Use in Smart Apply"
  useEffect(() => {
    if (!job || resume) return;
    try {
      const raw = sessionStorage.getItem("smartApply:preloadedResume");
      if (!raw) return;
      const preloaded = JSON.parse(raw) as GeneratedResume;
      setResume(preloaded);
      setResumeStep("done");
      sessionStorage.removeItem("smartApply:preloadedResume");
      sessionStorage.removeItem("smartApply:preloadedJob");
    } catch { /* stale/private mode — ignore */ }
  }, [job, resume]);

  async function runTailorResume() {
    if (!job) return;
    setResumeStep("loading"); setResumeError(null);
    try {
      const res = await fetch("/api/resume/generate", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobTitle:       job.title,
          jobDescription: job.description,
          targetCompany:  job.company,
        }),
      });
      const data = await res.json().catch(() => ({} as { error?: string }));
      if (!res.ok) throw new Error((data as { error?: string })?.error ?? `Failed (${res.status})`);
      setResume(data as GeneratedResume);
      setResumeStep("done");
    } catch (e) {
      setResumeError(e instanceof Error ? e.message : "Resume tailoring failed");
      setResumeStep("err");
    }
  }

  async function runCoverLetter() {
    if (!job) return;
    setCoverStep("loading"); setCoverError(null);
    try {
      // Use the resume-text-based endpoint since we don't have an
      // opportunity_id we control end-to-end.
      const resumeText = resume ? serializeResumeText(resume) : "";
      const res = await fetch("/api/resume/cover-letter-from-text", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeText, jobDescription: job.description, targetCompany: job.company, jobTitle: job.title }),
      });
      const data = await res.json().catch(() => ({} as { error?: string }));
      if (!res.ok) throw new Error((data as { error?: string })?.error ?? `Failed (${res.status})`);
      setCoverLetter({ subject: (data as { subject?: string }).subject, body: (data as { body?: string }).body });
      setCoverStep("done");
    } catch (e) {
      setCoverError(e instanceof Error ? e.message : "Cover letter generation failed");
      setCoverStep("err");
    }
  }

  async function runOutreach(_variant: "linkedin" | "email" | "founder") {
    if (!job || !job.opportunity_id) {
      setOutreach({ ...(outreach ?? {}), [_variant]: "Outreach requires a saved opportunity id (open the job from your Opportunities list)." });
      setOutreachStep("done");
      return;
    }
    setOutreachStep("loading");
    try {
      const res = await fetch("/api/outreach", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opportunity_id: job.opportunity_id, cycle_id: cycleId ?? null }),
      });
      const data = await res.json().catch(() => ({} as { error?: string }));
      if (!res.ok) throw new Error((data as { error?: string })?.error ?? `Failed (${res.status})`);
      const d = data as { linkedin?: { message?: string }; email?: { message?: string }; variants?: Array<{ id?: string; message?: string }> };
      const founder = d.variants?.find(v => v.id === "referral" || v.id === "founder")?.message;
      setOutreach({
        linkedin: d.linkedin?.message,
        email:    d.email?.message,
        founder,
      });
      setOutreachStep("done");
    } catch {
      setOutreachStep("err");
    }
  }

  async function openApplication() {
    if (!job) return;
    // Open the actual apply URL in a new tab first — user-initiated click
    if (job.url) window.open(job.url, "_blank", "noopener,noreferrer");

    // Auto-track in pipeline. Best-effort — apply URL is the tracking key.
    try {
      await autoTrackApplication({
        job_title:   job.title,
        company:     job.company,
        job_url:     job.url,
        opportunity_id: job.opportunity_id ?? null,
        cycle_id:    cycleId ?? null,
      });
      setApplied(true);
      setApplyMsg("✓ Tracked in pipeline");
    } catch (e) {
      setApplyMsg("Applied — but pipeline sync failed. Check Pipeline manually.");
      // Still mark applied so the button reflects the user's intent
      setApplied(true);
    }
  }

  if (!job) return null;

  return (
    <div className="fixed inset-0 z-40 flex" aria-modal="true" role="dialog" aria-label="Smart Apply">
      {/* Scrim */}
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      {/* Panel — right side, 480px on desktop, full-screen on mobile */}
      <aside
        className="relative ml-auto h-full w-full max-w-[480px] overflow-y-auto bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sticky top-0 z-10 border-b border-gray-200 bg-white px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-gray-900">Smart Apply</h2>
              <p className="mt-0.5 text-xs text-gray-500 truncate">{job.title} @ {job.company}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-300"
              aria-label="Close Smart Apply"
            >
              ✕
            </button>
          </div>
          {/* Progress indicator */}
          <div className="mt-3 flex gap-1">
            <StepDot done={resumeStep === "done"} loading={resumeStep === "loading"} label="Resume" />
            <StepDot done={coverStep  === "done"} loading={coverStep  === "loading"} label="Cover" />
            <StepDot done={outreachStep === "done"} loading={outreachStep === "loading"} label="Outreach" />
            <StepDot done={applied} loading={false} label="Apply" />
          </div>
        </header>

        {/* Step 1 — Resume */}
        <Section title="Step 1 — Your Resume" expanded={expanded.r} onToggle={() => setExpanded(v => ({ ...v, r: !v.r }))}>
          {resumeStep === "loading" && <p className="text-xs text-gray-500">Tailoring your resume…</p>}
          {resumeError && <p className="text-xs text-red-600">{resumeError}</p>}
          {resume ? (
            <div className="space-y-2">
              <p className="text-xs text-green-700">✓ Tailored for {resume.targetedFor}</p>
              <p className="text-xs text-gray-600 line-clamp-3">{resume.summary}</p>
              <Link href="/resume/generate" className="text-xs text-brand-700 underline hover:text-brand-800">Open full editor →</Link>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void runTailorResume()}
              disabled={resumeStep === "loading"}
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              Tailor Resume for this role
            </button>
          )}
        </Section>

        {/* Step 2 — Cover Letter */}
        <Section title="Step 2 — Cover Letter" expanded={expanded.c} onToggle={() => setExpanded(v => ({ ...v, c: !v.c }))}>
          {coverStep === "loading" && <p className="text-xs text-gray-500">Generating…</p>}
          {coverError && <p className="text-xs text-red-600">{coverError}</p>}
          {coverLetter ? (
            <div className="space-y-2">
              {coverLetter.subject && <p className="text-xs font-medium text-gray-700">Subject: {coverLetter.subject}</p>}
              <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded border border-gray-200 bg-gray-50 p-2 text-[11px] text-gray-700">{coverLetter.body ?? ""}</pre>
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(`${coverLetter.subject ? "Subject: " + coverLetter.subject + "\n\n" : ""}${coverLetter.body ?? ""}`)}
                className="text-xs text-brand-700 underline hover:text-brand-800"
              >
                Copy
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void runCoverLetter()}
              disabled={coverStep === "loading"}
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              Generate Cover Letter
            </button>
          )}
        </Section>

        {/* Step 3 — Outreach */}
        <Section title="Step 3 — Outreach (optional)" expanded={expanded.o} onToggle={() => setExpanded(v => ({ ...v, o: !v.o }))}>
          {outreachStep === "loading" && <p className="text-xs text-gray-500">Generating…</p>}
          {!outreach && (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void runOutreach("linkedin")} className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs">LinkedIn Note</button>
              <button type="button" onClick={() => void runOutreach("email")}    className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs">Cold Email</button>
              <button type="button" onClick={() => void runOutreach("founder")}  className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs">Founder Message</button>
            </div>
          )}
          {outreach && (
            <div className="space-y-3">
              {outreach.linkedin && <OutreachPreview label="LinkedIn Note" body={outreach.linkedin} />}
              {outreach.email    && <OutreachPreview label="Cold Email"    body={outreach.email} />}
              {outreach.founder  && <OutreachPreview label="Founder Msg"   body={outreach.founder} />}
            </div>
          )}
        </Section>

        {/* Step 4 — Apply */}
        <Section title="Step 4 — Apply" expanded={expanded.a} onToggle={() => setExpanded(v => ({ ...v, a: !v.a }))}>
          {!applied ? (
            <button
              type="button"
              onClick={() => void openApplication()}
              className="w-full rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            >
              Open Application →
            </button>
          ) : (
            <p className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800">{applyMsg}</p>
          )}
        </Section>
      </aside>
    </div>
  );
}

// ── Helper components ───────────────────────────────────────────────────

function Section({ title, expanded, onToggle, children }: { title: string; expanded: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <section className="border-b border-gray-100">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-5 py-3 text-left text-sm font-medium text-gray-900 hover:bg-gray-50"
        aria-expanded={expanded}
      >
        {title}
        <span aria-hidden>{expanded ? "▾" : "▸"}</span>
      </button>
      {expanded && <div className="px-5 pb-4 space-y-2">{children}</div>}
    </section>
  );
}

function StepDot({ done, loading, label }: { done: boolean; loading: boolean; label: string }) {
  const color = done ? "bg-green-500" : loading ? "bg-brand-500 animate-pulse" : "bg-gray-300";
  return (
    <div className="flex flex-1 items-center gap-1.5" title={label}>
      <span className={`h-1.5 flex-1 rounded ${color}`} aria-label={`${label} ${done ? "complete" : loading ? "in progress" : "pending"}`} />
    </div>
  );
}

function OutreachPreview({ label, body }: { label: string; body: string }) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium text-gray-700">{label}</p>
        <button
          type="button"
          onClick={() => navigator.clipboard?.writeText(body)}
          className="text-[11px] text-brand-700 underline hover:text-brand-800"
        >
          Copy
        </button>
      </div>
      <pre className="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap rounded border border-gray-200 bg-gray-50 p-2 text-[11px] text-gray-700">{body}</pre>
    </div>
  );
}

// ── Local util ──────────────────────────────────────────────────────────
function serializeResumeText(r: GeneratedResume): string {
  const lines: string[] = [];
  if (r.name)     lines.push(r.name);
  if (r.headline) lines.push(r.headline);
  if (r.summary)  { lines.push(""); lines.push(r.summary); }
  for (const exp of r.experience) {
    lines.push("");
    lines.push(`${exp.title} — ${exp.company} (${exp.dates})`);
    for (const b of exp.bullets) lines.push(`• ${b}`);
  }
  if (r.skills.length) { lines.push(""); lines.push("Skills: " + r.skills.join(", ")); }
  return lines.join("\n");
}
