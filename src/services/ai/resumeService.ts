/**
 * resumeService.ts
 *
 * Client-side service for Resume Builder / Career Profile.
 *
 * Resume PARSING uses the AI parser at /api/resume/parse (Claude Sonnet).
 * Falls back to the regex-based local parser ONLY when the AI call fails,
 * so the app stays usable even if Claude is down.
 *
 * Resume REWRITE calls /api/resume/rewrite (Claude Sonnet, plan-gated).
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
 * Parse raw resume text. Tries the AI parser first; falls back to the
 * local regex parser if the API call fails.
 */
export async function parseResumeText(text: string): Promise<ParsedResume> {
  try {
    const res = await fetch("/api/resume/parse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error(`AI parse failed (${res.status})`);
    return (await res.json()) as ParsedResume;
  } catch (err) {
    console.warn("[parseResumeText] AI parse failed, falling back to local parser:", err);
    return parseResumeLocally(text);
  }
}

/**
 * Synchronous fallback for callers that cannot await — uses regex parser only.
 * Prefer parseResumeText() (async) for higher-fidelity extraction.
 */
export function parseResumeTextSync(text: string): ParsedResume {
  return parseResumeLocally(text);
}

/**
 * Upload a file, parse it via the AI parser (/api/resume/parse) AND extract
 * the raw text (/api/resume/extract-text). Both calls run in parallel.
 *
 * On AI parse failure, falls back to the local regex parser using the
 * extracted raw text — the app keeps working but extraction is less rich.
 *
 * Returns BOTH the raw extracted text (for storage / display) AND the
 * structured parsed data (for the profile page auto-fill, etc.).
 */
export async function parseResumeFile(
  file: File,
): Promise<{ parsed: ParsedResume; rawText: string }> {
  if (file.size > 10 * 1024 * 1024) throw new Error("File too large (max 10 MB)");

  // Two parallel uploads — extract-text always succeeds quickly, AI parse is the
  // higher-quality path. We need rawText regardless (it's stored on the resume
  // version), so we always make the extract-text call.
  const aiFormData = new FormData();
  aiFormData.append("file", file);
  const txtFormData = new FormData();
  txtFormData.append("file", file);

  const [aiRes, txtRes] = await Promise.allSettled([
    fetch("/api/resume/parse",         { method: "POST", body: aiFormData  }),
    fetch("/api/resume/extract-text",  { method: "POST", body: txtFormData }),
  ]);

  // 1. Raw text — must succeed (it's the source of truth we store).
  if (txtRes.status !== "fulfilled" || !txtRes.value.ok) {
    const status = txtRes.status === "fulfilled" ? txtRes.value.status : "network";
    throw new Error(`Text extraction failed (${status})`);
  }
  const { text: rawText } = (await txtRes.value.json()) as { text: string };

  // 2. AI parse — try, fall back to local regex parse if it fails.
  if (aiRes.status === "fulfilled" && aiRes.value.ok) {
    const parsed = (await aiRes.value.json()) as ParsedResume;
    return { parsed, rawText };
  }

  // Fallback: local regex parser on the raw text.
  const fallbackError = aiRes.status === "fulfilled"
    ? `AI parse responded ${aiRes.value.status}`
    : `AI parse rejected: ${aiRes.reason}`;
  console.warn("[parseResumeFile] AI parse failed, using local regex fallback:", fallbackError);
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
