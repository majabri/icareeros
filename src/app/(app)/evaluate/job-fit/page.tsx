/**
 * /evaluate/job-fit — Job Application Fit (Evaluate stage)
 *
 * Consolidation of the former /resumeadvisor (Advise) + /fit-check (Evaluate)
 * pages per the 2026-05-26 Option-1 rationalization. Compare your profile or
 * an alternate resume against a specific job description. Output:
 *
 *   1. Fit score + strengths / gaps / missing skills / recommendations
 *   2. One-click "add missing skills to Career Profile"
 *   3. One-click "add recommendations to Target Skills" (Learn stage handoff)
 *   4. Rewrite resume → Save to Vault + Export DOCX / PDF / TXT / ATS
 *   5. Generate Cover Letter
 *   6. Professional Critique — "why no interviews" (combined self + market)
 *   7. Interview Prep Questions (links to /interview with this JD)
 *   8. Save Job to Opportunities (writes opportunities row)
 *   9. LinkedIn rewrite advice
 *
 * Sister page: /evaluate/goal — compares profile against the user's TARGET
 * career role(s) instead of a specific JD.
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
import { ResumeUploadConsent } from "@/components/legal/ResumeUploadConsent";
import { recordResumeUploadConsent } from "@/app/actions/consentActions";

interface FitBreakdown {
  skillsCoverage: number;
  seniorityFit: "match" | "overqualified" | "underqualified" | "unknown";
  locationFit:  "match" | "remote_ok" | "mismatch" | "unknown";
  experienceFit: number;
  redFlagsFound: string[];
}

interface KeywordCoverage {
  covered: string[];
  missing: string[];
  coverageScore: number;
}

interface FitCheckResult {
  fitScore: number;
  summary: string;
  strengths: string[];
  gaps: string[];
  missingSkills: string[];
  recommendations: string[];
  breakdown?: FitBreakdown;
  keywordCoverage?: KeywordCoverage;
  /** 2026-06-28 — semantic similarity (0-100) from pgvector + OpenAI
   *  text-embedding-3-small. Null when OPENAI_API_KEY is unset. */
  semanticScore?: number | null;
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

interface LinkedInAdviceResult {
  resumeGaps: string[];
  bulletRewrites: Array<{ original: string; revised: string; rationale: string }>;
  linkedinHeadline: string;
  linkedinAbout: string;
  linkedinTopSkills: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// 2026-06-19 (Brief Task 2) — small labeled bar for breakdown sub-scores.
function BreakdownBar({ label, value }: { label: string; value: number }) {
  const v = Math.max(0, Math.min(100, value));
  const color = v >= 70 ? "#10B981" : v >= 50 ? "#F5A623" : "#FF6B6B";
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-medium text-gray-600">{label}</span>
        <span className="text-xs font-bold text-gray-900">{v}</span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${v}%`, background: color }}
        />
      </div>
    </div>
  );
}

// 2026-06-19 (Brief Task 2) — categorical breakdown chip.
function BreakdownTag({
  label,
  value,
}: {
  label: string;
  value: "match" | "overqualified" | "underqualified" | "remote_ok" | "mismatch" | "unknown";
}) {
  const text =
    value === "match" ? "Match" :
    value === "overqualified" ? "Overqualified" :
    value === "underqualified" ? "Underqualified" :
    value === "remote_ok" ? "Remote OK" :
    value === "mismatch" ? "Mismatch" :
    "Unknown";
  const color =
    value === "match" || value === "remote_ok" ? "#10B981" :
    value === "mismatch" || value === "underqualified" ? "#FF6B6B" :
    value === "overqualified" ? "#F5A623" :
    "#9CA3AF";
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-medium text-gray-600">{label}</span>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
          style={{ color, background: color + "1A" }}
        >
          {text}
        </span>
      </div>
    </div>
  );
}

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

  // 2026-05-14 — Job URL fetch state. When jobSource === "url" we resolve
  // the URL server-side once (via /api/resume/fetch-job-url) and cache the
  // resulting text in `urlFetchedJD`. All downstream actions (fit-check /
  // rewrite / critique / cover letter) then use the SAME resolved text so
  // we don't re-fetch on every action and so they all see identical JDs.
  const [urlFetching,   setUrlFetching]   = useState(false);
  const [urlFetchedJD,  setUrlFetchedJD]  = useState<string | null>(null);
  const [urlFetchMeta,  setUrlFetchMeta]  = useState<{
    title?: string; company?: string; location?: string; source: string;
  } | null>(null);
  const [urlFetchError, setUrlFetchError] = useState<string | null>(null);
  // Fix 5 (2026-06-27) — suspicious-content warning. Set when the fetcher
  // returned ok:true but the content looks like a login wall or is too short
  // to be a real job description. UI shows an amber banner + "Paste manually"
  // CTA so the user can bail before feeding junk to the LLM.
  const [urlWarning,    setUrlWarning]    = useState<string | null>(null);

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

  // LinkedIn & Resume advice state (2026-05-21 rebrand)
  const [linkedinAdvice, setLinkedinAdvice] = useState<LinkedInAdviceResult | null>(null);
  const [linkedinAdvising, setLinkedinAdvising] = useState(false);
  const [linkedinAdviceError, setLinkedinAdviceError] = useState<string | null>(null);

  // Critique state (item #7)
  const [critiquing, setCritiquing] = useState(false);
  const [critique, setCritique] = useState<CritiqueResult | null>(null);

  // Cover letter state (item #6)
  const [coverLetter, setCoverLetter] = useState<CoverLetterResult | null>(null);

  // ── UAT 2026-05-10: persistent inline status for each action ───────────
  // Toasts auto-dismissed after 4s and users missed errors. These render
  // inline on the page until cleared or replaced.
  const [coverLetterError, setCoverLetterError] = useState<string | null>(null);
  const [critiqueError, setCritiqueError] = useState<string | null>(null);
  const [saveJobStatus, setSaveJobStatus] = useState<
    { kind: "ok"; opportunityId: string } | { kind: "err"; message: string } | null
  >(null);

  // ── UAT 2026-05-10: profile mutations dirty the fit score ──────────────
  // Set true after Add-to-profile / Add-to-target so the user sees an
  // explicit "Re-analyze" CTA rather than the now-stale score. We don't
  // auto-rerun to avoid burning LLM tokens on every click.
  const [analysisDirty, setAnalysisDirty] = useState(false);

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

  // Hand-off banner: when arriving from /jobs we show "From <Company> — <Title>"
  // above the JD textarea so the user knows what they're analyzing.
  const [incomingJob, setIncomingJob] = useState<{
    title: string; company: string; location: string; url: string;
  } | null>(null);

  /**
   * On mount: if /jobs handed off an opportunity via sessionStorage, hydrate
   * the JD field from it and surface a banner. Once consumed we clear the
   * key so a manual refresh starts clean.
   */
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = sessionStorage.getItem("resumeAdvisor:incomingJob");
      if (!raw) return;
      const j = JSON.parse(raw) as {
        title?: string; company?: string; location?: string;
        description?: string; url?: string;
      };
      if (j?.description && j.description.trim().length > 0) {
        setJobSource("paste");
        setJobDescription(j.description);
        setIncomingJob({
          title:    j.title    || "",
          company:  j.company  || "",
          location: j.location || "",
          url:      j.url      || "",
        });
      }
      sessionStorage.removeItem("resumeAdvisor:incomingJob");
    } catch { /* malformed payload — ignore */ }
  }, []);

  const handleFile = useCallback((file: File) => {
    setUploadedFile(file);
    setResult(null); setRewriteResult(null); setError(null);
    setParsedFromUpload(null); setShowProfileUpdatePrompt(false);
    setCritique(null); setCoverLetter(null);
    // Phase 3: record resume_upload consent (audit trail row per upload event)
    if (userId) {
      void recordResumeUploadConsent({ userId });
    }
  }, [userId]);

  // ── Phase 3: Resume upload consent gating ──────────────────────────
  const [showResumeConsent, setShowResumeConsent] = useState(false);
  const [pendingDroppedFile, setPendingDroppedFile] = useState<File | null>(null);

  const requestUpload = useCallback((file?: File) => {
    setPendingDroppedFile(file ?? null);
    setShowResumeConsent(true);
  }, []);

  const onResumeConsentAccept = useCallback(() => {
    setShowResumeConsent(false);
    if (pendingDroppedFile) {
      handleFile(pendingDroppedFile);
      setPendingDroppedFile(null);
    } else {
      fileInputRef.current?.click();
    }
  }, [pendingDroppedFile, handleFile]);

  const onResumeConsentDecline = useCallback(() => {
    setShowResumeConsent(false);
    setPendingDroppedFile(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) requestUpload(file);
  }, [requestUpload]);


  const effectiveJob = jobSource === "paste" ? jobDescription.trim() : jobUrl.trim();
  const hasResume = resumeSource === "upload" ? !!uploadedFile : !!selectedVersion;
  const hasJob = effectiveJob.length > 10;
  const canCheck = hasResume && hasJob && !checking;

  // ── Fit check ──────────────────────────────────────────────────────────
  /**
   * Resolve the JD text the LLM will see. For "paste" mode it's the
   * textarea value. For "url" mode we (a) use a cached fetch if we
   * already resolved this URL, otherwise (b) call /api/resume/fetch-job-url
   * to scrape it. Sets urlFetchMeta + urlFetchError so the UI can show a
   * confirmation banner or an inline error. Returns null if we couldn't
   * resolve a usable JD (caller should abort).
   */
  async function resolveJobText(): Promise<string | null> {
    if (jobSource === "paste") {
      const t = jobDescription.trim();
      if (!t) {
        setError("Paste a job description first.");
        return null;
      }
      return t;
    }
    // url mode
    const url = jobUrl.trim();
    if (!url) {
      setError("Paste a job URL first.");
      return null;
    }
    // Use cached fetch if URL hasn't changed
    if (urlFetchedJD && urlFetchMeta) return urlFetchedJD;

    setUrlFetching(true);
    setUrlFetchError(null);
    setUrlWarning(null);
    try {
      const res = await fetch("/api/resume/fetch-job-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const j = await res.json() as {
        ok?: boolean; error?: string; source?: string;
        title?: string; company?: string; location?: string; description?: string;
      };
      if (!res.ok || j.ok === false || !j.description) {
        const msg = j.error ?? `Fetch failed: HTTP ${res.status}`;
        setUrlFetchError(msg);
        setError(msg);
        return null;
      }
      setUrlFetchedJD(j.description);
      setUrlFetchMeta({
        title:    j.title,
        company:  j.company,
        location: j.location,
        source:   j.source ?? "html",
      });
      // Fix 5 — suspicious content sanity check at the page layer. Even when
      // the server says ok:true, the description may still look like a login
      // wall (short body, cookie-banner phrases). Warn the user before they
      // analyze.
      const desc = j.description ?? "";
      const descLower = desc.toLowerCase();
      // 2026-06-28 (fix/jobs-fetch-jd-jsonld) — raised threshold from 300
      // to 500 + added "javascript is required" check. Real job postings
      // are routinely 800-3000 chars; sub-500 means the fetcher likely
      // hit a JS shell, expired listing, or container-stripped fragment.
      const isSuspicious =
        desc.length < 500 ||
        descLower.includes("sign in") ||
        descLower.includes("cookie policy") ||
        descLower.includes("javascript is required") ||
        descLower.includes("job you are trying to apply for has been filled") ||
        descLower.includes("posting is no longer");
      if (isSuspicious) {
        setUrlWarning(
          "We fetched some text but it may not be a real job description. Review it below before analyzing, or paste the job description manually.",
        );
      }
      return j.description;
    } catch (e) {
      const msg = (e as Error).message;
      setUrlFetchError(msg);
      setError(msg);
      return null;
    } finally {
      setUrlFetching(false);
    }
  }

  async function handleCheck() {
    setChecking(true); setError(null); setResult(null); setRewriteResult(null);
    setCritique(null); setCoverLetter(null);
    // UAT 2026-05-10: clear stale inline statuses so a fresh check starts clean.
    setCoverLetterError(null); setCritiqueError(null); setSaveJobStatus(null);
    setAnalysisDirty(false);
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

      // 2026-05-14 — URL mode: resolve the URL to real job text via the
      // server route. Previously this passed only "Job URL: <url>" to the
      // LLM, which had no way to fetch and produced nonsense analyses.
      const jobText = await resolveJobText();
      if (jobText === null) { setChecking(false); return; }
      // 2026-06-29 (fix/jobs-fit-check-wiring Fix A) — call the Next.js
      // API route instead of the Supabase edge function. The Next route
      // returns the enriched B1 shape (fitScore + breakdown + keywordCoverage
      // + recommendations + semanticScore from PR #334) that the UI's
      // BreakdownBar / BreakdownTag / keyword-coverage section need to render.
      // The edge function only returned the legacy 4-field shape, leaving
      // the new components without data.
      const res = await fetch("/api/resume/fit-check", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ resumeText, jobDescription: jobText }),
      });
      const data = await res.json().catch(() => ({} as { error?: string }));
      if (!res.ok) throw new Error((data as { error?: string })?.error ?? `Fit check failed (HTTP ${res.status})`);
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
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
    // 2026-05-14 — pass real JD text. For "url" mode this uses the cached
    // fetch from /api/resume/fetch-job-url so we don't re-fetch on every
    // downstream action.
    const jd = jobSource === "url" ? urlFetchedJD : jobDescription.trim();
    setRewriting(true);
    try {
      const rr = await rewriteResume({
        resumeText: resolvedResumeText,
        jobDescription: jd && jd.length > 0 ? jd : undefined,
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
      // UAT fix: optimistically remove from missing-skill list so the chip
      // disappears, and mark the score as needing a re-run.
      setResult(prev => prev
        ? { ...prev, missingSkills: prev.missingSkills.filter(s => s !== skill) }
        : prev);
      setAnalysisDirty(true);
      setToast({ kind: "ok", text: `Added "${skill}" to your profile.` });
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
      // UAT fix: optimistically remove from recommendations and dirty score.
      setResult(prev => prev
        ? { ...prev, recommendations: prev.recommendations.filter(x => x !== rec) }
        : prev);
      setAnalysisDirty(true);
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
    setCoverLetterError(null);
    if (!resolvedResumeText) {
      setCoverLetterError("Run the fit analysis first so we have your resume text.");
      return;
    }
    // 2026-05-14 — URL mode now uses the real fetched JD (cached by
    // resolveJobText() / handleCheck). Falls back to triggering a fresh
    // fetch if the user clicks Cover Letter before running Fit Analysis.
    let jdForCoverLetter: string;
    if (jobSource === "paste") {
      jdForCoverLetter = jobDescription.trim();
    } else {
      const resolved = await resolveJobText();
      jdForCoverLetter = resolved ?? "";
    }
    if (!jdForCoverLetter) {
      setCoverLetterError("Paste a job description or job URL above first.");
      return;
    }
    setBusy({ kind: "cover-letter" });
    try {
      const r = await fetch("/api/resume/cover-letter-from-text", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeText: resolvedResumeText, jobDescription: jdForCoverLetter }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.error ?? `Cover letter failed (${r.status})`);
      }
      const cl = (await r.json()) as CoverLetterResult;
      setCoverLetter(cl);
    } catch (e) {
      setCoverLetterError(e instanceof Error ? e.message : "Cover letter failed");
    } finally { setBusy(null); }
  }

  // ── Item #7: professional critique ─────────────────────────────────────
  // LinkedIn & Resume advice — calls /api/resume/linkedin-advice
  async function handleLinkedinAdvice() {
    setLinkedinAdviceError(null);
    if (!resolvedResumeText) {
      setLinkedinAdviceError("Run the fit analysis first so we have your resume text.");
      return;
    }
    const targetRole = jobSource === "url"
      ? (urlFetchedJD ?? "").trim()
      : jobDescription.trim();
    if (!targetRole) {
      setLinkedinAdviceError("Add a target job description above first (paste it, or fetch from a URL).");
      return;
    }
    setLinkedinAdvising(true);
    setLinkedinAdvice(null);
    try {
      const r = await fetch("/api/resume/linkedin-advice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeText: resolvedResumeText, targetRole }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({} as { error?: string }));
        throw new Error(e.error ?? `Advice failed (${r.status})`);
      }
      const d = (await r.json()) as LinkedInAdviceResult;
      setLinkedinAdvice(d);
    } catch (e) {
      setLinkedinAdviceError(e instanceof Error ? e.message : "Could not load LinkedIn advice");
    } finally {
      setLinkedinAdvising(false);
    }
  }

  async function handleCritique() {
    setCritiqueError(null);
    if (!resolvedResumeText) {
      setCritiqueError("Run the fit analysis first so we have your resume text.");
      return;
    }
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
      // UAT fix: persistent inline error rather than transient toast.
      setCritiqueError(e instanceof Error ? e.message : "Critique failed");
    } finally { setCritiquing(false); }
  }

  // ── Item #8: interview prep questions (link out) ───────────────────────
  function handleInterviewPrep() {
    // UAT fix 2026-05-10: persist BOTH the JD and the resume text so /interview
    // can pre-fill its setup form. The interview page reads sessionStorage on
    // mount and clears the keys after consuming.
    if (typeof window !== "undefined") {
      try {
        // 2026-05-14 — URL mode now uses the real fetched JD when available.
        // The interview page can do far better setup with the actual JD than
        // with just a URL string.
        const jdForInterview = jobSource === "paste"
          ? jobDescription
          : (urlFetchedJD ?? (jobUrl ? `Job URL: ${jobUrl}` : ""));
        if (jdForInterview) sessionStorage.setItem("interviewPrep:jd", jdForInterview);
        if (resolvedResumeText) sessionStorage.setItem("interviewPrep:resume", resolvedResumeText);
      } catch { /* sessionStorage may be unavailable in some environments */ }
    }
    window.location.href = "/interview";
  }

  // ── Item #9: save job to opportunities ─────────────────────────────────
  // UAT fix 2026-05-10: the previous version only inserted into the SHARED
  // `opportunities` table (no user_id column), so saved jobs never surfaced
  // in any user-facing list. Now also writes `user_opportunity_matches`
  // with is_saved=true, which is what /jobs reads to render saved-jobs.
  async function handleSaveJob() {
    setSaveJobStatus(null);
    if (!userId) {
      setSaveJobStatus({ kind: "err", message: "Sign in to save jobs." });
      return;
    }
    const hasPaste = jobSource === "paste" && jobDescription.trim().length > 0;
    const hasUrl   = jobSource === "url"   && jobUrl.trim().length > 0;
    if (!hasPaste && !hasUrl) {
      setSaveJobStatus({ kind: "err", message: "Paste a job description or job URL above first." });
      return;
    }
    setBusy({ kind: "save-job" });
    try {
      // Derive a title — first non-blank line of pasted text, or last path
      // segment of the URL. Company stays "Manual entry" until the user
      // edits it from the saved-jobs view.
      let titleGuess = "Saved opportunity";
      if (hasPaste) {
        const firstLine = jobDescription.split("\n").map(s => s.trim()).find(Boolean);
        if (firstLine) titleGuess = firstLine.slice(0, 80);
      } else if (hasUrl) {
        try {
          const u = new URL(jobUrl);
          const last = u.pathname.split("/").filter(Boolean).pop();
          titleGuess = (last && decodeURIComponent(last).replace(/[-_]+/g, " ")) || u.hostname;
          titleGuess = titleGuess.slice(0, 80);
        } catch { /* malformed URL — fall through to default */ }
      }

      const { data: oppRow, error: oppErr } = await supabase
        .from("opportunities")
        .insert({
          title: titleGuess,
          company: "Manual entry",
          description: hasPaste ? jobDescription : null,
          url: hasUrl ? jobUrl.trim() : null,
          source: "manual",
          source_id: `manual-${userId}-${Date.now()}`,
          is_active: true,
        })
        .select("id")
        .single();
      if (oppErr) throw new Error(oppErr.message);

      // Link to user — this is the row /jobs reads when listing saved jobs.
      const { error: matchErr } = await supabase
        .from("user_opportunity_matches")
        .insert({
          user_id: userId,
          opportunity_id: oppRow.id,
          is_saved: true,
        });
      if (matchErr) throw new Error(matchErr.message);

      setSaveJobStatus({ kind: "ok", opportunityId: oppRow.id });
    } catch (e) {
      setSaveJobStatus({ kind: "err", message: e instanceof Error ? e.message : "Save failed" });
    } finally { setBusy(null); }
  }

  return (
    <>
      {showResumeConsent && (
        <ResumeUploadConsent onAccept={onResumeConsentAccept} onDecline={onResumeConsentDecline} />
      )}
    <div className="min-h-screen">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">🎯 Job Application Fit</h1>
          <p className="mt-1 text-sm text-gray-500">
            Check how well your resume matches a specific job description.
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
              <>
                {/* File input rendered as a sibling of the drop-zone, not a child.
                    Programmatic .click() bubbles a synthetic click event — if the
                    input were nested inside the onClick={() => requestUpload()}
                    div, accepting consent would re-trigger consent. */}
                <input ref={fileInputRef} type="file" accept=".pdf,.docx,.doc,.txt" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
                <div onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={handleDrop} onClick={() => requestUpload()} className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 ${dragOver ? "border-brand-400 bg-brand-50" : uploadedFile ? "border-emerald-300 bg-emerald-50" : "border-gray-300 bg-gray-50 hover:border-brand-300"}`}>
                  <span className="mb-2 text-2xl">{uploadedFile ? "✅" : "📄"}</span>
                  {uploadedFile ? <p className="font-medium text-gray-800">{uploadedFile.name}</p> : <><p className="font-medium text-gray-700">Drop your resume here</p><p className="mt-1 text-xs text-gray-400">PDF, Word (.doc, .docx), or TXT · click to browse</p></>}
                </div>
              </>
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

            {/* Banner shown when /jobs handed off this opportunity */}
            {incomingJob && (
              <div className="mb-4 flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                <span aria-hidden="true">🎯</span>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">
                    Analyzing fit for {incomingJob.title || "this role"}
                    {incomingJob.company ? ` at ${incomingJob.company}` : ""}
                  </div>
                  <div className="text-xs text-emerald-800/80">
                    Loaded from Opportunities{incomingJob.location ? ` · ${incomingJob.location}` : ""}.
                    Edit the description below if you need to refine it.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => { setIncomingJob(null); setJobDescription(""); }}
                  className="rounded-md p-1 text-emerald-700 hover:bg-emerald-100"
                  aria-label="Dismiss handed-off job and start fresh"
                  title="Clear and start fresh"
                >
                  ✕
                </button>
              </div>
            )}

            <div className="mb-4 flex rounded-lg border border-gray-200 bg-gray-50 p-1">
              <button onClick={() => { setJobSource("paste"); setResult(null); }} className={`flex-1 rounded-md py-2 text-sm font-medium ${jobSource === "paste" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>✏️ Paste description</button>
              <button onClick={() => { setJobSource("url"); setResult(null); }} className={`flex-1 rounded-md py-2 text-sm font-medium ${jobSource === "url" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>🔗 Job URL</button>
            </div>
            {jobSource === "paste" ? <textarea value={jobDescription} onChange={(e) => { setJobDescription(e.target.value); setResult(null); }} placeholder="Paste the full job description here…" rows={8} className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:border-brand-400 focus:ring-2 focus:ring-brand-100" />
            : <div className="space-y-2">
                <input
                  type="url"
                  value={jobUrl}
                  onChange={(e) => {
                    setJobUrl(e.target.value);
                    setResult(null);
                    // 2026-05-14 — invalidate any cached fetch when the URL changes
                    setUrlFetchedJD(null);
                    setUrlFetchMeta(null);
                    setUrlFetchError(null);
                    setUrlWarning(null);
                  }}
                  placeholder="https://boards.greenhouse.io/<company>/jobs/<id> · jobs.lever.co/... · job posting URL"
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                />
                {urlFetching && (
                  <p className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
                    Fetching job description from URL…
                  </p>
                )}
                {urlFetchMeta && !urlFetchError && !urlWarning && (
                  <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                    <span className="font-semibold">✓ Fetched ({urlFetchMeta.source}):</span>{" "}
                    {urlFetchMeta.title || "job description"}
                    {urlFetchMeta.company && <> · <span className="font-medium">{urlFetchMeta.company}</span></>}
                    {urlFetchMeta.location && <> · {urlFetchMeta.location}</>}
                  </div>
                )}
                {urlWarning && (
                  <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 flex items-start gap-3">
                    <span className="shrink-0">⚠</span>
                    <div className="flex-1">{urlWarning}</div>
                    <button
                      type="button"
                      onClick={() => {
                        setJobSource("paste");
                        setUrlWarning(null);
                      }}
                      className="shrink-0 rounded-md border border-amber-300 bg-white px-2 py-1 text-[11px] font-medium text-amber-900 hover:bg-amber-100"
                    >
                      Paste manually instead
                    </button>
                  </div>
                )}
                {urlFetchError && (
                  <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    Couldn\'t fetch the URL: {urlFetchError}. Paste the job description manually instead.
                  </p>
                )}
              </div>}
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

                  {/* 2026-06-19 (Brief Task 2) — explainable fit breakdown */}
                  {result.breakdown && (
                    <div className="mt-4 grid w-full gap-2 sm:grid-cols-2">
                      <BreakdownBar
                        label="Skills coverage"
                        value={result.breakdown.skillsCoverage}
                      />
                      <BreakdownBar
                        label="Experience fit"
                        value={result.breakdown.experienceFit}
                      />
                      {/* 2026-06-28 (Brief Task 2) — pgvector semantic similarity.
                          Renders only when the backend returned a non-null value
                          (i.e. OPENAI_API_KEY is configured and embeddings ran). */}
                      {typeof result.semanticScore === "number" && (
                        <BreakdownBar
                          label="Semantic match"
                          value={result.semanticScore}
                        />
                      )}
                      <BreakdownTag
                        label="Seniority"
                        value={result.breakdown.seniorityFit}
                      />
                      <BreakdownTag
                        label="Location"
                        value={result.breakdown.locationFit}
                      />
                      {result.breakdown.redFlagsFound.length > 0 && (
                        <div className="sm:col-span-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                          <strong className="font-semibold">JD red flags:</strong>{" "}
                          {result.breakdown.redFlagsFound.join(", ")}
                        </div>
                      )}
                    </div>
                  )}
                  <div className="flex-1"><h2 className="mb-2 text-base font-semibold text-gray-900">Overall Assessment</h2><p className="text-sm leading-relaxed text-gray-700">{result.summary}</p></div>
                </div>
              </section>

              {result.strengths.length > 0 && (
                <section className="rounded-xl border border-emerald-100 bg-white p-6 shadow-sm">
                  <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-emerald-600">✓ Strengths</h2>
                  <ul className="space-y-2">{result.strengths.map((s, i) => <li key={i} className="flex gap-2 text-sm text-gray-700"><span className="mt-0.5 shrink-0 text-emerald-500">●</span><span>{s}</span></li>)}</ul>
                </section>
              )}

              {/* UAT 2026-05-10: profile mutated since this score was computed */}
              {analysisDirty && (
                <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 flex items-center justify-between gap-3">
                  <span>
                    <strong>Score may be outdated.</strong> You changed your profile or target skills since this analysis ran.
                  </span>
                  <button
                    onClick={() => void handleCheck()}
                    disabled={checking}
                    className="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                  >
                    {checking ? "Re-analyzing…" : "Re-analyze"}
                  </button>
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

              {/* 2026-06-19 (Brief Task 17) — keyword coverage tag clouds */}
              {result.keywordCoverage && (result.keywordCoverage.covered.length > 0 || result.keywordCoverage.missing.length > 0) && (
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500">
                      Keyword coverage
                    </h3>
                    <span className="text-xs font-semibold text-gray-600">
                      {result.keywordCoverage.coverageScore}%
                    </span>
                  </div>
                  {result.keywordCoverage.covered.length > 0 && (
                    <div className="mb-2">
                      <p className="mb-1 text-[11px] text-gray-500">Covered</p>
                      <ul className="flex flex-wrap gap-1.5">
                        {result.keywordCoverage.covered.map((k, i) => (
                          <li
                            key={`c-${i}`}
                            className="rounded-full border border-teal-300 bg-teal-50 px-2.5 py-0.5 text-[11px] font-medium text-teal-700"
                          >
                            {k}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {result.keywordCoverage.missing.length > 0 && (
                    <div>
                      <p className="mb-1 text-[11px] text-gray-500">Missing</p>
                      <ul className="flex flex-wrap gap-1.5">
                        {result.keywordCoverage.missing.map((k, i) => (
                          <li
                            key={`m-${i}`}
                            className="rounded-full border px-2.5 py-0.5 text-[11px] font-medium"
                            style={{
                              borderColor: "#FF6B6B55",
                              background:  "#FF6B6B0D",
                              color:       "#FF6B6B",
                            }}
                          >
                            {k}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
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

              {/* Action grid — items #6, #7, #8, #9 + Apply (UAT 2026-05-11) */}
              <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Take action</h2>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <button onClick={() => void handleLinkedinAdvice()} disabled={linkedinAdvising} className="rounded-lg border border-brand-300 bg-brand-50 px-4 py-3 text-left text-sm font-semibold text-brand-700 hover:bg-brand-100 disabled:opacity-50">💼 {linkedinAdvising ? "Analysing…" : "Get LinkedIn & resume advice"}</button>
                  <button onClick={() => void handleCoverLetter()} disabled={busy?.kind === "cover-letter"} className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-left text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">📝 {busy?.kind === "cover-letter" ? "Generating…" : "Write cover letter"}</button>
                  <button onClick={() => void handleCritique()} disabled={critiquing} className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-left text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">🔍 {critiquing ? "Reviewing…" : "Why am I not getting interviews?"}</button>
                  <button onClick={handleInterviewPrep} className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-left text-sm font-medium text-gray-700 hover:bg-gray-50">🎤 Interview prep questions →</button>
                  <button onClick={() => void handleSaveJob()} disabled={busy?.kind === "save-job"} className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-left text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">⭐ {busy?.kind === "save-job" ? "Saving…" : "Save job to Opportunities"}</button>
                </div>
                {linkedinAdviceError && (
                  <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{linkedinAdviceError}</p>
                )}

                {/* Apply CTA — visible when the analyzed JD has a URL or
                    the resume advisor was opened from an Opportunities card.
                    Renders full-width below the action grid. (Amir 2026-05-11) */}
                {(() => {
                  const applyUrl = (jobSource === "url" && jobUrl.trim())
                    ? jobUrl.trim()
                    : (incomingJob?.url || "");
                  if (!applyUrl) return null;
                  let hostLabel = "";
                  try { hostLabel = new URL(applyUrl).hostname.replace(/^www\./, ""); } catch { hostLabel = ""; }
                  return (
                    <a
                      href={applyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
                      title={hostLabel ? `Open posting on ${hostLabel}` : "Open posting"}
                    >
                      ✈ Apply to this job{hostLabel ? ` — on ${hostLabel}` : ""} →
                    </a>
                  );
                })()}

                {/* UAT 2026-05-10: persistent inline statuses for each action.
                    Previously these used a transient toast (4s) and users
                    missed both successes and failures. */}
                {coverLetterError && (
                  <div role="alert" className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    <span>📝</span>
                    <span className="flex-1"><strong>Cover letter:</strong> {coverLetterError}</span>
                    <button onClick={() => setCoverLetterError(null)} className="text-red-500 hover:text-red-700">Dismiss</button>
                  </div>
                )}
                {critiqueError && (
                  <div role="alert" className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    <span>🔍</span>
                    <span className="flex-1"><strong>Critique:</strong> {critiqueError}</span>
                    <button onClick={() => setCritiqueError(null)} className="text-red-500 hover:text-red-700">Dismiss</button>
                  </div>
                )}
                {saveJobStatus?.kind === "err" && (
                  <div role="alert" className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    <span>⭐</span>
                    <span className="flex-1"><strong>Save:</strong> {saveJobStatus.message}</span>
                    <button onClick={() => setSaveJobStatus(null)} className="text-red-500 hover:text-red-700">Dismiss</button>
                  </div>
                )}
                {saveJobStatus?.kind === "ok" && (
                  <div role="status" className="mt-3 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                    <span>✓</span>
                    <span className="flex-1">
                      Saved. <a href="/opportunities" className="font-semibold underline">View saved jobs</a>.
                    </span>
                    <button onClick={() => setSaveJobStatus(null)} className="text-emerald-600 hover:text-emerald-800">Dismiss</button>
                  </div>
                )}
              </section>

              {/* LinkedIn & Resume advice result (2026-05-21 rebrand) */}
              {linkedinAdvice && (
                <section className="rounded-xl border border-brand-200 bg-white p-6 shadow-sm space-y-5">
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-semibold text-gray-900">💼 Resume &amp; LinkedIn Advice</h2>
                    <button onClick={() => setLinkedinAdvice(null)} className="text-xs text-gray-400 hover:text-gray-600">Clear</button>
                  </div>

                  {linkedinAdvice.resumeGaps.length > 0 && (
                    <div>
                      <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-gray-500">Resume gaps vs target role</h3>
                      <ul className="space-y-1.5">
                        {linkedinAdvice.resumeGaps.map((g, i) => (
                          <li key={i} className="flex gap-2 text-sm text-gray-700">
                            <span className="mt-0.5 text-amber-500" aria-hidden="true">●</span>
                            <span>{g}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {linkedinAdvice.bulletRewrites.length > 0 && (
                    <div>
                      <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-gray-500">Bullet-level resume rewrites</h3>
                      <ul className="space-y-3">
                        {linkedinAdvice.bulletRewrites.map((b, i) => (
                          <li key={i} className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
                            <p className="text-xs uppercase tracking-wide text-gray-400">Before</p>
                            <p className="mb-2 text-gray-700">{b.original}</p>
                            <p className="text-xs uppercase tracking-wide text-emerald-600">After</p>
                            <p className="mb-2 font-medium text-gray-900">{b.revised}</p>
                            <p className="text-xs italic text-gray-500">{b.rationale}</p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {linkedinAdvice.linkedinHeadline && (
                    <div>
                      <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-gray-500">LinkedIn headline</h3>
                      <div className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm font-medium text-brand-900">
                        {linkedinAdvice.linkedinHeadline}
                      </div>
                      <div className="mt-1 text-right">
                        <button
                          onClick={() => navigator.clipboard.writeText(linkedinAdvice.linkedinHeadline).catch(() => {})}
                          className="text-[11px] font-medium text-brand-600 hover:text-brand-700"
                        >
                          Copy
                        </button>
                      </div>
                    </div>
                  )}

                  {linkedinAdvice.linkedinAbout && (
                    <div>
                      <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-gray-500">LinkedIn About section</h3>
                      <pre className="whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-sm leading-relaxed text-gray-800 font-sans">{linkedinAdvice.linkedinAbout}</pre>
                      <div className="mt-1 text-right">
                        <button
                          onClick={() => navigator.clipboard.writeText(linkedinAdvice.linkedinAbout).catch(() => {})}
                          className="text-[11px] font-medium text-brand-600 hover:text-brand-700"
                        >
                          Copy
                        </button>
                      </div>
                    </div>
                  )}

                  {linkedinAdvice.linkedinTopSkills.length > 0 && (
                    <div>
                      <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-gray-500">Top 5 LinkedIn skills to add</h3>
                      <ul className="flex flex-wrap gap-2">
                        {linkedinAdvice.linkedinTopSkills.map((s, i) => (
                          <li key={i} className="rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">
                            {s}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </section>
              )}

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
    </>
  );
}
