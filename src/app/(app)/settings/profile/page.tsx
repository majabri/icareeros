/**
 * /settings/profile — Career Profile
 * Resume vault (upload + saved versions) + career preference fields.
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

type Msg = { type: "success" | "error"; text: string };

const EXPERIENCE_LEVELS = [
  { value: "entry",     label: "Entry level (0–2 years)" },
  { value: "mid",       label: "Mid-level (3–5 years)" },
  { value: "senior",    label: "Senior (6–10 years)" },
  { value: "executive", label: "Executive (10+ years)" },
];

// ── TagInput ──────────────────────────────────────────────────────────────────

function TagInput({
  tags,
  onChange,
  placeholder,
}: {
  tags: string[];
  onChange: (t: string[]) => void;
  placeholder?: string;
}) {
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
      {tags.map((tag) => (
        <span key={tag} className="flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
          {tag}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onChange(tags.filter((t) => t !== tag)); }}
            className="ml-0.5 text-blue-400 hover:text-blue-600"
          >×</button>
        </span>
      ))}
      <input
        ref={ref}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKey}
        onBlur={() => { if (input.trim()) add(input); }}
        placeholder={tags.length === 0 ? placeholder : ""}
        className="min-w-[120px] flex-1 bg-transparent text-sm text-gray-900 placeholder-gray-400 outline-none"
      />
    </div>
  );
}

// ── SaveModal ─────────────────────────────────────────────────────────────────

function SaveModal({
  onSave,
  onClose,
  saving,
}: {
  onSave: (name: string, jobType: string) => void;
  onClose: () => void;
  saving: boolean;
}) {
  const [name, setName]       = useState(`Resume ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}`);
  const [jobType, setJobType] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <h3 className="mb-4 text-lg font-bold text-gray-900">Save Resume Version</h3>
        <label className="mb-1 block text-sm font-medium text-gray-700">Version name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mb-4 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          placeholder="e.g. Software Engineer — Google"
        />
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Job type <span className="text-gray-400">(optional)</span>
        </label>
        <input
          type="text"
          value={jobType}
          onChange={(e) => setJobType(e.target.value)}
          className="mb-6 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          placeholder="e.g. Engineering, Product, Finance"
        />
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-lg border border-gray-200 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={() => onSave(name.trim() || "My Resume", jobType.trim())}
            disabled={saving}
            className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CareerProfilePage() {
  const supabase = createClient();

  // Career fields
  const [currentPosition, setCurrentPosition] = useState("");
  const [experienceLevel, setExperienceLevel] = useState("");
  const [targetRoles, setTargetRoles]         = useState<string[]>([]);
  const [skills, setSkills]                   = useState<string[]>([]);
  const [location, setLocation]               = useState("");
  const [openToRemote, setOpenToRemote]       = useState(false);
  const [userId, setUserId]                   = useState<string | null>(null);
  const [profileLoading, setProfileLoading]   = useState(true);
  const [saving, setSaving]                   = useState(false);
  const [profileMsg, setProfileMsg]           = useState<Msg | null>(null);

  // Resume vault
  const [versions, setVersions]             = useState<ResumeVersion[]>([]);
  const [versionsLoaded, setVersionsLoaded] = useState(false);
  const [uploadedFile, setUploadedFile]     = useState<File | null>(null);
  const [dragOver, setDragOver]             = useState(false);
  const [parsing, setParsing]               = useState(false);
  const [parseMsg, setParseMsg]             = useState<Msg | null>(null);
  const [showSaveModal, setShowSaveModal]   = useState(false);
  const [pendingText, setPendingText]       = useState<string | null>(null);
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
        const { data: profile } = await supabase
          .from("user_profiles")
          .select("current_position, experience_level, target_roles, skills, location, open_to_remote")
          .eq("user_id", u.id)
          .maybeSingle();
        if (profile) {
          setCurrentPosition(profile.current_position ?? "");
          setExperienceLevel(profile.experience_level ?? "");
          setTargetRoles(profile.target_roles ?? []);
          setSkills(profile.skills ?? []);
          setLocation(profile.location ?? "");
          setOpenToRemote(profile.open_to_remote ?? false);
        }
      } finally {
        setProfileLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load versions
  const loadVersions = useCallback(async () => {
    try {
      const vs = await listResumeVersions();
      setVersions(vs);
      setVersionsLoaded(true);
    } catch (e) {
      console.error("Failed to load versions", e);
      setVersionsLoaded(true);
    }
  }, []);

  useEffect(() => { void loadVersions(); }, [loadVersions]);

  // Save career fields
  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) return;
    setSaving(true);
    setProfileMsg(null);
    try {
      const { error } = await supabase.from("user_profiles").upsert(
        {
          user_id:          userId,
          current_position: currentPosition.trim() || null,
          experience_level: experienceLevel || null,
          target_roles:     targetRoles,
          skills:           skills,
          location:         location.trim() || null,
          open_to_remote:   openToRemote,
          updated_at:       new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
      if (error) throw new Error(error.message);
      setProfileMsg({ type: "success", text: "Career profile saved." });
    } catch (err) {
      setProfileMsg({ type: "error", text: (err as Error).message });
    } finally {
      setSaving(false);
    }
  }

  // File handling for vault upload
  const handleFile = useCallback((file: File) => {
    setUploadedFile(file);
    setParseMsg(null);
    setPendingText(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  // Parse file and prompt save
  async function handleUploadAndSave() {
    if (!uploadedFile) return;
    setParsing(true);
    setParseMsg(null);
    try {
      const parsed = await parseResumeFile(uploadedFile);
      // Flatten to text for storage
      const text = [
        parsed.contact.name,
        parsed.contact.email,
        parsed.contact.location,
        parsed.summary,
        ...parsed.experience.flatMap(e => [
          `${e.title} at ${e.company} (${e.period})`,
          ...e.bullets,
        ]),
        ...parsed.education.map(e => `${e.degree} — ${e.school} ${e.year}`),
        "Skills: " + parsed.skills.join(", "),
        parsed.certifications.length ? "Certifications: " + parsed.certifications.join(", ") : "",
      ].filter(Boolean).join("\n");
      setPendingText(text);
      setShowSaveModal(true);
    } catch (err) {
      setParseMsg({ type: "error", text: (err as Error).message });
    } finally {
      setParsing(false);
    }
  }

  // Save to vault
  async function handleVaultSave(name: string, jobType: string) {
    if (!pendingText) return;
    setVaultSaving(true);
    try {
      await saveResumeVersion({
        versionName: name,
        resumeText:  pendingText,
        jobType:     jobType || undefined,
      });
      setShowSaveModal(false);
      setUploadedFile(null);
      setPendingText(null);
      setParseMsg({ type: "success", text: "Resume saved to vault." });
      await loadVersions();
    } catch (err) {
      setParseMsg({ type: "error", text: (err as Error).message });
      setShowSaveModal(false);
    } finally {
      setVaultSaving(false);
    }
  }

  // Delete from vault
  async function handleDelete(id: string) {
    try {
      await deleteResumeVersion(id);
      setVersions((vs) => vs.filter((v) => v.id !== id));
      if (viewingVersion?.id === id) setViewingVersion(null);
    } catch (e) {
      console.error("Delete failed", e);
    }
  }

  if (profileLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <>
      <div className="space-y-8">

        {/* ── Resume Vault ─────────────────────────────────────────── */}
        <section className="space-y-5 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Resume Vault</h2>
            <p className="mt-1 text-sm text-gray-500">
              Upload your resume to save a version. Saved versions can be used in Fit Check.
            </p>
          </div>

          {/* Upload area */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
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
            {uploadedFile ? (
              <p className="font-medium text-gray-800">{uploadedFile.name}</p>
            ) : (
              <>
                <p className="text-sm font-medium text-gray-700">Drop resume here or click to browse</p>
                <p className="mt-1 text-xs text-gray-400">PDF, Word (.docx), or TXT</p>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.doc,.txt"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
          </div>

          {uploadedFile && (
            <button
              type="button"
              onClick={() => void handleUploadAndSave()}
              disabled={parsing}
              className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {parsing ? "Parsing resume…" : "💾 Parse & Save to Vault"}
            </button>
          )}

          {parseMsg && (
            <p className={`text-sm ${parseMsg.type === "success" ? "text-emerald-600" : "text-red-600"}`}>
              {parseMsg.type === "success" ? "✓ " : "⚠ "}{parseMsg.text}
            </p>
          )}

          {/* Saved versions list */}
          {versionsLoaded && (
            <div>
              <p className="mb-2 text-sm font-medium text-gray-700">
                Saved versions
                {versions.length > 0 && (
                  <span className="ml-1.5 text-xs font-normal text-gray-400">({versions.length})</span>
                )}
              </p>
              {versions.length === 0 ? (
                <p className="text-sm text-gray-400">No saved versions yet.</p>
              ) : (
                <div className="space-y-2">
                  {versions.map((v) => (
                    <div key={v.id} className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{v.version_name}</p>
                        <p className="text-xs text-gray-400">
                          {v.job_type && <span className="mr-2 text-blue-500">{v.job_type}</span>}
                          {new Date(v.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setViewingVersion(v)}
                          className="rounded px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50"
                        >
                          View
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(v.id)}
                          className="rounded px-2.5 py-1 text-xs font-medium text-red-500 hover:bg-red-50"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        {/* ── Career Form ──────────────────────────────────────────── */}
        <form onSubmit={(e) => void handleSaveProfile(e)}>
          <div className="space-y-8">

            {/* Where you are */}
            <section className="space-y-5 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Where you are</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Your current role and experience. Used to calibrate advice and match scores.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Current position</label>
                  <input
                    type="text"
                    value={currentPosition}
                    onChange={(e) => setCurrentPosition(e.target.value)}
                    placeholder="e.g. Senior Product Manager"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Experience level</label>
                  <select
                    value={experienceLevel}
                    onChange={(e) => setExperienceLevel(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">Select level</option>
                    {EXPERIENCE_LEVELS.map(({ value, label }) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </section>

            {/* Where you're going */}
            <section className="space-y-5 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Where you&apos;re going</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Target roles and skills you&apos;re building toward. Press Enter or comma after each item.
                </p>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Target roles</label>
                <TagInput tags={targetRoles} onChange={setTargetRoles} placeholder="e.g. VP of Product, Director of Engineering…" />
                <p className="mt-1 text-xs text-gray-400">Press Enter or comma after each role</p>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Key skills</label>
                <TagInput tags={skills} onChange={setSkills} placeholder="e.g. Python, Product Strategy, SQL…" />
                <p className="mt-1 text-xs text-gray-400">Press Enter or comma after each skill</p>
              </div>
            </section>

            {/* Location & work style */}
            <section className="space-y-5 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Location &amp; work style</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Helps surface the right opportunities for your situation.
                </p>
              </div>
              <div className="max-w-sm">
                <label className="mb-1 block text-sm font-medium text-gray-700">Location</label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. New York, NY · San Francisco Bay Area"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <label className="flex cursor-pointer items-center gap-3">
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={openToRemote}
                    onChange={(e) => setOpenToRemote(e.target.checked)}
                    className="peer sr-only"
                  />
                  <div className="h-5 w-9 rounded-full bg-gray-200 transition-colors peer-checked:bg-blue-600" />
                  <div className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
                </div>
                <span className="text-sm font-medium text-gray-700">Open to remote opportunities</span>
              </label>
            </section>

            {/* Save */}
            <div className="flex items-center gap-4">
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
              >
                {saving ? "Saving…" : "Save career profile"}
              </button>
              {profileMsg && (
                <span className={`text-sm ${profileMsg.type === "success" ? "text-green-600" : "text-red-600"}`}>
                  {profileMsg.type === "success" ? "✓ " : "⚠ "}{profileMsg.text}
                </span>
              )}
            </div>
          </div>
        </form>
      </div>

      {/* ── Save modal ─────────────────────────────────────────────── */}
      {showSaveModal && (
        <SaveModal
          onSave={(name, jobType) => void handleVaultSave(name, jobType)}
          onClose={() => { setShowSaveModal(false); setPendingText(null); }}
          saving={vaultSaving}
        />
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
