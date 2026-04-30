/**
 * resumeService.ts
 *
 * Client-side service for the Resume Builder / Career Profile feature.
 * AI calls route through Supabase Edge Functions (ANTHROPIC_API_KEY lives there).
 *
 * - parseResumeText     → edge fn: parse-resume (text path)
 * - parseResumeFile     → edge fn: parse-resume (converts file client-side first)
 * - saveResumeVersion   → INSERT into resume_versions
 * - listResumeVersions  → SELECT from resume_versions
 * - deleteResumeVersion → DELETE from resume_versions
 * - rewriteResume       → POST /api/resume/rewrite (Sonnet, plan-gated)
 */

import { createClient } from "@/lib/supabase";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ParsedContact {
  name: string;
  email: string;
  phone: string;
  location: string;
}

export interface ParsedExperience {
  title: string;
  company: string;
  period: string;
  bullets: string[];
}

export interface ParsedEducation {
  degree: string;
  school: string;
  year: string;
}

export interface ParsedResume {
  contact: ParsedContact;
  summary: string;
  experience: ParsedExperience[];
  education: ParsedEducation[];
  skills: string[];
  certifications: string[];
}

export interface ResumeVersion {
  id: string;
  user_id: string;
  version_name: string;
  job_type: string | null;
  resume_text: string;
  parsed_data: ParsedResume | null;
  created_at: string;
  updated_at: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function isWordFile(file: File): boolean {
  return (
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    file.type === "application/msword" ||
    file.name.toLowerCase().endsWith(".docx") ||
    file.name.toLowerCase().endsWith(".doc")
  );
}

function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

/** Convert an ArrayBuffer to base64 without stack-overflowing on large files */
function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

// ── Parse ─────────────────────────────────────────────────────────────────────

/**
 * Parse raw resume text via the parse-resume Supabase edge function.
 */
export async function parseResumeText(text: string): Promise<ParsedResume> {
  const supabase = createClient();
  const { data, error } = await supabase.functions.invoke("parse-resume", {
    body: { text },
  });
  if (error) throw new Error(error.message ?? "Parse failed");
  if (data?.error) throw new Error(data.error);
  return data as ParsedResume;
}

/**
 * Parse a file (PDF, Word .docx/.doc, or plain text).
 * Files are converted client-side before sending to the edge function.
 */
export async function parseResumeFile(file: File): Promise<ParsedResume> {
  const supabase = createClient();

  let body: { text?: string; pdfBase64?: string };

  if (isPdfFile(file)) {
    // Send PDF as base64 — Claude handles it natively as a document block
    const arrayBuffer = await file.arrayBuffer();
    body = { pdfBase64: toBase64(arrayBuffer) };

  } else if (isWordFile(file)) {
    // Extract text from Word doc client-side using mammoth
    const mammoth = await import("mammoth");
    const arrayBuffer = await file.arrayBuffer();
    const { value: text, messages } = await mammoth.default.extractRawText({ arrayBuffer });
    if (messages.length > 0) {
      console.warn("[parseResumeFile] mammoth warnings:", messages.map((m) => m.message).join("; "));
    }
    if (!text.trim()) throw new Error("Could not extract text from Word document. Try saving as PDF or pasting the text.");
    body = { text };

  } else {
    // Plain text / other
    const text = await file.text();
    if (text.trim().length < 20) throw new Error("File appears to be empty or too short to parse.");
    body = { text };
  }

  const { data, error } = await supabase.functions.invoke("parse-resume", { body });
  if (error) throw new Error(error.message ?? "Parse failed");
  if (data?.error) throw new Error(data.error);
  return data as ParsedResume;
}

// ── Supabase CRUD ─────────────────────────────────────────────────────────────

export async function saveResumeVersion(opts: {
  versionName: string;
  resumeText: string;
  jobType?: string;
  parsedData?: ParsedResume;
}): Promise<ResumeVersion> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("resume_versions")
    .insert({
      version_name: opts.versionName,
      resume_text: opts.resumeText,
      job_type: opts.jobType ?? null,
      parsed_data: opts.parsedData ?? null,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as ResumeVersion;
}

export async function listResumeVersions(): Promise<ResumeVersion[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("resume_versions")
    .select("id, user_id, version_name, job_type, resume_text, parsed_data, created_at, updated_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ResumeVersion[];
}

export async function deleteResumeVersion(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("resume_versions").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ── Rewrite ───────────────────────────────────────────────────────────────────

export interface RewriteResult {
  rewrittenText: string;
  improvements: string[];
  wordCount: number;
}

export async function rewriteResume(opts: {
  resumeText: string;
  targetRole?: string;
  jobDescription?: string;
}): Promise<RewriteResult> {
  const res = await fetch("/api/resume/rewrite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `Rewrite failed (${res.status})`);
  }
  return res.json() as Promise<RewriteResult>;
}
