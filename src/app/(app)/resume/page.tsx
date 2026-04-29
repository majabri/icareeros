"use client";

import { useState, useRef, useCallback } from "react";
import {
  parseResumeText,
  parseResumeFile,
  saveResumeVersion,
  listResumeVersions,
  deleteResumeVersion,
  type ParsedResume,
  type ResumeVersion,
} from "@/services/ai/resumeService";

// ── Helpers ───────────────────────────────────────────────────────────────────

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ContactCard({ contact }: { contact: ParsedResume["contact"] }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
        Contact
      </h3>
      <p className="text-lg font-bold text-gray-900">{contact.name || "—"}</p>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
        {contact.email && <span>✉ {contact.email}</span>}
        {contact.phone && <span>📞 {contact.phone}</span>}
        {contact.location && <span>📍 {contact.location}</span>}
      </div>
    </div>
  );
}

function SummaryCard({ summary }: { summary: string }) {
  if (!summary) return null;
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
        Summary
      </h3>
      <p className="text-sm leading-relaxed text-gray-700">{summary}</p>
    </div>
  );
}

function ExperienceCard({ experience }: { experience: ParsedResume["experience"] }) {
  if (!experience.length) return null;
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
        Experience
      </h3>
      <div className="space-y-5">
        {experience.map((exp, i) => (
          <div key={i}>
            <div className="flex flex-wrap items-baseline justify-between gap-1">
              <p className="font-semibold text-gray-900">{exp.title}</p>
              <p className="text-xs text-gray-400">{exp.period}</p>
            </div>
            <p className="text-sm text-blue-600">{exp.company}</p>
            {exp.bullets.length > 0 && (
              <ul className="mt-2 space-y-1">
                {exp.bullets.map((b, j) => (
                  <li key={j} className="flex gap-2 text-sm text-gray-600">
                    <span className="mt-1 shrink-0 text-gray-300">•</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function EducationCard({ education }: { education: ParsedResume["education"] }) {
  if (!education.length) return null;
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
        Education
      </h3>
      <div className="space-y-3">
        {education.map((edu, i) => (
          <div key={i} className="flex flex-wrap items-baseline justify-between gap-1">
            <div>
              <p className="font-medium text-gray-900">{edu.degree}</p>
              <p className="text-sm text-gray-600">{edu.school}</p>
            </div>
            <p className="text-xs text-gray-400">{edu.year}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function SkillsCard({ skills, certifications }: { skills: string[]; certifications: string[] }) {
  if (!skills.length && !certifications.length) return null;
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      {skills.length > 0 && (
        <>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Skills
          </h3>
          <div className="flex flex-wrap gap-2">
            {skills.map((s, i) => (
              <span
                key={i}
                className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700"
              >
                {s}
              </span>
            ))}
          </div>
        </>
      )}
      {certifications.length > 0 && (
        <>
          <h3 className="mb-2 mt-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Certifications
          </h3>
          <div className="flex flex-wrap gap-2">
            {certifications.map((c, i) => (
              <span
                key={i}
                className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700"
              >
                {c}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function VersionHistoryItem({
  v,
  onDelete,
  onView,
}: {
  v: ResumeVersion;
  onDelete: (id: string) => void;
  onView: (v: ResumeVersion) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3">
      <div>
        <p className="font-medium text-gray-900">{v.version_name}</p>
        <p className="text-xs text-gray-400">
          {v.job_type && <span className="mr-2 text-blue-500">{v.job_type}</span>}
          {new Date(v.created_at).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </p>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => onView(v)}
          className="rounded-lg px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50"
        >
          View
        </button>
        <button
          onClick={() => onDelete(v.id)}
          className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

// ── Save Modal ────────────────────────────────────────────────────────────────

function SaveModal({
  onSave,
  onClose,
  saving,
}: {
  onSave: (name: string, jobType: string) => void;
  onClose: () => void;
  saving: boolean;
}) {
  const [name, setName] = useState(
    `Resume ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
  );
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
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-gray-200 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
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

type InputTab = "paste" | "upload";

export default function ResumePage() {
  const [tab, setTab] = useState<InputTab>("paste");
  const [pasteText, setPasteText] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileForParse, setFileForParse] = useState<File | null>(null);

  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedResume | null>(null);
  const [rawText, setRawText] = useState<string>("");

  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const [versions, setVersions] = useState<ResumeVersion[]>([]);
  const [versionsLoaded, setVersionsLoaded] = useState(false);
  const [viewingVersion, setViewingVersion] = useState<ResumeVersion | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load versions
  const loadVersions = useCallback(async () => {
    try {
      const vs = await listResumeVersions();
      setVersions(vs);
      setVersionsLoaded(true);
    } catch (e) {
      console.error("Failed to load versions", e);
    }
  }, []);

  // Init load versions
  useState(() => {
    void loadVersions();
  });

  // File handling
  const handleFile = useCallback(async (file: File) => {
    setFileName(file.name);
    setParseError(null);
    setParsed(null);

    if (file.type === "application/pdf") {
      // PDF: will be sent as base64 to API
      setFileForParse(file);
      setRawText("");
    } else {
      // Text/plain or other readable files
      try {
        const text = await readFileAsText(file);
        setRawText(text);
        setFileForParse(null);
      } catch {
        setParseError("Failed to read file. Try pasting the text instead.");
      }
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) void handleFile(file);
    },
    [handleFile]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) void handleFile(file);
    },
    [handleFile]
  );

  // Parse
  const handleParse = useCallback(async () => {
    setParsing(true);
    setParseError(null);
    setParsed(null);

    try {
      let result: ParsedResume;
      if (tab === "paste") {
        if (pasteText.trim().length < 20) {
          throw new Error("Please paste your resume text (at least a few lines).");
        }
        result = await parseResumeText(pasteText);
        setRawText(pasteText);
      } else {
        if (fileForParse) {
          result = await parseResumeFile(fileForParse);
          setRawText("");
        } else if (rawText) {
          result = await parseResumeText(rawText);
        } else {
          throw new Error("Please upload a file first.");
        }
      }
      setParsed(result);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "Parse failed");
    } finally {
      setParsing(false);
    }
  }, [tab, pasteText, fileForParse, rawText]);

  // Save
  const handleSave = useCallback(
    async (name: string, jobType: string) => {
      if (!parsed) return;
      setSaving(true);
      try {
        await saveResumeVersion({
          versionName: name,
          resumeText: rawText || pasteText,
          jobType: jobType || undefined,
          parsedData: parsed,
        });
        setShowSaveModal(false);
        setSavedMsg("Saved!");
        setTimeout(() => setSavedMsg(null), 3000);
        await loadVersions();
      } catch (e) {
        setParseError(e instanceof Error ? e.message : "Save failed");
        setShowSaveModal(false);
      } finally {
        setSaving(false);
      }
    },
    [parsed, rawText, pasteText, loadVersions]
  );

  // Delete version
  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await deleteResumeVersion(id);
        setVersions((vs) => vs.filter((v) => v.id !== id));
        if (viewingVersion?.id === id) setViewingVersion(null);
      } catch (e) {
        console.error("Delete failed", e);
      }
    },
    [viewingVersion]
  );

  const canParse =
    tab === "paste"
      ? pasteText.trim().length >= 20
      : !!(fileForParse || rawText);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">📄 Resume Builder</h1>
          <p className="mt-1 text-sm text-gray-500">
            Paste or upload your resume to parse and structure it with AI.
          </p>
        </div>

        {/* Input tabs */}
        <div className="mb-4 flex rounded-xl border border-gray-200 bg-white p-1">
          {(["paste", "upload"] as InputTab[]).map((t) => (
            <button
              key={t}
              onClick={() => {
                setTab(t);
                setParsed(null);
                setParseError(null);
              }}
              className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
                tab === t
                  ? "bg-blue-600 text-white"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {t === "paste" ? "✏️ Paste Text" : "📁 Upload File"}
            </button>
          ))}
        </div>

        {/* Input area */}
        {tab === "paste" ? (
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder="Paste your resume here…"
            rows={12}
            className="mb-4 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        ) : (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`mb-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-12 transition-colors ${
              dragOver
                ? "border-blue-400 bg-blue-50"
                : "border-gray-300 bg-white hover:border-blue-300 hover:bg-blue-50/40"
            }`}
          >
            <span className="mb-2 text-3xl">📄</span>
            {fileName ? (
              <p className="font-medium text-gray-800">{fileName}</p>
            ) : (
              <>
                <p className="font-medium text-gray-700">Drop your resume here</p>
                <p className="mt-1 text-xs text-gray-400">PDF, TXT, or plain text · click to browse</p>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.txt,text/plain,application/pdf"
              className="hidden"
              onChange={handleFileInput}
            />
          </div>
        )}

        {/* Parse button */}
        <button
          onClick={() => void handleParse()}
          disabled={!canParse || parsing}
          className="mb-6 w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
        >
          {parsing ? "Parsing with AI…" : "✨ Parse Resume"}
        </button>

        {/* Error */}
        {parseError && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {parseError}
          </div>
        )}

        {/* Parsed result */}
        {parsed && (
          <div className="mb-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-800">Parsed Resume</h2>
              <div className="flex items-center gap-3">
                {savedMsg && (
                  <span className="text-sm font-medium text-emerald-600">{savedMsg}</span>
                )}
                <button
                  onClick={() => setShowSaveModal(true)}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  💾 Save Version
                </button>
              </div>
            </div>

            <ContactCard contact={parsed.contact} />
            <SummaryCard summary={parsed.summary} />
            <ExperienceCard experience={parsed.experience} />
            <EducationCard education={parsed.education} />
            <SkillsCard skills={parsed.skills} certifications={parsed.certifications} />
          </div>
        )}

        {/* Version history */}
        {versionsLoaded && (
          <div>
            <h2 className="mb-3 text-base font-semibold text-gray-800">
              Saved Versions
              {versions.length > 0 && (
                <span className="ml-2 text-xs font-normal text-gray-400">
                  ({versions.length})
                </span>
              )}
            </h2>
            {versions.length === 0 ? (
              <p className="text-sm text-gray-400">
                No saved versions yet. Parse your resume and save it.
              </p>
            ) : (
              <div className="space-y-2">
                {versions.map((v) => (
                  <VersionHistoryItem
                    key={v.id}
                    v={v}
                    onDelete={(id) => void handleDelete(id)}
                    onView={setViewingVersion}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Save modal */}
      {showSaveModal && (
        <SaveModal
          onSave={(name, jobType) => void handleSave(name, jobType)}
          onClose={() => setShowSaveModal(false)}
          saving={saving}
        />
      )}

      {/* View version overlay */}
      {viewingVersion && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4">
          <div className="mx-auto max-w-3xl rounded-2xl bg-gray-50 p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">{viewingVersion.version_name}</h3>
              <button
                onClick={() => setViewingVersion(null)}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-200"
              >
                ✕
              </button>
            </div>
            {viewingVersion.parsed_data ? (
              <div className="space-y-4">
                <ContactCard contact={viewingVersion.parsed_data.contact} />
                <SummaryCard summary={viewingVersion.parsed_data.summary} />
                <ExperienceCard experience={viewingVersion.parsed_data.experience} />
                <EducationCard education={viewingVersion.parsed_data.education} />
                <SkillsCard
                  skills={viewingVersion.parsed_data.skills}
                  certifications={viewingVersion.parsed_data.certifications}
                />
              </div>
            ) : (
              <pre className="whitespace-pre-wrap rounded-xl bg-white p-4 text-sm text-gray-700">
                {viewingVersion.resume_text}
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
