/**
 * resumeService.ts
 *
 * Client-side service for the Resume Builder feature.
 * - parseResumeText     → POST /api/resume/parse (text path)
 * - parseResumeFile     → POST /api/resume/parse (PDF base64 path)
 * - saveResumeVersion   → INSERT into resume_versions
 * - listResumeVersions  → SELECT from resume_versions
 * - deleteResumeVersion → DELETE from resume_versions
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

// ── Parse ─────────────────────────────────────────────────────────────────────

/**
 * Parse raw resume text via the server-side API route.
 */
export async function parseResumeText(text: string): Promise<ParsedResume> {
  const res = await fetch("/api/resume/parse", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `Parse failed (${res.status})`);
  }

  return res.json() as Promise<ParsedResume>;
}

/**
 * Parse a PDF file (sent as base64) via the server-side API route.
 */
export async function parseResumeFile(file: File): Promise<ParsedResume> {
  const arrayBuffer = await file.arrayBuffer();
  const uint8 = new Uint8Array(arrayBuffer);
  let binary = "";
  for (let i = 0; i < uint8.length; i++) {
    binary += String.fromCharCode(uint8[i]);
  }
  const fileBase64 = btoa(binary);

  const res = await fetch("/api/resume/parse", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileBase64, mimeType: file.type }),
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `Parse failed (${res.status})`);
  }

  return res.json() as Promise<ParsedResume>;
}

// ── Supabase CRUD ─────────────────────────────────────────────────────────────

/**
 * Save a resume version to Supabase.
 */
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

/**
 * List all resume versions for the current user (newest first).
 */
export async function listResumeVersions(): Promise<ResumeVersion[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("resume_versions")
    .select("id, user_id, version_name, job_type, resume_text, parsed_data, created_at, updated_at")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as ResumeVersion[];
}

/**
 * Delete a resume version by ID.
 */
export async function deleteResumeVersion(id: string): Promise<void> {
  const supabase = createClient();

  const { error } = await supabase
    .from("resume_versions")
    .delete()
    .eq("id", id);

  if (error) throw new Error(error.message);
}
