/**
 * resumeService.ts
 *
 * Client-side service for Resume Builder / Career Profile.
 *
 * Resume PARSING is FREE — runs entirely against the local regex parser
 * at src/lib/parseResumeLocally.ts (no Anthropic API call, no per-upload
 * cost). The AI endpoint at /api/resume/parse remains in the codebase
 * but is intentionally not called from the client. Re-enable later as
 * a Pro/Premium feature when monetization launches.
 *
 * Text extraction from the file (PDF / Word / TXT) still happens
 * server-side via /api/resume/extract-text for fidelity, then the
 * extracted text is fed to the local regex parser.
 *
 * Resume REWRITE still calls /api/resume/rewrite (Claude Sonnet,
 * plan-gated) — that's a separate feature, only triggered when a user
 * explicitly clicks the AI rewrite button.
 */

import { createClient } from "@/lib/supabase";
import { parseResumeLocally } from "@/lib/parseResumeLocally";
export type { ParsedResume, ParsedContact, ParsedExperience, ParsedEducation } from "@/lib/parseResumeLocally";
import type { ParsedResume } from "@/lib/parseResumeLocally";

// ── Resume Version type ───────────────────────────────────────────────────────

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
 * Parse raw resume text. Local regex parser — no API call, no cost.
 */
export function parseResumeText(text: string): ParsedResume {
  return parseResumeLocally(text);
}

/**
 * Upload a file, extract its raw text server-side, then parse locally.
 * Returns BOTH the raw extracted text and the structured parsed data so
 * callers can store the full-fidelity original text while still having
 * structured fields for profile auto-fill.
 *
 * No AI call — purely regex + heuristic extraction. Zero per-upload cost.
 */
export async function parseResumeFile(
  file: File,
): Promise<{ parsed: ParsedResume; rawText: string }> {
  if (file.size > 10 * 1024 * 1024) throw new Error("File too large (max 10 MB)");

  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch("/api/resume/extract-text", {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `Text extraction failed (${res.status})`);
  }

  const { text: rawText } = (await res.json()) as { text: string };
  const parsed = parseResumeLocally(rawText);
  return { parsed, rawText };
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

// ── Rewrite (still AI — Claude Sonnet, plan-gated) ───────────────────────────

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
