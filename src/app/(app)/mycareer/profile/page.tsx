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

// ── SaveModal ─────────────────────────────────────────────────────────────────
function SaveModal({ onSave, onClose, saving }: { onSave: (name: string, jobType: string) => void; onClose: () => void; saving: boolean }) {
  const [name, setName]         = useState(`Resume ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}`);
  const [jobTypeVal, setJobTypeVal] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <h3 className="mb-4 text-lg font-bold text-gray-900">Save Resume Version</h3>
        <label className="mb-1 block text-sm font-medium text-gray-700">Version name</label>
        <input type="text" value={name} onChange={e => setName(e.target.value)}
          className="mb-4 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
          placeholder="e.g. Software Engineer — Google" />
        <label className="mb-1 block text-sm font-medium text-gray-700">Job type <span className="text-gray-400">(optional)</span></label>
        <input type="text" value={jobTypeVal} onChange={e => setJobTypeVal(e.target.value)}
          className="mb-6 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
          placeholder="e.g. Engineering, Product, Finance" />
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-lg border border-gray-200 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={() => onSave(name.trim() || "My Resume", jobTypeVal.trim())} disabled={saving}
            className="flex-1 rounded-lg bg-brand-600 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
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
  const [showSaveModal, setShowSaveModal]   = useState(false);
  const [pendingText, setPendingText]       = useState<string | null>(null);
  const [pendingParsed, setPendingParsed]   = useState<ParsedResume | null>(null);
  const [vaultSaving, setVaultSaving]       = useState(false);
  const [viewingVersion, setViewingVersion] = useState<ResumeVersion | null>(null);
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
          .select("full_name,phone,linkedin_url,summary,skills,work_experience,education,certifications,portfolio_items")
          .eq("user_id", u.id)
          .maybeSingle();
        if (p) {
          setFullName(p.full_name ?? "");
          setPhone(p.phone ?? "");
          setLinkedinUrl(p.linkedin_url ?? "");
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
          full_name:       fullName.trim() || null,
          phone:           phone.trim() || null,
          linkedin_url:    linkedinUrl.trim() || null,
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

  // ── File handling ─────────────────────────────────────────────────────────
  const handleFile = useCallback((file: File) => {
    setUploadedFile(file); setParseMsg(null); setPendingText(null); setPendingParsed(null);
  }, []);
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files[0]; if (file) handleFile(file);
  }, [handleFile]);

  async function handleUploadAndSave() {
    if (!uploadedFile) return;
    setParsing(true); setParseMsg(null);
    try {
      const { rawText, parsed } = await parseResumeFile(uploadedFile);
      setPendingParsed(parsed); setPendingText(rawText); setShowSaveModal(true);
    } catch (err) {
      setParseMsg({ type: "error", text: (err as Error).message });
    } finally {
      setParsing(false);
    }
  }

  async function handleVaultSave(name: string, jobTypeArg: string) {
    if (!pendingText) return;
    setVaultSaving(true);
    try {
      await saveResumeVersion({ versionName: name, resumeText: pendingText, jobType: jobTypeArg || undefined, parsedData: pendingParsed ?? undefined });

      if (pendingParsed) {
        const p = pendingParsed;
        if (!fullName.trim() && p.contact.name)       setFullName(p.contact.name);
        if (!phone.trim() && p.contact.phone)         setPhone(p.contact.phone);
        if (!linkedinUrl.trim() && p.contact.linkedin) setLinkedinUrl(p.contact.linkedin);
        if (!summary.trim() && p.summary)             setSummary(p.summary);

        if (p.skills.length > 0) {
          setSkills(prev => {
            const existing = new Set(prev.map(s => s.toLowerCase()));
            return [...prev, ...p.skills.filter(s => !existing.has(s.toLowerCase()))];
          });
        }

        if (workExp.length === 0 && p.experience.length > 0) {
          setWorkExp(p.experience.map(ex => ({
            title:       ex.title,
            company:     ex.company,
            startDate:   ex.period.split(/[-–—]/)[0]?.trim() ?? "",
            endDate:     ex.period.split(/[-–—]/)[1]?.trim() ?? "",
            description: ex.bullets.join(" "),
          })));
        }

        if (education.length === 0 && p.education.length > 0) {
          setEducation(p.education.map(ed => ({ degree: ed.degree, institution: ed.school, year: ed.year })));
        }

        if (p.certifications.length > 0) {
          setCertifications(prev => {
            const existing = new Set(prev.map(c => c.toLowerCase()));
            return [...prev, ...p.certifications.filter(c => !existing.has(c.toLowerCase()))];
          });
        }
      }

      setShowSaveModal(false); setUploadedFile(null); setPendingText(null); setPendingParsed(null);
      setParseMsg({ type: "success", text: 'Resume saved. Profile pre-filled — review and click "Save Profile".' });
      await loadVersions();
    } catch (err) {
      setParseMsg({ type: "error", text: (err as Error).message }); setShowSaveModal(false);
    } finally {
      setVaultSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteResumeVersion(id);
      setVersions(vs => vs.filter(v => v.id !== id));
      if (viewingVersion?.id === id) setViewingVersion(null);
    } catch (e) { console.error("Delete failed", e); }
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
              onClick={() => fileInputRef.current?.click()}
              className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-8 transition-colors ${
                dragOver ? "border-brand-400 bg-brand-50" :
                uploadedFile ? "border-emerald-300 bg-emerald-50" :
                "border-gray-200 bg-gray-50 hover:border-brand-300 hover:bg-brand-50/40"
              }`}
            >
              <span className="mb-2 text-2xl">{uploadedFile ? "✅" : "📄"}</span>
              {uploadedFile
                ? <p className="font-medium text-gray-800">{uploadedFile.name}</p>
                : <>
                    <p className="text-sm font-medium text-gray-700">Drop resume here or click to browse</p>
                    <p className="mt-1 text-xs text-gray-400">PDF · Word (.docx) · TXT</p>
                  </>}
              <input ref={fileInputRef} type="file" accept=".pdf,.docx,.doc,.txt" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            </div>

            {uploadedFile && (
              <button type="button" onClick={() => void handleUploadAndSave()} disabled={parsing}
                className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 transition-colors">
                {parsing ? "Parsing…" : "Upload Resume"}
              </button>
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
                          <div>
                            <p className="text-sm font-medium text-gray-900">{v.version_name}</p>
                            <p className="text-xs text-gray-400">
                              {v.job_type && <span className="mr-2 text-brand-500">{v.job_type}</span>}
                              {new Date(v.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                            </p>
                          </div>
                          <div className="flex gap-2">
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
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Full Name</label>
                <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Jane Doe" className={inputCls} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Email</label>
                <input type="email" value={userEmail} readOnly
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500 cursor-not-allowed"
                  title="Email cannot be changed here. Contact support if needed." />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Phone</label>
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+1 555-123-4567" className={inputCls} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">LinkedIn Profile URL</label>
                <input type="url" value={linkedinUrl} onChange={e => setLinkedinUrl(e.target.value)} placeholder="https://www.linkedin.com/in/your-profile" className={inputCls} />
              </div>
            </div>
          </Section>

          {/* ── Professional Summary ──────────────────────────────────── */}
          <Section title="Professional Summary">
            <textarea value={summary} onChange={e => setSummary(e.target.value)} rows={4}
              placeholder="Brief overview of your background and what you bring to the table…"
              className={inputCls + " resize-none"} />
          </Section>

          {/* ── Skills ───────────────────────────────────────────────── */}
          <Section title="Skills" subtitle="Press Enter or comma after each skill.">
            <TagInput tags={skills} onChange={setSkills} placeholder="e.g. Python, Product Strategy, SQL…" />
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

          {/* ── Portfolio ─────────────────────────────────────────────── */}
          <Section title="Portfolio" subtitle="Showcase projects, achievements, or case studies.">
            {portfolioItems.length === 0 && (
              <p className="text-sm text-gray-400">No portfolio items yet. Add projects, achievements, or case studies to showcase your work.</p>
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

      {/* ── Save modal ─────────────────────────────────────────────────── */}
      {showSaveModal && (
        <SaveModal onSave={(n, j) => void handleVaultSave(n, j)}
          onClose={() => { setShowSaveModal(false); setPendingText(null); setPendingParsed(null); }}
          saving={vaultSaving} />
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
