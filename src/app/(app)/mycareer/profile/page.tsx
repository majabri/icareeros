"use client";

/**
 * /mycareer/profile — Career Profile
 * Contains: Resume Vault, Personal Info, Summary, Skills,
 *           Work Experience, Education, Certifications, Portfolio
 * Search & Match Criteria lives at /mycareer/preferences
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import {
  parseResumeFile,
  saveResumeVersion,
  listResumeVersions,
  deleteResumeVersion,
  type ResumeVersion,
} from "@/services/ai/resumeService";
import type { ParsedResume } from "@/lib/parseResumeLocally";
import { getActiveCycle, advanceStage } from "@/orchestrator/careerOsOrchestrator";
import { exportProfile, type ExportFormat } from "@/lib/profile-export";

type Msg = { type: "success" | "error"; text: string };

interface WorkExp  { title: string; company: string; startDate: string; endDate: string; description: string; }
interface Edu      { degree: string; institution: string; year: string; }

const EMPTY_EXP  = (): WorkExp => ({ title: "", company: "", startDate: "", endDate: "", description: "" });
const EMPTY_EDU  = (): Edu    => ({ degree: "", institution: "", year: "" });

// ── Profile completeness ──────────────────────────────────────────────────────
function computeCompleteness(data: {
  fullName: string; summary: string; skills: string[]; workExp: WorkExp[];
  education: Edu[]; certifications: string[]; versions: ResumeVersion[];
}): number {
  const checks = [
    !!data.fullName,
    !!data.summary,
    data.skills.length > 0,
    data.workExp.length > 0,
    data.education.length > 0,
    data.certifications.length > 0,
    data.versions.length > 0,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

// ── TagInput ──────────────────────────────────────────────────────────────────
function TagInput({ tags, onChange, placeholder }: { tags: string[]; onChange: (t: string[]) => void; placeholder?: string }) {
  const [input, setInput] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  function add(raw: string) {
    const val = raw.trim().replace(/,+$/, "");
    if (val && !tags.includes(val)) onChange([...tags, val]);
    setInput("");
  }
  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(input); }
    if (e.key === "Backspace" && !input && tags.length) onChange(tags.slice(0, -1));
  }
  return (
    <div
      className="flex min-h-[42px] flex-wrap gap-1.5 rounded-lg border border-gray-300 px-2.5 py-2 focus-within:border-brand-500 focus-within:ring-1 focus-within:ring-brand-500 cursor-text"
      onClick={() => ref.current?.focus()}
    >
      {tags.map(tag => (
        <span key={tag} className="flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700">
          {tag}
          <button type="button" onClick={e => { e.stopPropagation(); onChange(tags.filter(t => t !== tag)); }} className="ml-0.5 text-brand-400 hover:text-brand-600">×</button>
        </span>
      ))}
      <input ref={ref} value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKey}
        onBlur={() => { if (input.trim()) add(input); }}
        placeholder={tags.length === 0 ? placeholder : ""}
        className="min-w-[120px] flex-1 bg-transparent text-sm text-gray-900 placeholder-gray-400 outline-none" />
    </div>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-5">
      <div>
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function CareerProfilePage() {
  const supabase = createClient();

  // — auth
  const [userEmail, setUserEmail] = useState("");
  const [userId, setUserId]       = useState<string | null>(null);
  const [cycleId, setCycleId]     = useState<string | null>(null);

  // — basic profile fields
  const [fullName, setFullName]               = useState("");
  const [phone, setPhone]                     = useState("");
  const [linkedinUrl, setLinkedinUrl]         = useState("");
  const [contactEmail, setContactEmail]       = useState("");
  const [location, setLocation]               = useState("");
  const [headline, setHeadline]               = useState("");
  const [avatarUrl, setAvatarUrl]             = useState<string | null>(null);
  const [summary, setSummary]                 = useState("");
  const [skills, setSkills]                   = useState<string[]>([]);

  // — rich resume sections
  const [workExp, setWorkExp]               = useState<WorkExp[]>([]);
  const [education, setEducation]           = useState<Edu[]>([]);
  const [certifications, setCertifications] = useState<string[]>([]);
  const [portfolioItems, setPortfolioItems] = useState<{title:string;url:string;desc:string}[]>([]);

  // — ui state
  const [profileLoading, setProfileLoading] = useState(true);
  const [saving, setSaving]                 = useState(false);
  const [profileMsg, setProfileMsg]         = useState<Msg | null>(null);

  // — vault state
  const [versions, setVersions]             = useState<ResumeVersion[]>([]);
  const [versionsLoaded, setVersionsLoaded] = useState(false);
  const [uploadedFile, setUploadedFile]     = useState<File | null>(null);
  const [dragOver, setDragOver]             = useState(false);
  const [parsing, setParsing]               = useState(false);
  const [parseMsg, setParseMsg]             = useState<Msg | null>(null);
  const [viewingVersion, setViewingVersion] = useState<ResumeVersion | null>(null);
  const [renamingId, setRenamingId]         = useState<string | null>(null);
  const [renameValue, setRenameValue]       = useState("");
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearing, setClearing]               = useState(false);
  const [exporting, setExporting]             = useState<ExportFormat | null>(null);
  const [exportMsg, setExportMsg]             = useState<{ type: "success" | "error"; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Load profile ──────────────────────────────────────────────────────────
  useEffect(() => {
    void (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        const u = data.user;
        if (!u) return;
        setUserId(u.id);
        setUserEmail(u.email ?? "");
        const cycle = await getActiveCycle(u.id);
        if (cycle?.id) setCycleId(cycle.id);
        const { data: p } = await supabase
          .from("user_profiles")
          .select("full_name,phone,linkedin_url,contact_email,avatar_url,summary,skills,work_experience,education,certifications,portfolio_items,location,headline")
          .eq("user_id", u.id)
          .maybeSingle();
        if (p) {
          setFullName(p.full_name ?? "");
          setPhone(p.phone ?? "");
          setLinkedinUrl(p.linkedin_url ?? "");
          setContactEmail(p.contact_email ?? "");
          setLocation(((p as Record<string,unknown>).location as string) ?? "");
          setHeadline(((p as Record<string,unknown>).headline as string) ?? "");
          setAvatarUrl(p.avatar_url ?? null);
          setSummary(p.summary ?? "");
          setSkills(p.skills ?? []);
          if (Array.isArray(p.portfolio_items)) setPortfolioItems(p.portfolio_items as {title:string;url:string;desc:string}[]);
          setWorkExp((p.work_experience as WorkExp[]) ?? []);
          setEducation((p.education as Edu[]) ?? []);
          setCertifications(p.certifications ?? []);
        }
      } finally {
        setProfileLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadVersions = useCallback(async () => {
    try { setVersions(await listResumeVersions()); setVersionsLoaded(true); }
    catch { setVersionsLoaded(true); }
  }, []);
  useEffect(() => { void loadVersions(); }, [loadVersions]);

  // ── Completeness ─────────────────────────────────────────────────────────
  const completeness = computeCompleteness({ fullName, summary, skills, workExp, education, certifications, versions });

  // ── Save profile ─────────────────────────────────────────────────────────
  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) return;
    setSaving(true); setProfileMsg(null);
    try {
      const { error } = await supabase.from("user_profiles").upsert(
        {
          user_id:         userId,
          linkedin_url:    linkedinUrl.trim() || null,
          contact_email:   contactEmail.trim() || null,
          location:        location.trim() || null,
          headline:        headline.trim() || null,
          avatar_url:      avatarUrl || null,
          summary:         summary.trim() || null,
          skills,
          work_experience: workExp,
          portfolio_items: portfolioItems,
          education,
          certifications,
          updated_at:      new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
      if (error) throw new Error(error.message);
      setProfileMsg({ type: "success", text: "Profile saved." });
      if (userId && cycleId) {
        void advanceStage(userId, cycleId, "evaluate").catch(() => {});
      }
    } catch (err) {
      setProfileMsg({ type: "error", text: (err as Error).message });
    } finally {
      setSaving(false);
    }
  }

  // ── File handling — fully automatic: select/drop → parse → save ───────────
  // Derives version name from the filename (extension stripped, separators → spaces).
  function deriveVersionName(file: File): string {
    return file.name
      .replace(/\.(pdf|docx?|txt)$/i, "")
      .replace(/[_.\-]+/g, " ")
      .trim() || "My Resume";
  }

  const handleFile = useCallback(async (file: File) => {
    setUploadedFile(file);
    setParseMsg(null);
    setParsing(true);
    try {
      const { rawText, parsed } = await parseResumeFile(file);
      const versionName = deriveVersionName(file);

      await saveResumeVersion({ versionName, resumeText: rawText, parsedData: parsed });

      // Pre-fill profile fields (only when currently empty)
      const importedName  = !fullName.trim() && parsed.contact.name  ? parsed.contact.name  : null;
      const importedPhone = !phone.trim()    && parsed.contact.phone ? parsed.contact.phone : null;
      if (importedName)  setFullName(importedName);
      if (importedPhone) setPhone(importedPhone);
      if (!linkedinUrl.trim() && parsed.contact.linkedin) setLinkedinUrl(parsed.contact.linkedin);
      if (!contactEmail.trim() && parsed.contact.email)   setContactEmail(parsed.contact.email);
      if (!summary.trim() && parsed.summary)             setSummary(parsed.summary);
      if (!location.trim() && parsed.contact.location)   setLocation(parsed.contact.location);
      // headline is not in the regex parser's ParsedContact yet — AI cascade fills it via merge

      // Display identity (full_name, phone) lives on /settings/account. The resume import
      // is the ONE exception that may bootstrap those columns from /mycareer/profile —
      // but ONLY if they're currently empty. We never overwrite values the user set on
      // Settings.
      if (userId && (importedName || importedPhone)) {
        const seed: Record<string, unknown> = { user_id: userId, updated_at: new Date().toISOString() };
        if (importedName)  seed.full_name = importedName;
        if (importedPhone) seed.phone     = importedPhone;
        void supabase.from("user_profiles").upsert(seed, { onConflict: "user_id" }).then(({ error }) => {
          if (error) console.warn("[mycareer/profile] resume import failed to seed display identity:", error.message);
        });
      }

      if (parsed.skills.length > 0) {
        setSkills(prev => {
          const existing = new Set(prev.map(s => s.toLowerCase()));
          return [...prev, ...parsed.skills.filter(s => !existing.has(s.toLowerCase()))];
        });
      }
      if (workExp.length === 0 && parsed.experience.length > 0) {
        setWorkExp(parsed.experience.map(ex => ({
          title:       ex.title,
          company:     ex.company,
          startDate:   ex.period.split(/[-–—]/)[0]?.trim() ?? "",
          endDate:     ex.period.split(/[-–—]/)[1]?.trim() ?? "",
          description: ex.bullets.join(" "),
        })));
      }
      if (education.length === 0 && parsed.education.length > 0) {
        setEducation(parsed.education.map(ed => ({ degree: ed.degree, institution: ed.school, year: ed.year })));
      }
      if (parsed.certifications.length > 0) {
        setCertifications(prev => {
          const existing = new Set(prev.map(c => c.toLowerCase()));
          return [...prev, ...parsed.certifications.filter(c => !existing.has(c.toLowerCase()))];
        });
      }

      if (parsed.achievements.length > 0) {
        setPortfolioItems(prev => {
          const existingTitles = new Set(prev.map(p => p.title.toLowerCase()));
          const newItems = parsed.achievements
            .filter(a => !existingTitles.has(a.toLowerCase()))
            .map(a => ({ title: a, url: "", desc: "" }));
          return [...prev, ...newItems];
        });
      }

      setUploadedFile(null);
      setParseMsg({ type: "success", text: `"${versionName}" saved. Profile pre-filled — review and click "Save Profile".` });
      await loadVersions();
    } catch (err) {
      setParseMsg({ type: "error", text: (err as Error).message });
      setUploadedFile(null);
    } finally {
      setParsing(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullName, phone, linkedinUrl, contactEmail, summary, workExp, education, loadVersions]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files[0]; if (file) void handleFile(file);
  }, [handleFile]);

  async function handleRenameVersion(id: string, newName: string) {
    const trimmed = newName.trim();
    if (!trimmed) { setRenamingId(null); return; }
    // Optimistic update
    setVersions(vs => vs.map(v => v.id === id ? { ...v, version_name: trimmed } : v));
    setRenamingId(null);
    try {
      await supabase.from("user_resume_versions").update({ version_name: trimmed }).eq("id", id);
    } catch {
      // Revert on failure
      await loadVersions();
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteResumeVersion(id);
      setVersions(vs => vs.filter(v => v.id !== id));
      if (viewingVersion?.id === id) setViewingVersion(null);
    } catch (e) { console.error("Delete failed", e); }
  }

  async function handleExport(format: ExportFormat) {
    setExporting(format);
    setExportMsg(null);
    try {
      await exportProfile(format, {
        fullName, email: contactEmail, phone, location,
        linkedinUrl, headline, summary,
        workExp, education, certifications, skills, portfolioItems,
      });
      setExportMsg({ type: "success", text: `Downloaded ${format.toUpperCase()} resume.` });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Export failed";
      setExportMsg({ type: "error", text: msg });
    } finally {
      setExporting(null);
    }
  }

  async function handleClearProfile() {
    if (!userId) return;
    setClearing(true);
    try {
      // Delete all resume versions
      for (const v of versions) {
        try { await deleteResumeVersion(v.id); } catch { /* best-effort */ }
      }
      // Per Amir 2026-05-03 — Danger Zone preserves DISPLAY IDENTITY (full_name,
      // phone, avatar_url) since those are owned by /settings/account. Wipes only
      // career-identity columns so deleting the resume profile here can't destroy
      // what the user set on Settings.
      await supabase.from("user_profiles").upsert(
        {
          user_id:         userId,
          linkedin_url:    null,
          contact_email:   null,
          location:        null,
          headline:        null,
          summary:         null,
          skills:          [],
          work_experience: [],
          education:       [],
          certifications:  [],
          portfolio_items: [],
          updated_at:      new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
      // Reset career-only local state. Display identity stays on the page (loaded from DB).
      setLinkedinUrl(""); setContactEmail(""); setLocation(""); setHeadline(""); setSummary("");
      setSkills([]); setWorkExp([]); setEducation([]); setCertifications([]);
      setPortfolioItems([]); setVersions([]);
      setProfileMsg({ type: "success", text: "Profile cleared." });
    } catch (err) {
      setProfileMsg({ type: "error", text: (err as Error).message });
    } finally {
      setClearing(false);
      setShowClearConfirm(false);
    }
  }

  function updateExp(i: number, field: keyof WorkExp, value: string) {
    setWorkExp(prev => prev.map((e, idx) => idx === i ? { ...e, [field]: value } : e));
  }
  function removeExp(i: number) { setWorkExp(prev => prev.filter((_, idx) => idx !== i)); }
  function updateEdu(i: number, field: keyof Edu, value: string) {
    setEducation(prev => prev.map((e, idx) => idx === i ? { ...e, [field]: value } : e));
  }
  function removeEdu(i: number) { setEducation(prev => prev.filter((_, idx) => idx !== i)); }

  if (profileLoading) {
    return <div className="flex min-h-[40vh] items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" /></div>;
  }

  const inputCls = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500";

  return (
    <>
      <form onSubmit={e => void handleSaveProfile(e)}>
        {/* ── Page header with completeness ──────────────────────────── */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex-1">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">Profile Completeness</span>
              <span className="text-sm font-semibold text-brand-600">{completeness}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
              <div
                className="h-full rounded-full bg-brand-600 transition-all duration-500"
                style={{ width: `${completeness}%` }}
              />
            </div>
          </div>
          <div className="flex items-center gap-3 sm:ml-6">
            <button type="submit" disabled={saving}
              className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-50 transition-colors">
              {saving ? "Saving…" : "Save Profile"}
            </button>
            {profileMsg && (
              <span className={`text-sm ${profileMsg.type === "success" ? "text-green-600" : "text-red-600"}`}>
                {profileMsg.type === "success" ? "✓ " : "⚠ "}{profileMsg.text}
              </span>
            )}
          </div>
        </div>

        <div className="space-y-8">

          {/* ── Resume Vault ─────────────────────────────────────────── */}
          <Section title="Import from Resume" subtitle="Upload PDF, Word, or TXT — auto-fills every section below.">
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => { if (!parsing) fileInputRef.current?.click(); }}
              className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-8 transition-colors ${
                dragOver ? "border-brand-400 bg-brand-50" :
                parsing ? "border-brand-300 bg-brand-50/60 cursor-default" :
                "border-gray-200 bg-gray-50 hover:border-brand-300 hover:bg-brand-50/40"
              }`}
            >
              <span className="mb-2 text-2xl">{parsing ? "⏳" : "📄"}</span>
              <p className="text-sm font-medium text-gray-700">
                {parsing ? "Processing…" : "Drop resume here or click to browse"}
              </p>
              {!parsing && <p className="mt-1 text-xs text-gray-400">PDF · Word (.doc, .docx) · TXT — auto-imported on drop</p>}
              <input ref={fileInputRef} type="file" accept=".pdf,.docx,.doc,.txt" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) void handleFile(f); }} />
            </div>

            {parsing && (
              <div className="flex items-center gap-2 rounded-lg bg-brand-50 px-4 py-3 text-sm text-brand-700">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
                Parsing and saving resume…
              </div>
            )}

            {parseMsg && (
              <p className={`text-sm ${parseMsg.type === "success" ? "text-emerald-600" : "text-red-600"}`}>
                {parseMsg.type === "success" ? "✓ " : "⚠ "}{parseMsg.text}
              </p>
            )}

            {versionsLoaded && (
              <div>
                <p className="mb-2 text-sm font-medium text-gray-700">
                  Resume Versions{versions.length > 0 && <span className="ml-1.5 text-xs font-normal text-gray-400">({versions.length})</span>}
                  <span className="ml-2 text-xs text-gray-400">Create different versions tailored for different job types.</span>
                </p>
                {versions.length === 0
                  ? <p className="text-sm text-gray-400">No saved versions yet.</p>
                  : <div className="space-y-2">
                      {versions.map(v => (
                        <div key={v.id} className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                          <div className="flex-1 min-w-0 mr-3">
                            {renamingId === v.id ? (
                              <input
                                autoFocus
                                type="text"
                                value={renameValue}
                                onChange={e => setRenameValue(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === "Enter")  void handleRenameVersion(v.id, renameValue);
                                  if (e.key === "Escape") setRenamingId(null);
                                }}
                                onBlur={() => void handleRenameVersion(v.id, renameValue)}
                                className="w-full rounded border border-brand-400 bg-white px-2 py-0.5 text-sm font-medium text-gray-900 focus:outline-none focus:ring-1 focus:ring-brand-500"
                              />
                            ) : (
                              <p
                                className="truncate text-sm font-medium text-gray-900 cursor-pointer hover:text-brand-600 group flex items-center gap-1"
                                onClick={() => { setRenamingId(v.id); setRenameValue(v.version_name); }}
                                title="Click to rename"
                              >
                                {v.version_name}
                                <span className="opacity-0 group-hover:opacity-100 text-gray-400 text-xs">✎</span>
                              </p>
                            )}
                            <p className="text-xs text-gray-400 mt-0.5">
                              {v.job_type && <span className="mr-2 text-brand-500">{v.job_type}</span>}
                              {new Date(v.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                            </p>
                          </div>
                          <div className="flex gap-2 shrink-0">
                            <button type="button" onClick={() => setViewingVersion(v)}
                              className="rounded px-2.5 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50">View</button>
                            <button type="button" onClick={() => void handleDelete(v.id)}
                              className="rounded px-2.5 py-1 text-xs font-medium text-red-500 hover:bg-red-50">Delete</button>
                          </div>
                        </div>
                      ))}
                    </div>}
              </div>
            )}
          </Section>

          {/* ── Personal Information ──────────────────────────────────── */}
          <Section title="Personal Information" subtitle="Auto-filled from your resume — review and update as needed.">
            {/* Fields grid */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 flex items-center gap-2 text-sm font-medium text-gray-700">
                  Full Name
                  <span className="text-xs font-normal text-gray-400">(edit on <a href="/settings/account" className="text-brand-600 hover:text-brand-700 underline-offset-2 hover:underline">Settings</a>)</span>
                </label>
                <input type="text" value={fullName} readOnly placeholder="Jane Doe"
                  className={inputCls + " cursor-not-allowed bg-gray-50 text-gray-700"} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Email <span className="text-xs font-normal text-gray-400">(from resume)</span></label>
                <input type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} placeholder="jane@example.com" className={inputCls} />
              </div>
              <div>
                <label className="mb-1 flex items-center gap-2 text-sm font-medium text-gray-700">
                  Phone
                  <span className="text-xs font-normal text-gray-400">(edit on <a href="/settings/account" className="text-brand-600 hover:text-brand-700 underline-offset-2 hover:underline">Settings</a>)</span>
                </label>
                <input type="tel" value={phone} readOnly placeholder="+1 (555) 000-0000"
                  className={inputCls + " cursor-not-allowed bg-gray-50 text-gray-700"} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">LinkedIn Profile URL</label>
                <input type="url" value={linkedinUrl} onChange={e => setLinkedinUrl(e.target.value)} placeholder="https://www.linkedin.com/in/your-profile" className={inputCls} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Current Location</label>
                <input type="text" value={location} onChange={e => setLocation(e.target.value)} placeholder="City, State or Country" className={inputCls} />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-medium text-gray-700">Headline</label>
                <input type="text" value={headline} onChange={e => setHeadline(e.target.value)} placeholder="One-line tagline — e.g. Senior PM building B2B SaaS" className={inputCls} />
              </div>
            </div>
          </Section>

          {/* ── Professional Summary ──────────────────────────────────── */}
          <Section title="Professional Summary">
            <textarea value={summary} onChange={e => setSummary(e.target.value)} rows={4}
              placeholder="Brief overview of your background and what you bring to the table…"
              className={inputCls + " resize-none"} />
          </Section>

          {/* ── Work Experience ───────────────────────────────────────── */}
          <Section title="Work Experience" subtitle="Most recent first. Auto-filled from your resume.">
            <div className="space-y-6">
              {workExp.map((e, i) => (
                <div key={i} className="relative rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
                  <button type="button" onClick={() => removeExp(i)}
                    className="absolute right-3 top-3 text-gray-400 hover:text-red-500 text-lg leading-none">×</button>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-600">Job Title</label>
                      <input type="text" value={e.title} onChange={ev => updateExp(i, "title", ev.target.value)} placeholder="Product Manager" className={inputCls} />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-600">Company</label>
                      <input type="text" value={e.company} onChange={ev => updateExp(i, "company", ev.target.value)} placeholder="Acme Corp" className={inputCls} />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-600">Start Date</label>
                      <input type="text" value={e.startDate} onChange={ev => updateExp(i, "startDate", ev.target.value)} placeholder="Jan 2020" className={inputCls} />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-600">End Date</label>
                      <input type="text" value={e.endDate} onChange={ev => updateExp(i, "endDate", ev.target.value)} placeholder="Present" className={inputCls} />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">Description</label>
                    <textarea value={e.description} onChange={ev => updateExp(i, "description", ev.target.value)} rows={3}
                      placeholder="Key responsibilities and achievements…" className={inputCls + " resize-none"} />
                  </div>
                </div>
              ))}
              <button type="button" onClick={() => setWorkExp(prev => [...prev, EMPTY_EXP()])}
                className="w-full rounded-lg border border-dashed border-gray-300 py-2.5 text-sm font-medium text-gray-500 hover:border-brand-400 hover:text-brand-600 transition-colors">
                + Add Experience
              </button>
            </div>
          </Section>

          {/* ── Education ─────────────────────────────────────────────── */}
          <Section title="Education" subtitle="Auto-filled from your resume.">
            <div className="space-y-4">
              {education.map((e, i) => (
                <div key={i} className="relative rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <button type="button" onClick={() => removeEdu(i)}
                    className="absolute right-3 top-3 text-gray-400 hover:text-red-500 text-lg leading-none">×</button>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-600">Degree</label>
                      <input type="text" value={e.degree} onChange={ev => updateEdu(i, "degree", ev.target.value)} placeholder="B.S. Computer Science" className={inputCls} />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-600">Institution</label>
                      <input type="text" value={e.institution} onChange={ev => updateEdu(i, "institution", ev.target.value)} placeholder="University" className={inputCls} />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-600">Year</label>
                      <input type="text" value={e.year} onChange={ev => updateEdu(i, "year", ev.target.value)} placeholder="2020" className={inputCls} />
                    </div>
                  </div>
                </div>
              ))}
              <button type="button" onClick={() => setEducation(prev => [...prev, EMPTY_EDU()])}
                className="w-full rounded-lg border border-dashed border-gray-300 py-2.5 text-sm font-medium text-gray-500 hover:border-brand-400 hover:text-brand-600 transition-colors">
                + Add Education
              </button>
            </div>
          </Section>

          {/* ── Certifications ────────────────────────────────────────── */}
          <Section title="Certifications" subtitle="Press Enter or comma after each certification.">
            <TagInput tags={certifications} onChange={setCertifications} placeholder="e.g. AWS Solutions Architect, PMP, CISSP…" />
          </Section>

          {/* ── Skills ───────────────────────────────────────────────── */}
          <Section title="Skills" subtitle="Press Enter or comma after each skill.">
            <TagInput tags={skills} onChange={setSkills} placeholder="e.g. Python, Product Strategy, SQL…" />
          </Section>

          {/* ── Portfolio ─────────────────────────────────────────────── */}
          <Section title="Portfolio & Achievements" subtitle="Showcases achievements and accomplishments from your resume, plus projects and case studies.">
            {portfolioItems.length === 0 && (
              <p className="text-sm text-gray-400">No items yet. Upload a resume to auto-import achievements, or add projects and case studies manually.</p>
            )}
            {portfolioItems.map((item, i) => (
              <div key={i} className="flex gap-3 items-start mb-3">
                <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input type="text" value={item.title} onChange={e => setPortfolioItems(p => p.map((x,j) => j===i ? {...x,title:e.target.value} : x))}
                    placeholder="Title" className={inputCls} />
                  <input type="url" value={item.url} onChange={e => setPortfolioItems(p => p.map((x,j) => j===i ? {...x,url:e.target.value} : x))}
                    placeholder="https://..." className={inputCls} />
                  <input type="text" value={item.desc} onChange={e => setPortfolioItems(p => p.map((x,j) => j===i ? {...x,desc:e.target.value} : x))}
                    placeholder="Short description" className={inputCls} />
                </div>
                <button type="button" onClick={() => setPortfolioItems(p => p.filter((_,j) => j!==i))}
                  className="mt-1 rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors">✕</button>
              </div>
            ))}
            <button type="button" onClick={() => setPortfolioItems(p => [...p, {title:"",url:"",desc:""}])}
              className="mt-1 text-sm text-brand-600 hover:text-brand-700 font-medium">+ Add Item</button>
          </Section>

          {/* ── Export ───────────────────────────────────────────────── */}
          <Section title="Export Resume" subtitle="Download your profile in any of these formats. Always reflects what you're editing right now.">
            <div className="flex flex-wrap gap-2">
              {(["docx","doc","ats","pdf","txt"] as const).map(fmt => (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => void handleExport(fmt)}
                  disabled={exporting !== null}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                  title={fmt === "ats" ? "Plain-text ATS-optimized format (single column, no formatting)" : `Download as ${fmt.toUpperCase()}`}
                >
                  {exporting === fmt ? "Generating…" : fmt.toUpperCase()}
                </button>
              ))}
            </div>
            {exportMsg && (
              <p className={`mt-2 text-xs ${exportMsg.type === "success" ? "text-green-600" : "text-red-600"}`}>
                {exportMsg.text}
              </p>
            )}
          </Section>

          {/* ── Danger Zone ──────────────────────────────────────────── */}
          <section className="rounded-xl border border-red-200 bg-red-50 p-6 shadow-sm">
            <h2 className="text-base font-semibold text-red-700">Danger Zone</h2>
            <p className="mt-1 text-sm text-red-500">
              Permanently delete this entire profile — resume versions, work experience, education, skills, and personal info. This cannot be undone.
            </p>
            <button
              type="button"
              onClick={() => setShowClearConfirm(true)}
              className="mt-4 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-100 transition-colors"
            >
              Delete profile
            </button>
          </section>

          {/* ── Save (bottom) ─────────────────────────────────────────── */}
          <div className="flex items-center gap-4 pb-8">
            <button type="submit" disabled={saving}
              className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-50 transition-colors">
              {saving ? "Saving…" : "Save Profile"}
            </button>
            {profileMsg && (
              <span className={`text-sm ${profileMsg.type === "success" ? "text-green-600" : "text-red-600"}`}>
                {profileMsg.type === "success" ? "✓ " : "⚠ "}{profileMsg.text}
              </span>
            )}
          </div>

        </div>
      </form>

      {/* ── Clear profile confirmation modal ──────────────────────── */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="mb-2 text-lg font-bold text-gray-900">Delete entire profile?</h3>
            <p className="mb-6 text-sm text-gray-500">
              This will permanently delete all resume versions, work experience, education, skills, certifications, portfolio items, and personal info from your profile. This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="flex-1 rounded-lg border border-gray-200 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleClearProfile()}
                disabled={clearing}
                className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {clearing ? "Deleting…" : "Yes, delete everything"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── View version overlay ──────────────────────────────────────── */}
      {viewingVersion && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4">
          <div className="mx-auto max-w-2xl rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">{viewingVersion.version_name}</h3>
              <button onClick={() => setViewingVersion(null)} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100">✕</button>
            </div>
            <pre className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap rounded-xl bg-gray-50 p-4 text-sm text-gray-700">
              {viewingVersion.resume_text}
            </pre>
          </div>
        </div>
      )}
    </>
  );
}
