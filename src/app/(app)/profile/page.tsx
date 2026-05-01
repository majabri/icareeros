"use client"

/**
 * /settings/profile — Career Profile
 * Matches the azjobs reference layout:
 *   Resume Vault → Personal Info → Summary → Skills →
 *   Work Experience → Education → Certifications →
 *   Where you are → Location & work style
 *
 * Resume import auto-fills all sections from parsed data (no AI).
 * No "Search & Match Criteria" section.
 */
"use client";

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

type Msg = { type: "success" | "error"; text: string };

interface WorkExp  { title: string; company: string; startDate: string; endDate: string; description: string; }
interface Edu      { degree: string; institution: string; year: string; }

const EMPTY_EXP  = (): WorkExp => ({ title: "", company: "", startDate: "", endDate: "", description: "" });
const EMPTY_EDU  = (): Edu    => ({ degree: "", institution: "", year: "" });

const EXPERIENCE_LEVELS = [
  { value: "entry",     label: "Entry level (0–2 years)" },
  { value: "mid",       label: "Mid-level (3–5 years)" },
  { value: "senior",    label: "Senior (6–10 years)" },
  { value: "executive", label: "Executive (10+ years)" },
];

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
      className="flex min-h-[42px] flex-wrap gap-1.5 rounded-lg border border-gray-300 px-2.5 py-2 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 cursor-text"
      onClick={() => ref.current?.focus()}
    >
      {tags.map(tag => (
        <span key={tag} className="flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
          {tag}
          <button type="button" onClick={e => { e.stopPropagation(); onChange(tags.filter(t => t !== tag)); }} className="ml-0.5 text-blue-400 hover:text-blue-600">×</button>
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
  const [name, setName]       = useState(`Resume ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}`);
  const [jobType, setJobType] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <h3 className="mb-4 text-lg font-bold text-gray-900">Save Resume Version</h3>
        <label className="mb-1 block text-sm font-medium text-gray-700">Version name</label>
        <input type="text" value={name} onChange={e => setName(e.target.value)}
          className="mb-4 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          placeholder="e.g. Software Engineer — Google" />
        <label className="mb-1 block text-sm font-medium text-gray-700">Job type <span className="text-gray-400">(optional)</span></label>
        <input type="text" value={jobType} onChange={e => setJobType(e.target.value)}
          className="mb-6 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          placeholder="e.g. Engineering, Product, Finance" />
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-lg border border-gray-200 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={() => onSave(name.trim() || "My Resume", jobType.trim())} disabled={saving}
            className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
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

  // — basic profile fields
  const [fullName, setFullName]               = useState("");
  const [phone, setPhone]                     = useState("");
  const [linkedinUrl, setLinkedinUrl]         = useState("");
  const [summary, setSummary]                 = useState("");
  const [skills, setSkills]                   = useState<string[]>([]);
  const [currentPosition, setCurrentPosition] = useState("");
  const [experienceLevel, setExperienceLevel] = useState("");
  const [targetRoles, setTargetRoles]         = useState<string[]>([]);
  const [location, setLocation]               = useState("");
  const [openToRemote, setOpenToRemote]       = useState(false);

  // — rich resume sections
  const [workExp, setWorkExp]             = useState<WorkExp[]>([]);
  const [education, setEducation]         = useState<Edu[]>([]);
  const [certifications, setCertifications] = useState<string[]>([]);

  const [portfolioItems, setPortfolioItems]   = useState<{title:string;url:string;desc:string}[]>([]);
  const [referralLink, setReferralLink]       = useState("");
  const [userId, setUserId]                   = useState<string | null>(null);
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

  // Load profile
  useEffect(() => {
    void (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        const u = data.user;
        if (!u) return;
        setUserId(u.id);
        const { data: p } = await supabase
          .from("user_profiles")
          .select("full_name, phone, linkedin_url, summary, current_position, experience_level, target_roles, skills, location, open_to_remote, work_experience, education, certifications, portfolio_items")
          .eq("user_id", u.id)
          .maybeSingle();
        if (p) {
          setFullName(p.full_name ?? "");
          setPhone(p.phone ?? "");
          setLinkedinUrl(p.linkedin_url ?? "");
          if (Array.isArray(p.portfolio_items)) setPortfolioItems(p.portfolio_items as {title:string;url:string;desc:string}[]);
          setReferralLink(`https://icareeros.com/?ref=${u.id.slice(0,8)}`);
          setSummary(p.summary ?? "");
          setCurrentPosition(p.current_position ?? "");
          setExperienceLevel(p.experience_level ?? "");
          setTargetRoles(p.target_roles ?? []);
          setSkills(p.skills ?? []);
          setLocation(p.location ?? "");
          setOpenToRemote(p.open_to_remote ?? false);
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

  // Save profile
  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) return;
    setSaving(true); setProfileMsg(null);
    try {
      const { error } = await supabase.from("user_profiles").upsert(
        {
          user_id: userId,
          full_name: fullName.trim() || null,
          phone: phone.trim() || null,
          linkedin_url: linkedinUrl.trim() || null,
          summary: summary.trim() || null,
          current_position: currentPosition.trim() || null,
          experience_level: experienceLevel || null,
          target_roles: targetRoles,
          skills,
          location: location.trim() || null,
          open_to_remote: openToRemote,
          work_experience: workExp,
          portfolio_items: portfolioItems,
          education,
          certifications,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
      if (error) throw new Error(error.message);
      setProfileMsg({ type: "success", text: "Profile saved." });
    } catch (err) {
      setProfileMsg({ type: "error", text: (err as Error).message });
    } finally {
      setSaving(false);
    }
  }

  // File handling
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

  async function handleVaultSave(name: string, jobType: string) {
    if (!pendingText) return;
    setVaultSaving(true);
    try {
      await saveResumeVersion({ versionName: name, resumeText: pendingText, jobType: jobType || undefined, parsedData: pendingParsed ?? undefined });

      // Auto-fill from parsed — only blank fields overwritten
      if (pendingParsed) {
        const p = pendingParsed;
        if (!fullName.trim() && p.contact.name)         setFullName(p.contact.name);
        if (!phone.trim() && p.contact.phone)            setPhone(p.contact.phone);
        if (!location.trim() && p.contact.location)      setLocation(p.contact.location);
        if (!linkedinUrl.trim() && p.contact.linkedin)   setLinkedinUrl(p.contact.linkedin);
        if (!summary.trim() && p.summary)                setSummary(p.summary);
        if (!currentPosition.trim() && p.experience[0]) setCurrentPosition(p.experience[0].title);

        // Skills — merge, deduplicate
        if (p.skills.length > 0) {
          setSkills(prev => {
            const existing = new Set(prev.map(s => s.toLowerCase()));
            return [...prev, ...p.skills.filter(s => !existing.has(s.toLowerCase()))];
          });
        }

        // Work experience — fill if empty
        if (workExp.length === 0 && p.experience.length > 0) {
          setWorkExp(p.experience.map(e => ({
            title:       e.title,
            company:     e.company,
            startDate:   e.period.split(/[-–—]/)[0]?.trim() ?? "",
            endDate:     e.period.split(/[-–—]/)[1]?.trim() ?? "",
            description: e.bullets.join(" "),
          })));
        }

        // Education — fill if empty
        if (education.length === 0 && p.education.length > 0) {
          setEducation(p.education.map(e => ({ degree: e.degree, institution: e.school, year: e.year })));
        }

        // Certifications — merge
        if (p.certifications.length > 0) {
          setCertifications(prev => {
            const existing = new Set(prev.map(c => c.toLowerCase()));
            return [...prev, ...p.certifications.filter(c => !existing.has(c.toLowerCase()))];
          });
        }
      }

      setShowSaveModal(false); setUploadedFile(null); setPendingText(null); setPendingParsed(null);
      setParseMsg({ type: "success", text: 'Resume saved. Profile pre-filled — review and click "Save profile".' });
      await loadVersions();
    } catch (err) {
      setParseMsg({ type: "error", text: (err as Error).message }); setShowSaveModal(false);
    } finally {
      setVaultSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try { await deleteResumeVersion(id); setVersions(vs => vs.filter(v => v.id !== id)); if (viewingVersion?.id === id) setViewingVersion(null); }
    catch (e) { console.error("Delete failed", e); }
  }

  // Work experience helpers
  function updateExp(i: number, field: keyof WorkExp, value: string) {
    setWorkExp(prev => prev.map((e, idx) => idx === i ? { ...e, [field]: value } : e));
  }
  function removeExp(i: number) { setWorkExp(prev => prev.filter((_, idx) => idx !== i)); }

  // Education helpers
  function updateEdu(i: number, field: keyof Edu, value: string) {
    setEducation(prev => prev.map((e, idx) => idx === i ? { ...e, [field]: value } : e));
  }
  function removeEdu(i: number) { setEducation(prev => prev.filter((_, idx) => idx !== i)); }

  if (profileLoading) {
    return <div className="flex min-h-[40vh] items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" /></div>;
  }

  const inputCls = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

  return (
    <>
      <form onSubmit={e => void handleSaveProfile(e)}>
        <div className="space-y-8">

          {/* ── Resume Vault ───────────────────────────────────────── */}
          <Section title="Resume Vault" subtitle="Upload PDF, Word, or TXT — auto-fills every section below.">
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-8 transition-colors ${
                dragOver ? "border-blue-400 bg-blue-50" :
                uploadedFile ? "border-emerald-300 bg-emerald-50" :
                "border-gray-200 bg-gray-50 hover:border-blue-300 hover:bg-blue-50/40"
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
                className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors">
                {parsing ? "Parsing…" : "💾 Parse & Save to Vault"}
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
                  Saved versions{versions.length > 0 && <span className="ml-1.5 text-xs font-normal text-gray-400">({versions.length})</span>}
                </p>
                {versions.length === 0
                  ? <p className="text-sm text-gray-400">No saved versions yet.</p>
                  : <div className="space-y-2">
                      {versions.map(v => (
                        <div key={v.id} className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                          <div>
                            <p className="text-sm font-medium text-gray-900">{v.version_name}</p>
                            <p className="text-xs text-gray-400">
                              {v.job_type && <span className="mr-2 text-blue-500">{v.job_type}</span>}
                              {new Date(v.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <button type="button" onClick={() => setViewingVersion(v)}
                              className="rounded px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50">View</button>
                            <button type="button" onClick={() => void handleDelete(v.id)}
                              className="rounded px-2.5 py-1 text-xs font-medium text-red-500 hover:bg-red-50">Delete</button>
                          </div>
                        </div>
                      ))}
                    </div>}
              </div>
            )}
          </Section>

          {/* ── Personal Information ────────────────────────────────── */}
          <Section title="Personal Information" subtitle="Auto-filled from your resume — review and update as needed.">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Full Name</label>
                <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Jane Doe" className={inputCls} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Phone</label>
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+1 555-123-4567" className={inputCls} />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">LinkedIn Profile URL</label>
              <input type="url" value={linkedinUrl} onChange={e => setLinkedinUrl(e.target.value)} placeholder="https://www.linkedin.com/in/your-profile" className={inputCls} />
            </div>
          </Section>

          {/* ── Professional Summary ────────────────────────────────── */}
          <Section title="Professional Summary">
            <textarea value={summary} onChange={e => setSummary(e.target.value)} rows={4}
              placeholder="Brief overview of your background and what you bring to the table…"
              className={inputCls + " resize-none"} />
          </Section>

          {/* ── Skills ─────────────────────────────────────────────── */}
          <Section title="Skills" subtitle="Press Enter or comma after each skill.">
            <TagInput tags={skills} onChange={setSkills} placeholder="e.g. Python, Product Strategy, SQL…" />
          </Section>

          {/* ── Work Experience ─────────────────────────────────────── */}
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
                className="w-full rounded-lg border border-dashed border-gray-300 py-2.5 text-sm font-medium text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors">
                + Add Experience
              </button>
            </div>
          </Section>

          {/* ── Education ───────────────────────────────────────────── */}
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
                className="w-full rounded-lg border border-dashed border-gray-300 py-2.5 text-sm font-medium text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors">
                + Add Education
              </button>
            </div>
          </Section>

          {/* ── Certifications ──────────────────────────────────────── */}
          <Section title="Certifications" subtitle="Press Enter or comma after each certification.">
            <TagInput tags={certifications} onChange={setCertifications} placeholder="e.g. AWS Solutions Architect, PMP, CISSP…" />
          </Section>

          {/* ── Where you are ───────────────────────────────────────── */}
          <Section title="Where you are" subtitle="Your current role and experience level. Used to calibrate advice and match scores.">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Current Position</label>
                <input type="text" value={currentPosition} onChange={e => setCurrentPosition(e.target.value)} placeholder="e.g. Senior Product Manager" className={inputCls} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Experience Level</label>
                <select value={experienceLevel} onChange={e => setExperienceLevel(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
                  <option value="">Select level</option>
                  {EXPERIENCE_LEVELS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Target Roles</label>
              <TagInput tags={targetRoles} onChange={setTargetRoles} placeholder="e.g. VP of Product, Director of Engineering…" />
              <p className="mt-1 text-xs text-gray-400">Press Enter or comma after each role</p>
            </div>
          </Section>

          {/* ── Location & work style ───────────────────────────────── */}
          <Section title="Location &amp; Work Style" subtitle="Helps surface the right opportunities for your situation.">
            <div className="max-w-sm">
              <label className="mb-1 block text-sm font-medium text-gray-700">Location</label>
              <input type="text" value={location} onChange={e => setLocation(e.target.value)}
                placeholder="e.g. New York, NY · San Francisco Bay Area" className={inputCls} />
            </div>
            <label className="flex cursor-pointer items-center gap-3">
              <div className="relative">
                <input type="checkbox" checked={openToRemote} onChange={e => setOpenToRemote(e.target.checked)} className="peer sr-only" />
                <div className="h-5 w-9 rounded-full bg-gray-200 transition-colors peer-checked:bg-blue-600" />
                <div className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
              </div>
              <span className="text-sm font-medium text-gray-700">Open to remote opportunities</span>
            </label>
          </Section>

          {/* ── Portfolio ──────────────────────────────────────────── */}
          <Section title="Portfolio" subtitle="Showcase projects, achievements, or case studies.">
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
              className="mt-1 text-sm text-blue-600 hover:text-blue-700 font-medium">+ Add Item</button>
          </Section>

          {/* ── Referral ────────────────────────────────────────────── */}
          {referralLink && (
            <Section title="Referral Program" subtitle="Invite friends — unlock Premium when 3 sign up.">
              <div className="flex gap-2 max-w-lg">
                <input readOnly value={referralLink} className={`${inputCls} flex-1 bg-gray-50 cursor-default`} />
                <button type="button" onClick={() => { navigator.clipboard.writeText(referralLink); }}
                  className="shrink-0 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                  Copy
                </button>
              </div>
              <p className="mt-2 text-xs text-gray-400">Share your link. When 3 friends sign up you unlock Premium features.</p>
            </Section>
          )}

          {/* ── Save ────────────────────────────────────────────────── */}
          <div className="flex items-center gap-4 pb-8">
            <button type="submit" disabled={saving}
              className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 transition-colors">
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

      {/* ── Save modal ──────────────────────────────────────────────── */}
      {showSaveModal && (
        <SaveModal onSave={(n, j) => void handleVaultSave(n, j)}
          onClose={() => { setShowSaveModal(false); setPendingText(null); setPendingParsed(null); }}
          saving={vaultSaving} />
      )}

      {/* ── View version overlay ──────────────────────────────────── */}
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
