/**
 * parseResumeLocally.ts
 *
 * Regex + heuristic resume parser — no API calls.
 * Works on plain text extracted from PDF / Word / text files.
 * Produces the same ParsedResume shape consumed by the profile page.
 */

export interface ParsedContact {
  name: string; email: string; phone: string; location: string; linkedin: string;
}
export interface ParsedExperience {
  title: string; company: string; period: string; bullets: string[];
}
export interface ParsedEducation {
  degree: string; school: string; year: string;
}
export interface ParsedResume {
  contact: ParsedContact;
  summary: string;
  experience: ParsedExperience[];
  education: ParsedEducation[];
  skills: string[];
  certifications: string[];
}

// ── Patterns ──────────────────────────────────────────────────────────────────

const EMAIL_RE    = /[\w.+\-]+@[\w\-]+\.[\w.]+/;
const PHONE_RE    = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}/;
const LINKEDIN_RE = /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[\w\-%.]+\/?/i;
const YEAR_RE     = /\b(19|20)\d{2}\b/;
const DATE_RANGE  = /((Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s*)?\d{4}\s*[-–—]\s*((Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s*\d{4}|[Pp]resent|[Cc]urrent)/;

const SECTION = {
  summary:        /^(summary|objective|profile|about(\s+me)?|professional\s+summary)\s*:?\s*$/i,
  experience:     /^(work\s+)?experience|employment(\s+history)?|work\s+history|professional\s+experience|career(\s+history)?\s*:?\s*$/i,
  education:      /^education(al\s+(background|history))?\s*:?\s*$/i,
  skills:         /^(technical\s+)?skills|core\s+competencies|expertise|technologies|tools\s*:?\s*$/i,
  certifications: /^certifications?|licen[cs]es?|credentials?\s*:?\s*$/i,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function detectSection(line: string): keyof typeof SECTION | null {
  const t = line.trim();
  if (!t || t.length > 60) return null;
  for (const [key, re] of Object.entries(SECTION)) {
    if (re.test(t)) return key as keyof typeof SECTION;
  }
  return null;
}

function isBullet(line: string) {
  return /^[\•\-\*•●◦–—]/.test(line.trim());
}

function stripBullet(line: string) {
  return line.trim().replace(/^[\•\-\*•●◦–—]\s*/, "").trim();
}

// ── Main parser ───────────────────────────────────────────────────────────────

export function parseResumeLocally(rawText: string): ParsedResume {
  const lines = rawText.split(/\r?\n/).map(l => l.trimEnd());

  // ── 1. Contact (scan header — first ~25 lines) ────────────────────────────
  let name = "", email = "", phone = "", location = "", linkedin = "";
  for (let i = 0; i < Math.min(25, lines.length); i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (!linkedin) { const m = line.match(LINKEDIN_RE); if (m) { linkedin = m[0].startsWith("http") ? m[0] : "https://" + m[0]; continue; } }
    if (!email)    { const m = line.match(EMAIL_RE);    if (m) { email    = m[0]; continue; } }
    if (!phone)    { const m = line.match(PHONE_RE);    if (m) { phone    = m[0]; continue; } }
    // City, State / City, Country heuristic
    if (!location && /^[A-Z][a-zA-Z\s]+,\s*[A-Z]{2,}/.test(line)) { location = line; continue; }
    // First short non-blank line that looks like a name (no @, no digits, no URL, < 50 chars)
    if (!name && line.length < 50 && !/[\d@:/]/.test(line) && /[A-Za-z]{2}/.test(line)) {
      name = line;
    }
  }

  // ── 2. Bucket lines into sections ─────────────────────────────────────────
  type Section = keyof typeof SECTION;
  const buckets: Record<Section | "header", string[]> = {
    header: [], summary: [], experience: [], education: [], skills: [], certifications: [],
  };
  let current: Section | "header" = "header";

  for (const line of lines) {
    const sec = detectSection(line);
    if (sec) { current = sec; continue; }
    buckets[current].push(line);
  }

  // ── 3. Summary ────────────────────────────────────────────────────────────
  const summary = buckets.summary.filter(Boolean).join(" ").slice(0, 600);

  // ── 4. Skills ─────────────────────────────────────────────────────────────
  const skillsRaw = buckets.skills.join(" ");
  const skills = skillsRaw
    .split(/[,|•\n]+/)
    .map(s => s.trim())
    .filter(s => s.length > 1 && s.length < 60);

  // ── 5. Certifications ─────────────────────────────────────────────────────
  const certifications = buckets.certifications
    .map(l => isBullet(l) ? stripBullet(l) : l.trim())
    .filter(Boolean);

  // ── 6. Experience ─────────────────────────────────────────────────────────
  const experience: ParsedExperience[] = [];
  let currentJob: ParsedExperience | null = null;

  for (const line of buckets.experience) {
    const t = line.trim();
    if (!t) continue;

    const dateMatch = t.match(DATE_RANGE);
    if (dateMatch) {
      if (currentJob) experience.push(currentJob);
      const period = dateMatch[0];
      const rest = t.replace(period, "").replace(/[|,\-–—]+/g, " ").trim();
      const parts = rest.split(/\s{2,}|[|,]/).map(p => p.trim()).filter(Boolean);
      currentJob = {
        title:   parts[0] ?? "",
        company: parts[1] ?? "",
        period,
        bullets: [],
      };
    } else if (currentJob) {
      if (isBullet(t)) {
        currentJob.bullets.push(stripBullet(t));
      } else if (!currentJob.company && t.length < 80) {
        currentJob.company = t;
      }
    }
  }
  if (currentJob) experience.push(currentJob);

  // ── 7. Education ──────────────────────────────────────────────────────────
  const education: ParsedEducation[] = [];
  let currentEdu: ParsedEducation | null = null;

  for (const line of buckets.education) {
    const t = line.trim();
    if (!t) continue;
    const yearMatch = t.match(YEAR_RE);
    if (yearMatch) {
      if (currentEdu) education.push(currentEdu);
      const year = yearMatch[0];
      const rest = t.replace(year, "").replace(/[|,\-–—]+/g, " ").trim();
      const parts = rest.split(/\s{2,}|[|,]/).map(p => p.trim()).filter(Boolean);
      currentEdu = { degree: parts[0] ?? "", school: parts[1] ?? "", year };
    } else if (currentEdu) {
      if (!currentEdu.school && t.length < 80) currentEdu.school = t;
    } else {
      currentEdu = { degree: t, school: "", year: "" };
    }
  }
  if (currentEdu) education.push(currentEdu);

  return {
    contact: { name, email, phone, location, linkedin },
    summary,
    experience,
    education,
    skills,
    certifications,
  };
}
