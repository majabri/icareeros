/**
 * parseResumeLocally.ts
 *
 * Regex + heuristic resume parser — no API calls.
 * Works on plain text extracted from PDF / Word / text files.
 * Produces the same ParsedResume shape consumed by the profile page.
 *
 * v3 — improvements over v2:
 *   • Name: handles "Name | email | phone" single-line format; handles titles on
 *     same line as name; more aggressive first-line detection
 *   • Summary: detects implicit summary (text in header before first section
 *     that isn't contact info) — covers resumes with no "Summary:" heading
 *   • Experience: description paragraphs (non-bullet) are now stored in a
 *     dedicated `description` field as well as included in bullets[]
 *   • Education: handles "GPA" lines without mistaking them for degree lines
 *   • Certifications: strips trailing punctuation, dedupes
 */

export interface ParsedContact {
  name: string;
  email: string;
  phone: string;
  location: string;
  linkedin: string;
}
export interface ParsedExperience {
  title: string;
  company: string;
  period: string;
  bullets: string[];
  description?: string;
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

// ── Patterns ──────────────────────────────────────────────────────────────────

const EMAIL_RE    = /[\w.+\-]+@[\w\-]+\.[\w.]+/;
const PHONE_RE    = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}/;
const LINKEDIN_RE = /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[\w\-%.]+\/?/i;
const YEAR_RE     = /\b(19|20)\d{2}\b/;
const URL_RE      = /https?:\/\//i;

const DATE_RANGE = /((Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s*)?\d{4}\s*[-–—]\s*((Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s*\d{4}|[Pp]resent|[Cc]urrent)/;

// IMPORTANT: every alternative is inside one capturing group with ^ before and
// \s*:?\s*$ after, so a keyword inside ordinary text never falsely switches bucket.
const SECTION: Record<string, RegExp> = {
  summary:        /^(summary|objective|profile|about\s+me|professional\s+summary|career\s+objective|career\s+profile|about)\s*:?\s*$/i,
  experience:     /^(work\s+experience|experience|employment(\s+history)?|work\s+history|professional\s+experience|career(\s+history)?|positions?\s+held)\s*:?\s*$/i,
  education:      /^(education(al\s+(background|history))?|academic(\s+background)?|qualifications?)\s*:?\s*$/i,
  skills:         /^(technical\s+skills|skills|core\s+competencies|key\s+competencies|areas\s+of\s+expertise|technologies|tools\s+&\s+technologies|technical\s+expertise|expertise|languages\s+&\s+tools)\s*:?\s*$/i,
  certifications: /^(certifications?(\s+&\s+licenses?)?|licen[cs]es?(\s+&\s+certifications?)?|credentials?|awards?(\s+&\s+certifications?)?|professional\s+(certifications?|development|credentials?)|training(\s+&\s+certifications?)?|accreditations?)\s*:?\s*$/i,
};

const DEGREE_KEYWORDS = /\b(b\.?s\.?|b\.?a\.?|b\.?eng\.?|b\.?sc\.?|b\.?comm?\.?|m\.?s\.?|m\.?a\.?|m\.?b\.?a\.?|m\.?eng\.?|m\.?sc\.?|ph\.?d\.?|d\.?ba\.?|j\.?d\.?|l\.?l\.?[bm]\.?|bachelor|master(?:s)?|doctor(?:ate)?|associate|diploma|certificate|a\.?s\.?|a\.?a\.?)\b/i;

// Words/patterns that indicate a line is NOT a person's name
const NOT_NAME_RE = /\d{4}|@|gpa\s*:|grade\s*:|score\s*:|portfolio|github\.com|twitter\.com/i;

// ── Helpers ───────────────────────────────────────────────────────────────────

function detectSection(line: string): string | null {
  const t = line.trim();
  if (!t || t.length > 70) return null;
  for (const [key, re] of Object.entries(SECTION)) {
    if (re.test(t)) return key;
  }
  return null;
}

function isBullet(line: string) {
  return /^[•\-\*•●◦–—▪▸►]\s/.test(line.trim());
}

function stripBullet(line: string) {
  return line.trim().replace(/^[•\-\*•●◦–—▪▸►]\s*/, "").trim();
}

function looksLikeName(s: string): boolean {
  if (!s || s.length < 2 || s.length > 55) return false;
  if (NOT_NAME_RE.test(s)) return false;
  if (EMAIL_RE.test(s) || PHONE_RE.test(s) || LINKEDIN_RE.test(s)) return false;
  if (URL_RE.test(s)) return false;
  if (detectSection(s)) return false;
  // Must have at least two alphabetic characters and no disqualifying chars
  if (!/[A-Za-z]{2}/.test(s)) return false;
  // Allow letters, spaces, hyphens, apostrophes, periods, commas (for suffixes like Jr., III)
  return /^[A-Za-zÀ-ÖØ-öø-ÿ\s.\-,''']+$/.test(s);
}

function looksLikeContactLine(s: string): boolean {
  return EMAIL_RE.test(s) || PHONE_RE.test(s) || LINKEDIN_RE.test(s) || URL_RE.test(s);
}

function splitTitleCompany(text: string): [string, string] {
  const atMatch = text.match(/^(.+?)\s+(?:at|for|@)\s+(.+)$/i);
  if (atMatch) return [atMatch[1].trim(), atMatch[2].trim()];
  const parts = text.split(/\s*[\|,–—]\s*/).map(p => p.trim()).filter(Boolean);
  if (parts.length >= 2) return [parts[0], parts[1]];
  const spParts = text.split(/\s{2,}/).map(p => p.trim()).filter(Boolean);
  if (spParts.length >= 2) return [spParts[0], spParts[1]];
  return [text, ""];
}

// ── Main parser ───────────────────────────────────────────────────────────────

export function parseResumeLocally(rawText: string): ParsedResume {
  const lines = rawText.split(/\r?\n/).map(l => l.trimEnd());

  // ── 1. Contact (scan header — first ~35 lines) ────────────────────────────
  // NOTE: multiple fields can appear on the same line (e.g. "Jane Doe | jane@x.com | linkedin.com/in/jane")
  // so we never use `continue` after finding a field — we always keep scanning the same line.
  let name = "", email = "", phone = "", location = "", linkedin = "";

  for (let i = 0; i < Math.min(35, lines.length); i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (detectSection(line)) break;

    // Extract every contact field present on this line (no continue — multiple can coexist)
    if (!linkedin) {
      const m = line.match(LINKEDIN_RE);
      if (m) linkedin = m[0].startsWith("http") ? m[0] : "https://" + m[0];
    }
    if (!email) {
      const m = line.match(EMAIL_RE);
      if (m) email = m[0];
    }
    if (!phone) {
      const m = line.match(PHONE_RE);
      if (m) phone = m[0];
    }
    if (!location && /^[A-Z][a-zA-Z\s]+,\s*[A-Z]{2,}/.test(line) && line.length < 60
        && !EMAIL_RE.test(line) && !PHONE_RE.test(line)) {
      location = line;
    }

    // Name: split on | or • separators and check each segment
    if (!name) {
      const segments = (line.includes("|") || line.includes("•"))
        ? line.split(/\s*[|•]\s*/).map(s => s.trim()).filter(Boolean)
        : [line];
      for (const seg of segments) {
        // Must look like a name and have at least 2 words (first + last)
        if (looksLikeName(seg) && seg.trim().split(/\s+/).length >= 2) {
          name = seg;
          break;
        }
      }
      // Fallback: whole line as name if it qualifies (single-word names are rare but possible)
      if (!name && looksLikeName(line)) {
        name = line;
      }
    }

    if (name && email && phone && linkedin) break;
  }

  // ── 2. Bucket lines into sections ─────────────────────────────────────────
  type SectionKey = "header" | "summary" | "experience" | "education" | "skills" | "certifications";
  const buckets: Record<SectionKey, string[]> = {
    header: [], summary: [], experience: [], education: [], skills: [], certifications: [],
  };
  let current: SectionKey = "header";

  for (const line of lines) {
    const sec = detectSection(line);
    if (sec && sec in buckets) { current = sec as SectionKey; continue; }
    buckets[current].push(line);
  }

  // ── 3. Summary ────────────────────────────────────────────────────────────
  // Prefer explicit summary bucket; fall back to implicit text in header bucket
  let summary = buckets.summary.map(l => l.trim()).filter(Boolean).join(" ").slice(0, 800);

  if (!summary) {
    // Extract implicit summary: lines in header bucket that aren't contact info or the name
    let pastContact = false;
    const implicitLines: string[] = [];

    for (const rawLine of buckets.header) {
      const t = rawLine.trim();
      if (!t) {
        // A blank line after we've started collecting = end of summary block
        if (implicitLines.length > 0) break;
        continue;
      }
      if (detectSection(t)) break;

      // Skip contact info lines
      if (looksLikeContactLine(t)) { pastContact = true; continue; }
      // Skip lines that look like the name (short all-word line near top)
      if (!pastContact && looksLikeName(t) && t.split(/\s+/).length <= 5) continue;
      // Skip location-like lines
      if (/^[A-Z][a-zA-Z\s]+,\s*[A-Z]{2,}/.test(t) && t.length < 60) { pastContact = true; continue; }

      // Lines with separators near top are likely a title/tagline combo
      if (!pastContact && t.includes("|") && t.length < 80) { pastContact = true; continue; }

      // Substantive line — candidate for summary
      if (t.length > 25) {
        pastContact = true;
        implicitLines.push(t);
      }
    }
    summary = implicitLines.join(" ").slice(0, 800);
  }

  // ── 4. Skills ─────────────────────────────────────────────────────────────
  const skillsRaw = buckets.skills.join(" ");
  const skills = skillsRaw
    .split(/[,|•\n•]+/)
    .map(s => s.trim())
    .filter(s => s.length > 1 && s.length < 60 && !DEGREE_KEYWORDS.test(s));

  // ── 5. Certifications ─────────────────────────────────────────────────────
  const certSet = new Set<string>();
  const certifications: string[] = [];
  for (const rawLine of buckets.certifications) {
    const line = isBullet(rawLine) ? stripBullet(rawLine) : rawLine.trim();
    if (!line) continue;

    const commaParts = line.split(",").map(p => p.trim().replace(/[.,;]+$/, "")).filter(Boolean);
    const items = commaParts.length > 1 && commaParts.every(p => p.length < 80)
      ? commaParts
      : [line.replace(/[.,;]+$/, "")];

    for (const item of items) {
      if (item.length > 2 && !certSet.has(item.toLowerCase())) {
        certSet.add(item.toLowerCase());
        certifications.push(item);
      }
    }
  }

  // ── 6. Experience ─────────────────────────────────────────────────────────
  // Two-pass: find date-range anchors, then look backward for title/company
  // and forward for description/bullets.
  const experience: ParsedExperience[] = [];
  const expLines = buckets.experience.map((l: string) => l.trim());

  const dateIndices: number[] = [];
  for (let i = 0; i < expLines.length; i++) {
    if (expLines[i].match(DATE_RANGE)) dateIndices.push(i);
  }

  for (let di = 0; di < dateIndices.length; di++) {
    const di0      = dateIndices[di];
    const dateLine = expLines[di0];
    const period   = dateLine.match(DATE_RANGE)![0];
    const inlineText = dateLine.replace(period, "").replace(/^[\s\-–—|,]+|[\s\-–—|,]+$/g, "").trim();

    // ── Title / company: look backward from the date line ────────────────
    let title = "", company = "";
    const priorLines: string[] = [];
    for (let k = di0 - 1; k >= 0 && priorLines.length < 3; k--) {
      const l = expLines[k];
      if (l === undefined || l === null) break;
      if (!l) break;                                    // blank line → stop
      if (isBullet(l) || !!l.match(DATE_RANGE)) break; // bullet/date → stop
      if (l.length < 120) priorLines.unshift(l);
    }

    if (inlineText && priorLines.length > 0) {
      title   = priorLines[0];
      company = priorLines.length >= 2
        ? priorLines[1]
        : (inlineText.split(/\s*[\|,]\s*/).filter(Boolean)[0] ?? inlineText);
    } else if (inlineText) {
      [title, company] = splitTitleCompany(inlineText);
    } else if (priorLines.length >= 2) {
      title = priorLines[0]; company = priorLines[1];
    } else if (priorLines.length === 1) {
      [title, company] = splitTitleCompany(priorLines[0]);
      if (!company) title = priorLines[0];
    }

    // ── Description / bullets: forward scan ──────────────────────────────
    const nextDi = di < dateIndices.length - 1 ? dateIndices[di + 1] : expLines.length;

    // Exclude header lines of next job (non-bullet, short, before next date)
    let bodyEnd = nextDi;
    if (di < dateIndices.length - 1) {
      let k = nextDi - 1;
      while (k > di0) {
        const l = expLines[k];
        if (!l) break;
        if (isBullet(l)) break;
        if (l.length < 100) { bodyEnd = k; k--; }
        else break;
      }
    }

    const bullets: string[] = [];
    const descriptionLines: string[] = [];
    for (let j = di0 + 1; j < bodyEnd; j++) {
      const l = expLines[j];
      if (!l) continue;
      if (isBullet(l)) {
        bullets.push(stripBullet(l));
      } else {
        // Non-bullet, non-blank line after the date = description paragraph
        descriptionLines.push(l);
        bullets.push(l); // also include in bullets[] for backwards compat
      }
    }

    const description = descriptionLines.join(" ").trim();
    experience.push({ title, company, period, bullets, description: description || undefined });
  }

  // ── 7. Education ──────────────────────────────────────────────────────────
  const education: ParsedEducation[] = [];
  let currentEdu: ParsedEducation | null = null;

  for (const rawLine of buckets.education) {
    const t = rawLine.trim();
    if (!t) continue;

    // Skip GPA/grade lines — they're not degrees
    if (/^gpa\s*:/i.test(t) || /^grade\s*:/i.test(t)) continue;

    const yearMatch = t.match(YEAR_RE);
    const hasDegree = DEGREE_KEYWORDS.test(t);

    if (hasDegree && !yearMatch) {
      if (currentEdu) education.push(currentEdu);
      const parts = t.split(/\s*[\|,]\s*/).map(p => p.trim()).filter(Boolean);
      currentEdu = parts.length >= 2
        ? { degree: parts[0], school: parts[1], year: "" }
        : { degree: t, school: "", year: "" };
    } else if (hasDegree && yearMatch) {
      if (currentEdu) education.push(currentEdu);
      const year = yearMatch[0];
      const withoutYear = t.replace(year, "").replace(/[|\-–—,]+/g, " ").trim();
      const parts = withoutYear.split(/\s{2,}|\s*[|,]\s*/).map(p => p.trim()).filter(Boolean);
      currentEdu = { degree: parts[0] ?? withoutYear, school: parts[1] ?? "", year };
    } else if (yearMatch && currentEdu) {
      currentEdu.year = yearMatch[0];
      const withoutYear = t.replace(yearMatch[0], "").replace(/[|\-–—,]+/g, " ").trim();
      if (withoutYear && !currentEdu.school) currentEdu.school = withoutYear;
    } else if (yearMatch && !currentEdu) {
      const year = yearMatch[0];
      const rest = t.replace(year, "").replace(/[|\-–—,]+/g, " ").trim();
      const parts = rest.split(/\s{2,}|\s*[|,]\s*/).map(p => p.trim()).filter(Boolean);
      currentEdu = { degree: parts[0] ?? "", school: parts[1] ?? "", year };
    } else if (currentEdu) {
      if (!currentEdu.school && t.length < 100) currentEdu.school = t;
      else if (!currentEdu.degree && t.length < 100) currentEdu.degree = t;
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
