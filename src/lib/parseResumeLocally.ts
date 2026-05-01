/**
 * parseResumeLocally.ts
 *
 * Regex + heuristic resume parser — no API calls.
 * Works on plain text extracted from PDF / Word / text files.
 * Produces the same ParsedResume shape consumed by the profile page.
 *
 * v2 — fixes:
 *   • Properly anchored section regexes (no more false-positive section splits)
 *   • Experience description: captures non-bullet text as description
 *   • Experience format B: Title\nCompany\nDate (date on its own line)
 *   • Education: degree-keyword detection + comma/pipe/multi-line formats
 *   • Certifications: comma-separated lists, more header variants, bullet stripping
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

const DATE_RANGE = /((Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s*)?\d{4}\s*[-–—]\s*((Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s*\d{4}|[Pp]resent|[Cc]urrent)/;

// ── IMPORTANT: every alternative must be fully anchored (^...$) so that a
//    section keyword appearing inside ordinary text doesn't falsely switch
//    the current bucket. We achieve this by grouping all alternatives inside
//    one capturing group that is itself preceded by ^ and followed by \s*:?\s*$.

const SECTION: Record<string, RegExp> = {
  summary:        /^(summary|objective|profile|about\s+me|professional\s+summary|career\s+objective|career\s+profile)\s*:?\s*$/i,
  experience:     /^(work\s+experience|experience|employment(\s+history)?|work\s+history|professional\s+experience|career(\s+history)?|positions?\s+held)\s*:?\s*$/i,
  education:      /^(education(al\s+(background|history))?|academic(\s+background)?|qualifications?)\s*:?\s*$/i,
  skills:         /^(technical\s+skills|skills|core\s+competencies|key\s+competencies|areas\s+of\s+expertise|technologies|tools\s+&\s+technologies|technical\s+expertise|expertise|languages\s+&\s+tools)\s*:?\s*$/i,
  certifications: /^(certifications?(\s+&\s+licenses?)?|licen[cs]es?(\s+&\s+certifications?)?|credentials?|awards?(\s+&\s+certifications?)?|professional\s+(certifications?|development|credentials?)|training(\s+&\s+certifications?)?|accreditations?)\s*:?\s*$/i,
};

const DEGREE_KEYWORDS = /\b(b\.?s\.?|b\.?a\.?|b\.?eng\.?|b\.?sc\.?|b\.?comm?\.?|m\.?s\.?|m\.?a\.?|m\.?b\.?a\.?|m\.?eng\.?|m\.?sc\.?|ph\.?d\.?|d\.?ba\.?|j\.?d\.?|l\.?l\.?[bm]\.?|bachelor|master(?:s)?|doctor(?:ate)?|associate|diploma|certificate|a\.?s\.?|a\.?a\.?)\b/i;

// ── Helpers ───────────────────────────────────────────────────────────────────

function detectSection(line: string): string | null {
  const t = line.trim();
  // Section headers are short lines; skip long lines to avoid false positives
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

function splitTitleCompany(text: string): [string, string] {
  // "Title at Company" / "Title for Company"
  const atMatch = text.match(/^(.+?)\s+(?:at|for|@)\s+(.+)$/i);
  if (atMatch) return [atMatch[1].trim(), atMatch[2].trim()];
  // "Title | Company" / "Title, Company" / "Title – Company"
  const parts = text.split(/\s*[\|,–—]\s*/).map(p => p.trim()).filter(Boolean);
  if (parts.length >= 2) return [parts[0], parts[1]];
  // "Title   Company" (2+ spaces)
  const spParts = text.split(/\s{2,}/).map(p => p.trim()).filter(Boolean);
  if (spParts.length >= 2) return [spParts[0], spParts[1]];
  return [text, ""];
}

// ── Main parser ───────────────────────────────────────────────────────────────

export function parseResumeLocally(rawText: string): ParsedResume {
  const lines = rawText.split(/\r?\n/).map(l => l.trimEnd());

  // ── 1. Contact (scan header — first ~30 lines) ────────────────────────────
  let name = "", email = "", phone = "", location = "", linkedin = "";
  for (let i = 0; i < Math.min(30, lines.length); i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (!linkedin) { const m = line.match(LINKEDIN_RE); if (m) { linkedin = m[0].startsWith("http") ? m[0] : "https://" + m[0]; continue; } }
    if (!email)    { const m = line.match(EMAIL_RE);    if (m) { email = m[0]; continue; } }
    if (!phone)    { const m = line.match(PHONE_RE);    if (m) { phone = m[0]; continue; } }
    // City, State / City, Country heuristic
    if (!location && /^[A-Z][a-zA-Z\s]+,\s*[A-Z]{2,}/.test(line) && line.length < 60) {
      location = line; continue;
    }
    // First short non-blank line that looks like a name
    if (!name && line.length < 55 && !/[\d@:/|]/.test(line) && /[A-Za-z]{2}/.test(line)
        && !detectSection(line)) {
      name = line;
    }
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
  const summary = buckets.summary
    .map(l => l.trim())
    .filter(Boolean)
    .join(" ")
    .slice(0, 800);

  // ── 4. Skills ─────────────────────────────────────────────────────────────
  const skillsRaw = buckets.skills.join(" ");
  const skills = skillsRaw
    .split(/[,|•\n•]+/)
    .map(s => s.trim())
    .filter(s => s.length > 1 && s.length < 60 && !DEGREE_KEYWORDS.test(s));

  // ── 5. Certifications ─────────────────────────────────────────────────────
  // Collect raw cert lines, handle bullet stripping + comma-separated lists
  const certifications: string[] = [];
  for (const rawLine of buckets.certifications) {
    const line = isBullet(rawLine) ? stripBullet(rawLine) : rawLine.trim();
    if (!line) continue;

    // Some resumes list multiple certs comma-separated on one line
    // Only split on commas if each part looks like a cert (not a long sentence)
    const commaParts = line.split(",").map(p => p.trim()).filter(Boolean);
    if (commaParts.length > 1 && commaParts.every(p => p.length < 80)) {
      certifications.push(...commaParts);
    } else {
      certifications.push(line);
    }
  }

  // ── 6. Experience ─────────────────────────────────────────────────────────
  // Two-pass approach: find all date-range anchors first, then look backward
  // for title/company and forward for description/bullets.
  // Handles Format A: "Title | Company | Date" and Format B: "Title\nCompany\nDate\n-bullets"
  const experience: ParsedExperience[] = [];
  const expLines = buckets.experience.map((l: string) => l.trim());

  // Step 1: collect date-range line indices
  const dateIndices: number[] = [];
  for (let i = 0; i < expLines.length; i++) {
    if (expLines[i].match(DATE_RANGE)) dateIndices.push(i);
  }

  for (let di = 0; di < dateIndices.length; di++) {
    const di0      = dateIndices[di];
    const dateLine = expLines[di0];
    const period   = dateLine.match(DATE_RANGE)![0];
    // Strip date but keep separators (|, ,) for splitTitleCompany
    const inlineText = dateLine.replace(period, "").replace(/^[\s\-–—|,]+|[\s\-–—|,]+$/g, "").trim();

    // ── Title / company: look backward from the date line ────────────────
    let title = "", company = "";
    const priorLines: string[] = [];
    for (let k = di0 - 1; k >= 0 && priorLines.length < 2; k--) {
      const l = expLines[k];
      if (!l) break;                                    // blank line = separator → stop
      if (isBullet(l) || !!l.match(DATE_RANGE)) break; // bullet or another date → stop
      if (l.length < 100) priorLines.unshift(l);
    }

    if (inlineText && priorLines.length > 0) {
      // Title is in the prior line; inline text is "Company | Location..."
      title   = priorLines[0];
      company = priorLines.length >= 2
        ? priorLines[1]
        : (inlineText.split(/\s*[\|,]\s*/).filter(Boolean)[0] ?? inlineText);
    } else if (inlineText) {
      // Everything on the date line: "Title | Company | Date"
      [title, company] = splitTitleCompany(inlineText);
    } else if (priorLines.length >= 2) {
      title = priorLines[0]; company = priorLines[1];
    } else if (priorLines.length === 1) {
      [title, company] = splitTitleCompany(priorLines[0]);
      if (!company) title = priorLines[0];
    }

    // ── Description / bullets: forward scan ──────────────────────────────
    const nextDi = di < dateIndices.length - 1 ? dateIndices[di + 1] : expLines.length;

    // Exclude the next job's header lines (non-bullet short lines before next date)
    let bodyEnd = nextDi;
    if (di < dateIndices.length - 1) {
      let k = nextDi - 1;
      while (k > di0) {
        const l = expLines[k];
        if (!l) break;             // blank line = separator → stop scanning back
        if (isBullet(l)) break;   // bullet belongs to this job → stop
        if (l.length < 100) { bodyEnd = k; k--; }
        else break;
      }
    }

    const bullets: string[] = [];
    for (let j = di0 + 1; j < bodyEnd; j++) {
      const l = expLines[j];
      if (!l) continue;
      if (isBullet(l)) bullets.push(stripBullet(l));
      else bullets.push(l);   // description paragraph
    }

    experience.push({ title, company, period, bullets });
  }

  // ── 7. Education ──────────────────────────────────────────────────────────
  // Handles:
  //   • "B.S. Computer Science | University of X | 2020"
  //   • "B.S. Computer Science, University of X, 2020"
  //   • Multi-line: "B.S. Computer Science\nUniversity of X\n2020"
  //   • No year: "Bachelor of Science in Computer Science\nMIT"
  const education: ParsedEducation[] = [];
  let currentEdu: ParsedEducation | null = null;

  for (const rawLine of buckets.education) {
    const t = rawLine.trim();
    if (!t) continue;

    const yearMatch = t.match(YEAR_RE);

    // Does this line contain a degree keyword?
    const hasDegree = DEGREE_KEYWORDS.test(t);

    if (hasDegree && !yearMatch) {
      // Degree line without a year — try to parse degree + school on same line
      if (currentEdu) education.push(currentEdu);
      const parts = t.split(/\s*[\|,]\s*/).map(p => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        currentEdu = { degree: parts[0], school: parts[1], year: "" };
      } else {
        currentEdu = { degree: t, school: "", year: "" };
      }
    } else if (hasDegree && yearMatch) {
      // Degree + year on same line (maybe also school)
      if (currentEdu) education.push(currentEdu);
      const year = yearMatch[0];
      const withoutYear = t.replace(year, "").replace(/[|\-–—,]+/g, " ").trim();
      const parts = withoutYear.split(/\s{2,}|\s*[|,]\s*/).map(p => p.trim()).filter(Boolean);
      currentEdu = { degree: parts[0] ?? withoutYear, school: parts[1] ?? "", year };
    } else if (yearMatch && currentEdu) {
      // Year line that comes after a degree line already set
      currentEdu.year = yearMatch[0];
      // Rest of line might be the school
      const withoutYear = t.replace(yearMatch[0], "").replace(/[|\-–—,]+/g, " ").trim();
      if (withoutYear && !currentEdu.school) currentEdu.school = withoutYear;
    } else if (yearMatch && !currentEdu) {
      // Year appears first — create edu entry, degree will fill in later
      const year = yearMatch[0];
      const rest = t.replace(year, "").replace(/[|\-–—,]+/g, " ").trim();
      const parts = rest.split(/\s{2,}|\s*[|,]\s*/).map(p => p.trim()).filter(Boolean);
      currentEdu = { degree: parts[0] ?? "", school: parts[1] ?? "", year };
    } else if (currentEdu) {
      // Continuation line — fill in school or degree
      if (!currentEdu.school && t.length < 100) {
        currentEdu.school = t;
      } else if (!currentEdu.degree && t.length < 100) {
        currentEdu.degree = t;
      }
    } else {
      // No degree keyword, no year — might be school name or program
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
