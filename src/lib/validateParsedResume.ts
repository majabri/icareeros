/**
 * validateParsedResume.ts
 *
 * Post-parse validator. Inspects a ParsedResume and the raw text it came from,
 * and tags each meaningful field with one of:
 *
 *   - "ok"            field has a value, looks valid
 *   - "absent"        field is empty AND we can't tell whether the source had it
 *                     (e.g. LinkedIn URL — most resumes don't have one)
 *   - "needs-review"  field is empty BUT related fields are populated, suggesting
 *                     the source likely had this field too (e.g. no summary on a
 *                     resume that has 7 jobs)
 *   - "missing"       field is empty AND we have strong evidence the source had
 *                     this info (e.g. a job entry has title + dates but bullets:[])
 *
 * The /mycareer/profile page calls this after the parser finishes and shows a
 * review banner listing only "missing" + "needs-review" fields, with raw-text
 * hints next to each so the user can see where in their resume to look.
 *
 * No AI, no API spend. Pure heuristic over the parsed structure.
 */

import type { ParsedResume } from "@/lib/parseResumeLocally";

export type FieldStatus = "ok" | "absent" | "needs-review" | "missing";

export interface ParsedResumeGap {
  /** Coarse section bucket — used to group gaps in the UI. */
  section: "Contact" | "Summary" | "Work Experience" | "Education" | "Skills";
  /** Human-readable label, e.g. "Phone number" or "Abbott Laboratories — job description". */
  field: string;
  status: Exclude<FieldStatus, "ok" | "absent">;
  /** Raw-text excerpt the user can read to manually fill in. */
  hint?: string;
  /** Index into parsed.experience for work-experience gaps. */
  jobIndex?: number;
}

export interface ValidationResult {
  overall: "complete" | "needs-review";
  gaps: ParsedResumeGap[];
  /** Convenience counts for the UI summary. */
  counts: { missing: number; needsReview: number };
}

/**
 * Validate a ParsedResume against the raw text it came from.
 *
 * Heuristics:
 *   - Contact name/email/phone: required (almost every resume has them)
 *   - Contact location: needs-review if email + phone are present (suggests address line existed)
 *   - LinkedIn / GitHub / portfolio: never flagged (truly optional)
 *   - Summary: needs-review if shorter than 20 chars
 *   - Per-job: missing description if the job has title/company/period but no bullets
 *   - Skills: needs-review if empty (most resumes have at least 3-5)
 *   - Education / Certifications: never flagged (genuinely optional)
 */
export function validateParsedResume(
  parsed: ParsedResume,
  rawText: string
): ValidationResult {
  const gaps: ParsedResumeGap[] = [];
  const c = parsed.contact;

  // ── Contact ──────────────────────────────────────────────────────────────
  if (!c.name?.trim()) {
    gaps.push({ section: "Contact", field: "Full name", status: "missing" });
  }
  if (!c.email?.trim()) {
    gaps.push({ section: "Contact", field: "Email", status: "missing" });
  }
  if (!c.phone?.trim()) {
    gaps.push({ section: "Contact", field: "Phone number", status: "missing" });
  }
  if (!c.location?.trim() && c.email && c.phone) {
    gaps.push({ section: "Contact", field: "Location", status: "needs-review" });
  }
  // linkedin: never flag — many resumes legitimately don't have one

  // ── Summary ──────────────────────────────────────────────────────────────
  const summary = parsed.summary?.trim() ?? "";
  if (!summary || summary.length < 20) {
    gaps.push({
      section: "Summary",
      field: "Professional summary",
      status: "needs-review",
    });
  }

  // ── Work Experience: per-job description gap detection ──────────────────
  parsed.experience.forEach((job, idx) => {
    const hasContext = !!(job.title?.trim() || job.company?.trim() || job.period?.trim());
    const hasBullets = !!(job.bullets && job.bullets.length > 0);
    if (hasContext && !hasBullets) {
      const label = job.company?.trim() || job.title?.trim() || `Job #${idx + 1}`;
      gaps.push({
        section: "Work Experience",
        field: `${label} — job description`,
        status: "missing",
        jobIndex: idx,
        hint: extractHintFromRawText(rawText, job.company || job.title || ""),
      });
    }
  });

  // ── Skills ───────────────────────────────────────────────────────────────
  if (!parsed.skills || parsed.skills.length === 0) {
    gaps.push({
      section: "Skills",
      field: "Skills list",
      status: "needs-review",
    });
  }

  // education + certifications: optional, never flagged

  const counts = {
    missing: gaps.filter(g => g.status === "missing").length,
    needsReview: gaps.filter(g => g.status === "needs-review").length,
  };

  return {
    overall: gaps.length === 0 ? "complete" : "needs-review",
    gaps,
    counts,
  };
}

/**
 * Find the section of raw text that mentions `anchor` (typically a company name)
 * and return the next ~500 chars as a "hint" the user can read to manually fill
 * in the missing description.
 *
 * Returns undefined if anchor isn't found (parser disagreed with text — the
 * upstream gap is bigger than just an empty bullets[] array).
 */
function extractHintFromRawText(
  rawText: string,
  anchor: string
): string | undefined {
  const trimmed = anchor.trim();
  if (!trimmed) return undefined;

  const idx = rawText.toLowerCase().indexOf(trimmed.toLowerCase());
  if (idx === -1) return undefined;

  // Skip past the anchor itself, then take the next ~500 chars. Trim and
  // collapse internal whitespace runs but preserve newlines so the user can
  // see the structure of the source.
  const start = idx + trimmed.length;
  const end = Math.min(start + 500, rawText.length);
  const slice = rawText.slice(start, end).trim();

  // Truncate at next clear company-header-shaped line if we can detect one.
  // Heuristic: a short ALL-CAPS line on its own. Cuts the hint at the next job.
  const lines = slice.split(/\r?\n/);
  const stopAt = lines.findIndex(
    (l, i) =>
      i > 2 && // skip the first couple lines (current job's content)
      l.trim().length > 0 &&
      l.trim().length < 50 &&
      l.trim() === l.trim().toUpperCase() &&
      /[A-Z]/.test(l)
  );
  const trimmedLines = stopAt > 0 ? lines.slice(0, stopAt) : lines;
  return trimmedLines.join("\n").trim() || undefined;
}
