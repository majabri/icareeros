"use client";

/**
 * ResumeIntake (SPEC-002).
 *
 * Browser-side resume intake — no server route, no LLM, no AI vendor.
 *
 * Three states:
 *   1. Upload  — drag-and-drop a .pdf / .docx / .doc / .txt
 *   2. Extract — pdfjs-dist / mammoth pull raw text in the browser
 *   3. Form    — react-hook-form + zod, user authors every structured field
 *                with the extracted text shown as a reference
 *
 * On submit the form writes directly to user_profiles via @supabase/supabase-js.
 *
 * The only auto-fill we allow is regex for email + phone — both unambiguous
 * patterns that the user would otherwise just retype from the reference pane.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useForm, useFieldArray, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createClient } from "@/lib/supabase";
import {
  profileSchema,
  type Profile,
  type WorkExperience,
  type Education,
} from "@/types/profile";

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const ACCEPT_ATTR    = ".pdf,.docx,.doc,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain";

// pdfjs CDN worker — avoids the Next.js public/ copy step.
const PDF_WORKER_SRC = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs";

const EMPTY_WORK: WorkExperience = {
  title: "", company: "", location: "", start: "", end: "", current: false, bullets: [],
};
const EMPTY_EDU: Education = { school: "", degree: "", field: "", start: "", end: "" };

// Regex auto-fill (only the unambiguous ones)
const EMAIL_RE = /[\w.+\-]+@[\w\-]+\.[\w.]+/;
const PHONE_RE = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}/;

// ── Component ─────────────────────────────────────────────────────────────────

type Stage = "upload" | "extracting" | "form" | "submitting" | "done";
type Source = Profile["raw_text_format"];

export function ResumeIntake() {
  const [stage, setStage]               = useState<Stage>("upload");
  const [extractError, setExtractError] = useState<string | null>(null);
  const [extractedText, setExtractedText] = useState<string>("");
  const [source, setSource]             = useState<Source>("manual");
  const [submitError, setSubmitError]   = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const form = useForm<Profile>({
    resolver: zodResolver(profileSchema) as Resolver<Profile>,
    defaultValues: {
      full_name: "", email: "", phone: "", location: "",
      headline: "", summary: "",
      work_history: [], education: [], skills: [],
      raw_text: "", raw_text_format: "manual",
    },
  });

  const work = useFieldArray({ control: form.control, name: "work_history" });
  const edu  = useFieldArray({ control: form.control, name: "education" });
  const skillsValue = form.watch("skills");
  const [skillDraft, setSkillDraft] = useState("");

  // ── Drag-and-drop ───────────────────────────────────────────────────────────
  function onDrop(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }
  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  async function handleFile(file: File) {
    setExtractError(null);
    if (file.size > MAX_FILE_BYTES) {
      setExtractError(`File is over 10 MB (${(file.size / 1024 / 1024).toFixed(1)} MB).`);
      return;
    }
    setStage("extracting");
    try {
      const { text, format } = await extractText(file);
      setExtractedText(text);
      setSource(format);
      form.setValue("raw_text", text);
      form.setValue("raw_text_format", format);

      // Trivial regex auto-fill — only email + phone (unambiguous)
      if (text) {
        const em = text.match(EMAIL_RE);
        const ph = text.match(PHONE_RE);
        if (em?.[0] && !form.getValues("email"))  form.setValue("email", em[0].trim());
        if (ph?.[0] && !form.getValues("phone"))  form.setValue("phone", ph[0].trim());
      }

      if (!text.trim()) {
        // Empty extraction → fallback message + manual entry
        setExtractError(
          "We couldn't read text from this file — it may be scanned or image-only. " +
          "You can fill in your information manually below."
        );
      }
      setStage("form");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown extraction error";
      setExtractError(msg);
      setStage("upload");
    }
  }

  function startManual() {
    setExtractedText("");
    setSource("manual");
    form.setValue("raw_text", "");
    form.setValue("raw_text_format", "manual");
    setStage("form");
  }

  // ── Submit ──────────────────────────────────────────────────────────────────
  async function onSubmit(values: Profile) {
    setSubmitError(null);
    setStage("submitting");
    try {
      const supabase = createClient();
      const { data: { user }, error: authErr } = await supabase.auth.getUser();
      if (authErr || !user) {
        throw new Error("You must be signed in to save your profile.");
      }

      // Spec field names → user_profiles column names
      const row = {
        user_id:              user.id,
        full_name:            values.full_name,
        contact_email:        values.email,
        phone:                values.phone || null,
        location:             values.location || null,
        headline:             values.headline || null,
        summary:              values.summary || null,
        work_experience:      values.work_history,
        education:            values.education,
        skills:               values.skills,
        raw_text:             values.raw_text || null,
        raw_text_format:      values.raw_text_format,
        profile_completed_at: new Date().toISOString(),
        updated_at:           new Date().toISOString(),
      };

      const { error } = await supabase
        .from("user_profiles")
        .upsert(row, { onConflict: "user_id" });
      if (error) throw new Error(error.message);

      setStage("done");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Save failed");
      setStage("form");
    }
  }

  // ── Skill chip helpers ──────────────────────────────────────────────────────
  function addSkill() {
    const trimmed = skillDraft.trim();
    if (!trimmed) return;
    const current = form.getValues("skills");
    if (current.some(s => s.toLowerCase() === trimmed.toLowerCase())) {
      setSkillDraft("");
      return;
    }
    form.setValue("skills", [...current, trimmed], { shouldDirty: true });
    setSkillDraft("");
  }
  function removeSkill(idx: number) {
    const current = form.getValues("skills");
    form.setValue("skills", current.filter((_, i) => i !== idx), { shouldDirty: true });
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (stage === "done") {
    return (
      <div className="mx-auto max-w-2xl rounded-xl border border-emerald-200 bg-emerald-50 p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
          <svg className="h-6 w-6 text-emerald-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-emerald-900">Profile saved</h2>
        <p className="mt-2 text-sm text-emerald-800">
          You&rsquo;re all set. Continue to your dashboard to start the Evaluate stage.
        </p>
        <a href="/dashboard" className="mt-6 inline-block rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">
          Go to dashboard
        </a>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold text-gray-900">Build your career profile</h1>
      <p className="mt-1 text-sm text-gray-500">
        Upload your resume to read text from it, or skip and fill the form manually. You author every field.
      </p>

      {/* Stage: upload */}
      {stage === "upload" && (
        <div className="mt-8">
          <label
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
            className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-white px-6 py-12 text-center hover:border-brand-400 hover:bg-brand-50/30 cursor-pointer transition-colors"
          >
            <svg className="h-10 w-10 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            <p className="mt-3 text-sm font-medium text-gray-700">Drag a resume here, or click to choose</p>
            <p className="mt-1 text-xs text-gray-500">PDF · DOCX · DOC · TXT · max 10 MB</p>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT_ATTR}
              onChange={onChange}
              className="hidden"
            />
          </label>
          {extractError && (
            <p className="mt-3 text-sm text-amber-700">{extractError}</p>
          )}
          <button
            type="button"
            onClick={startManual}
            className="mt-4 text-sm font-medium text-brand-700 hover:text-brand-800 underline"
          >
            Skip upload, fill in manually →
          </button>
        </div>
      )}

      {/* Stage: extracting */}
      {stage === "extracting" && (
        <div className="mt-8 rounded-xl border border-gray-200 bg-white p-6 text-center">
          <p className="text-sm text-gray-600">Reading text from your file…</p>
        </div>
      )}

      {/* Stage: form / submitting */}
      {(stage === "form" || stage === "submitting") && (
        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
          {/* ─── Form ─── */}
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="rounded-xl border border-gray-200 bg-white p-6 space-y-6"
          >
            {extractError && stage === "form" && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {extractError}
              </div>
            )}

            {/* Identity row */}
            <Section title="About you">
              <Field label="Full name" error={form.formState.errors.full_name?.message}>
                <input {...form.register("full_name")} className={inputClass} />
              </Field>
              <Field label="Email" error={form.formState.errors.email?.message}>
                <input type="email" {...form.register("email")} className={inputClass} />
              </Field>
              <Field label="Phone">
                <input {...form.register("phone")} className={inputClass} />
              </Field>
              <Field label="Location">
                <input {...form.register("location")} placeholder="City, State/Country" className={inputClass} />
              </Field>
              <Field label="Headline" hint="One-line role tagline.">
                <input {...form.register("headline")} placeholder="e.g. Senior PM building B2B SaaS" className={inputClass} />
              </Field>
              <Field label="Summary" hint="2-4 sentence professional summary.">
                <textarea {...form.register("summary")} rows={4} className={inputClass} />
              </Field>
            </Section>

            {/* Work history */}
            <Section
              title="Work history"
              action={<AddBtn onClick={() => work.append(EMPTY_WORK)}>+ Add role</AddBtn>}
            >
              {work.fields.length === 0 ? (
                <p className="text-sm text-gray-500">No roles yet. Add one to start.</p>
              ) : (
                work.fields.map((field, idx) => (
                  <WorkExperienceCard
                    key={field.id}
                    idx={idx}
                    form={form}
                    onRemove={() => work.remove(idx)}
                  />
                ))
              )}
            </Section>

            {/* Education */}
            <Section
              title="Education"
              action={<AddBtn onClick={() => edu.append(EMPTY_EDU)}>+ Add education</AddBtn>}
            >
              {edu.fields.length === 0 ? (
                <p className="text-sm text-gray-500">No entries yet.</p>
              ) : (
                edu.fields.map((field, idx) => (
                  <EducationCard
                    key={field.id}
                    idx={idx}
                    form={form}
                    onRemove={() => edu.remove(idx)}
                  />
                ))
              )}
            </Section>

            {/* Skills */}
            <Section title="Skills">
              <div className="flex gap-2">
                <input
                  value={skillDraft}
                  onChange={(e) => setSkillDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); addSkill(); }
                  }}
                  placeholder="Type a skill and press Enter"
                  className={inputClass}
                />
                <button type="button" onClick={addSkill} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                  Add
                </button>
              </div>
              {skillsValue.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {skillsValue.map((s, i) => (
                    <span key={`${s}-${i}`} className="inline-flex items-center gap-1 rounded-full bg-brand-100 px-3 py-1 text-xs font-medium text-brand-800">
                      {s}
                      <button type="button" onClick={() => removeSkill(i)} aria-label={`Remove ${s}`} className="text-brand-700 hover:text-brand-900">×</button>
                    </span>
                  ))}
                </div>
              )}
            </Section>

            {/* Submit */}
            {submitError && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {submitError}
              </div>
            )}
            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={stage === "submitting"}
                className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-50"
              >
                {stage === "submitting" ? "Saving…" : "Save profile"}
              </button>
            </div>
          </form>

          {/* ─── Reference pane ─── */}
          <aside className="rounded-xl border border-gray-200 bg-gray-50 p-4 lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-4rem)] lg:overflow-auto">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
              Reference {source !== "manual" ? `(from ${source.toUpperCase()})` : "(no upload)"}
            </h3>
            {extractedText ? (
              <pre className="whitespace-pre-wrap break-words font-sans text-xs leading-relaxed text-gray-700">
                {extractedText}
              </pre>
            ) : (
              <p className="text-xs text-gray-500">
                Upload a file to see extracted text here. You can copy from this pane into the form.
              </p>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

// ── Browser-side extraction ───────────────────────────────────────────────────

async function extractText(file: File): Promise<{ text: string; format: Source }> {
  const name = file.name.toLowerCase();
  const mime = file.type;

  if (mime === "application/pdf" || name.endsWith(".pdf")) {
    const text = await extractPdfText(file);
    return { text, format: "pdf" };
  }
  if (
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    name.endsWith(".docx")
  ) {
    const text = await extractDocxText(file);
    return { text, format: "docx" };
  }
  if (mime === "application/msword" || name.endsWith(".doc")) {
    // .doc (legacy binary) — mammoth doesn't reliably parse these; try and fall back.
    try {
      const text = await extractDocxText(file);
      return { text, format: "doc" };
    } catch {
      throw new Error("Legacy .doc files aren't supported. Save as .docx or PDF and try again.");
    }
  }
  if (mime === "text/plain" || name.endsWith(".txt")) {
    const text = await file.text();
    return { text, format: "txt" };
  }
  throw new Error("Unsupported file type. Upload a PDF, DOCX, DOC, or TXT.");
}

async function extractPdfText(file: File): Promise<string> {
  // Lazy import — pdfjs is browser-only and weighty.
  const pdfjs = await import("pdfjs-dist");
  // The legacy build avoids "DOMMatrix is not defined" issues during SSR
  // bundling — but since this whole component is "use client" we use the
  // standard build and just point at the CDN worker.
  pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER_SRC;

  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    const lineText = tc.items
      // pdfjs's TextItem has `.str`; some BiDi markers are TextMarkedContent
      // entries with no `.str` — guard.
      .map((it: unknown) => (it as { str?: string }).str ?? "")
      .join(" ");
    pages.push(lineText);
  }
  await doc.destroy();
  return pages.join("\n\n").replace(/[ \t]+/g, " ").trim();
}

async function extractDocxText(file: File): Promise<string> {
  // mammoth in the browser via ESM build
  const mammoth = await import("mammoth/mammoth.browser");
  const buf = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buf });
  return (result.value ?? "").trim();
}

// ── Subcomponents ─────────────────────────────────────────────────────────────

const inputClass =
  "block w-full rounded-md border border-gray-300 px-3 py-2 text-sm placeholder-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500";

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        {action}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-700">{label}</label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function AddBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
    >
      {children}
    </button>
  );
}

function WorkExperienceCard({
  idx,
  form,
  onRemove,
}: {
  idx: number;
  form: ReturnType<typeof useForm<Profile>>;
  onRemove: () => void;
}) {
  const errs = form.formState.errors.work_history?.[idx];
  const current = form.watch(`work_history.${idx}.current` as const);
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Title" error={errs?.title?.message}>
          <input {...form.register(`work_history.${idx}.title` as const)} className={inputClass} />
        </Field>
        <Field label="Company" error={errs?.company?.message}>
          <input {...form.register(`work_history.${idx}.company` as const)} className={inputClass} />
        </Field>
        <Field label="Location">
          <input {...form.register(`work_history.${idx}.location` as const)} className={inputClass} />
        </Field>
        <Field label="Start" error={errs?.start?.message}>
          <input placeholder="YYYY-MM" {...form.register(`work_history.${idx}.start` as const)} className={inputClass} />
        </Field>
        <Field label="End">
          <input
            placeholder={current ? "Currently here" : "YYYY-MM"}
            disabled={!!current}
            {...form.register(`work_history.${idx}.end` as const)}
            className={inputClass + (current ? " bg-gray-100" : "")}
          />
        </Field>
        <Field label="">
          <label className="mt-2 inline-flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" {...form.register(`work_history.${idx}.current` as const)} className="rounded border-gray-300" />
            Currently in this role
          </label>
        </Field>
      </div>
      <div className="mt-3 flex justify-end">
        <button type="button" onClick={onRemove} className="text-xs font-medium text-red-600 hover:text-red-700">
          Remove role
        </button>
      </div>
    </div>
  );
}

function EducationCard({
  idx,
  form,
  onRemove,
}: {
  idx: number;
  form: ReturnType<typeof useForm<Profile>>;
  onRemove: () => void;
}) {
  const errs = form.formState.errors.education?.[idx];
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="School" error={errs?.school?.message}>
          <input {...form.register(`education.${idx}.school` as const)} className={inputClass} />
        </Field>
        <Field label="Degree">
          <input {...form.register(`education.${idx}.degree` as const)} placeholder="e.g. B.S." className={inputClass} />
        </Field>
        <Field label="Field of study">
          <input {...form.register(`education.${idx}.field` as const)} className={inputClass} />
        </Field>
        <Field label="Start (year)">
          <input {...form.register(`education.${idx}.start` as const)} placeholder="YYYY" className={inputClass} />
        </Field>
        <Field label="End (year)">
          <input {...form.register(`education.${idx}.end` as const)} placeholder="YYYY" className={inputClass} />
        </Field>
      </div>
      <div className="mt-3 flex justify-end">
        <button type="button" onClick={onRemove} className="text-xs font-medium text-red-600 hover:text-red-700">
          Remove education
        </button>
      </div>
    </div>
  );
}
