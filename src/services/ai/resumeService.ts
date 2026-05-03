/**
 * resumeService.ts
 *
 * Client-side service for the Career Profile (/mycareer/profile) and
 * Resume Advisor (/resume) pages.
 *
 * Resume PARSING runs a tiered cascade:
 *
 *   tier 1 — local regex parser (parseResumeLocally) — free, always runs
 *   tier 2 — AI cascade via /api/resume/parse-ai — only fires if needed
 *            (which itself cascades Lovable Gateway → Gemini Flash on
 *             the server, depending on which keys are configured)
 *
 * The regex parser handles the easy 80% (clean Skills sections, well-
 * formatted contact blocks). When it produces an incomplete result
 * (zero work-history entries, or all entries with empty bullets), the
 * AI cascade fills the gaps. Output schema is the same either way —
 * callers do not need to know which tier answered.
 *
 * Text extraction (PDF / Word / TXT) is server-side via
 * /api/resume/extract-text. We always store the raw text so the user
 * can re-author later or run different analyses against it.
 *
 * Resume REWRITE is separate — calls /api/resume/rewrite, plan-gated,
 * only on explicit AI rewrite button click. Not part of the parse path.
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
 * Upload a file, extract its raw text server-side, then parse via the
 * tiered cascade. Returns the raw extracted text PLUS the structured
 * parsed data.
 *
 * Cascade behavior:
 *   1. Regex (parseResumeLocally) always runs.
 *   2. If regex output is incomplete (no work entries, or all entries
 *      with empty bullets), the AI cascade fills the gaps. AI wins for
 *      experience / education / summary; regex output stays the source
 *      for skills harvesting (its curated SKILL_DICT is reliable).
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

  // Tier 1 — regex baseline. Provides instant offline fallback even if AI fails.
  const baseline = parseResumeLocally(rawText);

  // Tier 2 — AI cascade ALWAYS runs when available. Real-world resumes use
  // tab-separated layouts, no bullet markers, mixed orderings — regex alone
  // mis-buckets fields (e.g. company name lands in title slot, dates land in
  // company slot). Gemini Flash is free + fast, so we always prefer its
  // structured output. AI failure → regex baseline is returned unchanged.
  const ai = await tryAiCascade(rawText).catch(() => null);
  if (ai) return { parsed: mergeAiIntoBaseline(baseline, ai), rawText };

  return { parsed: baseline, rawText };
}

// ── Cascade helpers ──────────────────────────────────────────────────────────

function regexResultIncomplete(p: ParsedResume): boolean {
  if (p.experience.length === 0) return true;
  const allBulletsEmpty = p.experience.every(e => !e.bullets || e.bullets.length === 0);
  return allBulletsEmpty;
}

interface AiCascadeResult {
  _source: "anthropic" | "lovable" | "gemini" | "none";
  contact: {
    name: string; email: string; phone: string; location: string;
    linkedin: string; github: string; portfolio: string; headline: string;
  };
  summary: string;
  experience: Array<{
    title: string; company: string; location: string;
    period: string; start_date: string; end_date: string;
    bullets: string[]; technologies: string[];
  }>;
  education: Array<{
    degree: string; field_of_study: string; school: string;
    location: string; year: string; gpa: string; honors: string;
  }>;
  skills: string[];
  certifications: string[];
}

async function tryAiCascade(text: string): Promise<AiCascadeResult | null> {
  const res = await fetch("/api/resume/parse-ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as AiCascadeResult;
  if (!data || data._source === "none") return null;
  return data;
}

function mergeAiIntoBaseline(baseline: ParsedResume, ai: AiCascadeResult): ParsedResume {
  return {
    contact: {
      name:     baseline.contact.name     || ai.contact.name,
      email:    baseline.contact.email    || ai.contact.email,
      phone:    baseline.contact.phone    || ai.contact.phone,
      location: baseline.contact.location || ai.contact.location,
      linkedin: baseline.contact.linkedin || ai.contact.linkedin,
    },
    summary: (ai.summary && ai.summary.length > baseline.summary.length)
      ? ai.summary
      : baseline.summary,
    experience: ai.experience.length > 0
      ? ai.experience.map(e => ({
          title:   e.title,
          company: e.company,
          period:  e.period || [e.start_date, e.end_date].filter(Boolean).join(" - "),
          bullets: e.bullets,
          description: e.bullets.join("\n"),
        }))
      : baseline.experience,
    education: ai.education.length > 0
      ? ai.education.map(e => ({
          degree: e.field_of_study ? (e.degree + " " + e.field_of_study).trim() : e.degree,
          school: e.school,
          year:   e.year,
        }))
      : baseline.education,
    skills:         dedupe([...baseline.skills, ...ai.skills]),
    certifications: dedupe([...baseline.certifications, ...ai.certifications]),
    achievements:   baseline.achievements,
  };
}

function dedupe(arr: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of arr) {
    const key = (item ?? "").toLowerCase().trim();
    if (key && !seen.has(key)) { seen.add(key); out.push(item.trim()); }
  }
  return out;
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
