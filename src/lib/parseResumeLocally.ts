/**
 * parseResumeLocally.ts
 *
 * Regex + heuristic resume parser — no API calls.
 * Works on plain text extracted from PDF / Word / text files.
 * Produces the same ParsedResume shape consumed by the profile page.
 *
 * v5 — ground-truth tested against real DOCX (mammoth output):
 *   • Section regexes: "SUMMARY AND PROFILE", "CERTIFICATIONS & AWARDS",
 *     "EDUCATION AND OTHERS", "Highlighted Accomplishment" all recognised
 *   • Skills: line-by-line deduplication handles one-per-line AND
 *     comma-separated formats
 *   • Experience backward scan: blank lines skipped (not break); uses push
 *     order so priorLines[0] is always closest to date; blanksInScan flag
 *     determines title/company assignment order (DOCX vs compact PDF)
 *   • Experience bodyEnd: blank lines skipped so next job's header lines are
 *     properly excluded from current job's bullets
 *   • Education: school-first detection (SCHOOL_RE) handles
 *     "University of X → blank → Master of Science" format correctly
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
  achievements: string[];
}

// ── Patterns ──────────────────────────────────────────────────────────────────

const EMAIL_RE    = /[\w.+\-]+@[\w\-]+\.[\w.]+/;
const PHONE_RE    = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}/;
const LINKEDIN_RE = /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[\w\-%.]+\/?/i;
const YEAR_RE     = /\b(19|20)\d{2}\b/;
const URL_RE      = /https?:\/\//i;

// Extended date range — regex literal covering all common resume date formats.
// Start: 'Jan 2023' | 'January 2023' | 'Jan. 2023' | '01/2023' | '2023'
// End:   same + Present | Current | Now | Today (case-insensitive)
// Separator: hyphen, en-dash, em-dash with optional surrounding whitespace
const DATE_RANGE =
  /(?:(?:(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)[a-z]*\.?\s*)?(?:19|20)\d{2}|(?:0?[1-9]|1[0-2])\/(?:19|20)\d{2})\s*[-–—]\s*(?:(?:(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)[a-z]*\.?\s*)?(?:19|20)\d{2}|(?:0?[1-9]|1[0-2])\/(?:19|20)\d{2}|[Pp]resent|[Cc]urrent|[Nn]ow|[Tt]oday)/i;

// Section header regexes — each alternative anchored with ^ and \s*:?\s*$ so a
// keyword inside ordinary text never falsely switches the bucket.
const SECTION: Record<string, RegExp> = {
  summary:
    /^(summary(\s+and\s+profile)?|profile(\s+summary)?|objective|about\s+me|professional\s+(summary|profile)|career\s+(objective|profile|summary)|executive\s+summary|personal\s+statement|about)\s*:?\s*$/i,
  experience:
    /^(work\s+experience|experience|relevant\s+(work\s+)?experience|employment(\s+history)?|work\s+history|job\s+history|professional\s+(experience|background|history)|career(\s+(experience|history))?|positions?\s+held)\s*:?\s*$/i,
  education:
    /^(education(\s+and\s+(others|additional))?|educational\s+(background|history)|academic(\s+(background|history))?|qualifications?|schooling)\s*:?\s*$/i,
  skills:
    /^(technical\s+skills|skills(\s+summary)?|skill\s+set|core\s+competencies|key\s+(skills|competencies)|competencies|areas\s+of\s+expertise|technologies(\s+&\s+tools)?|tools(\s+&\s+technologies)?|technical\s+expertise|expertise|relevant\s+skills|languages\s+&\s+tools)\s*:?\s*$/i,
  certifications:
    /^(certifications?(\s+(&|and)\s+(licenses?|awards?))?|licen[cs]es?(\s+&\s+certifications?)?|credentials?|awards?(\s+&\s+certifications?)?|professional\s+(certifications?|development|credentials?)|training(\s+&\s+certifications?)?|accreditations?|continuing\s+education)\s*:?\s*$/i,
  // "achievements" catches accomplishment / achievement sections and maps to portfolio
  achievements:
    /^(highlighted\s+accomplishments?|key\s+accomplishments?|accomplishments?|key\s+achievements?|notable\s+achievements?|achievements?(\s+(&|and)\s+awards?)?|awards?(\s+(&|and)\s+achievements?)?|honours?\s+(&|and)\s+awards?|recognition|notable\s+contributions?|impact|results)\s*:?\s*$/i,
  // "other" catches remaining unrecognised section headers
  other:
    /^(additional\s+information|publications?|presentations?|volunteer(\s+experience)?|projects?|interests?|hobbies|references?|languages?)\s*:?\s*$/i,
};

const DEGREE_KEYWORDS = /\b(b\.?s\.?|b\.?a\.?|b\.?eng\.?|b\.?sc\.?|b\.?comm?\.?|m\.?s\.?|m\.?a\.?|m\.?b\.?a\.?|m\.?eng\.?|m\.?sc\.?|ph\.?d\.?|d\.?ba\.?|j\.?d\.?|l\.?l\.?[bm]\.?|bachelor|master(?:s)?|doctor(?:ate)?|associate|diploma|certificate|a\.?s\.?|a\.?a\.?)\b/i;

// School-name indicators (for education section)
const SCHOOL_RE = /\b(university|college|institute|school|academy|polytechnic|seminary|conservatory|lyceum)\b/i;
// "City, STATE" pattern (e.g. "Detroit, MI")
const CITY_STATE_RE = /,\s*[A-Z]{2}\s*$/;

// Words/patterns that indicate a line is NOT a person's name
const NOT_NAME_RE = /\d{4}|@|gpa\s*:|grade\s*:|score\s*:|portfolio|github\.com|twitter\.com/i;


// ── Skill harvesting ──────────────────────────────────────────────────────────
// Resumes often don't have a dedicated Skills section, but mention skills
// inside experience bullets ("Built X with React and Node.js"). This list
// is matched case-insensitively as whole-word against the entire resume so
// we still pull skills from those resumes.
//
// Curated list — focused on common tech, tools, methodologies, and certs.
// Multi-word entries use a hyphen-joined slug so the regex can match the
// space-separated form too (handled in matchSkillKeyword).
const SKILL_KEYWORDS: string[] = [
  // Languages
  "JavaScript", "TypeScript", "Python", "Java", "Kotlin", "Swift", "Go", "Golang",
  "Rust", "C", "C++", "C#", "Ruby", "PHP", "Perl", "Scala", "Elixir", "Clojure",
  "Haskell", "Erlang", "Dart", "R", "MATLAB", "Lua", "Bash", "Shell", "PowerShell",
  "Objective-C", "F#", "Solidity",
  // Web frontend
  "React", "Next.js", "Vue", "Vue.js", "Nuxt", "Angular", "AngularJS", "Svelte",
  "SolidJS", "Ember", "Backbone", "jQuery", "Redux", "MobX", "Zustand",
  "TailwindCSS", "Tailwind", "Bootstrap", "Material UI", "Chakra UI", "shadcn/ui",
  "HTML", "HTML5", "CSS", "CSS3", "Sass", "SCSS", "Less", "styled-components",
  "WebGL", "Three.js", "D3.js", "Recharts",
  // Web backend
  "Node.js", "Node", "Express", "Fastify", "NestJS", "Hapi", "Koa",
  "Django", "Flask", "FastAPI", "Tornado", "Pyramid", "Starlette",
  "Rails", "Sinatra", "Laravel", "Symfony", "CakePHP",
  "Spring", "Spring Boot", "Quarkus", "Micronaut",
  "ASP.NET", ".NET", ".NET Core", "Entity Framework",
  "Phoenix", "Gin", "Echo", "Actix",
  // Mobile
  "React Native", "Flutter", "Ionic", "Xamarin", "SwiftUI", "Jetpack Compose",
  "iOS", "Android",
  // Data / ML
  "TensorFlow", "PyTorch", "Keras", "scikit-learn", "Pandas", "NumPy", "SciPy",
  "Hugging Face", "Transformers", "OpenAI", "Anthropic", "LangChain", "LlamaIndex",
  "Spark", "Hadoop", "Kafka", "Flink", "Airflow", "dbt", "Snowflake", "BigQuery",
  "Databricks", "Redshift", "Athena",
  // Databases
  "PostgreSQL", "Postgres", "MySQL", "MariaDB", "SQLite", "Oracle", "SQL Server",
  "MongoDB", "Redis", "Cassandra", "DynamoDB", "Elasticsearch", "OpenSearch",
  "ClickHouse", "InfluxDB", "Neo4j", "Firestore", "CockroachDB", "Supabase",
  "Firebase", "Prisma", "TypeORM", "Sequelize", "Drizzle",
  // Cloud
  "AWS", "Amazon Web Services", "EC2", "S3", "Lambda", "RDS", "DynamoDB",
  "CloudFront", "Route53", "IAM", "VPC", "ECS", "EKS", "Fargate", "SQS", "SNS",
  "GCP", "Google Cloud", "Azure", "Heroku", "Vercel", "Netlify", "Cloudflare",
  "Cloudflare Workers", "DigitalOcean", "Linode",
  // Containers / DevOps
  "Docker", "Kubernetes", "K8s", "Helm", "Terraform", "Pulumi", "Ansible",
  "Chef", "Puppet", "Jenkins", "GitHub Actions", "GitLab CI", "CircleCI",
  "TravisCI", "ArgoCD", "Flux", "Istio", "Linkerd",
  "Prometheus", "Grafana", "Datadog", "New Relic", "Sentry", "Splunk",
  "ELK", "Logstash", "Kibana", "Fluentd", "OpenTelemetry",
  // Version control / collaboration
  "Git", "GitHub", "GitLab", "Bitbucket", "SVN", "Mercurial",
  // APIs / protocols
  "REST", "REST API", "GraphQL", "gRPC", "WebSockets", "SOAP", "OAuth",
  "OAuth2", "OpenID", "OpenID Connect", "JWT", "SAML", "OIDC",
  // Methodologies / process
  "Agile", "Scrum", "Kanban", "Waterfall", "TDD", "BDD", "DDD", "CI/CD",
  "DevOps", "MLOps", "GitOps", "SRE", "OKRs",
  // Project management & business
  "Jira", "Confluence", "Asana", "Trello", "Notion", "Linear", "Monday",
  "Salesforce", "HubSpot", "Marketo", "Tableau", "Power BI", "Looker", "Mode",
  "Excel", "Microsoft Excel", "Microsoft Office", "Google Sheets", "Google Docs",
  "PowerPoint", "Word",
  // Design tools
  "Figma", "Sketch", "Adobe XD", "Photoshop", "Illustrator", "InDesign",
  "Premiere", "After Effects", "Canva",
  // Testing
  "Jest", "Vitest", "Mocha", "Chai", "Cypress", "Playwright", "Selenium",
  "Puppeteer", "JUnit", "TestNG", "PyTest", "RSpec", "Cucumber",
  // Security
  "OWASP", "Penetration Testing", "Pentest", "SOC 2", "GDPR", "HIPAA", "PCI",
  "ISO 27001", "Vulnerability Assessment", "Threat Modeling", "SIEM",
  // PM / leadership soft-skills (only the unambiguous ones)
  "Stakeholder Management", "Cross-functional Leadership", "Mentoring",
  "Code Review", "Technical Writing", "Public Speaking",
];

// Build a single regex that matches any keyword case-insensitively as a whole token.
// Multi-word keywords (e.g. "Spring Boot") become \s+ so any whitespace works.
// Each keyword is escaped via escapeRegex() to keep regex meta-chars (+ . * ? ( ) [ ] etc.) literal.
function escapeRegex(s: string): string {
  // Char-by-char to avoid any regex-literal quoting confusion in this source file.
  const META = new Set(["\\", "^", "$", ".", "|", "?", "*", "+", "(", ")", "[", "]", "{", "}", "/"]);
  let out = "";
  for (const ch of s) out += META.has(ch) ? "\\" + ch : ch;
  return out;
}

const SKILL_KEYWORD_RE = new RegExp(
  "\\b(?:" +
  SKILL_KEYWORDS.map(k => escapeRegex(k).replace(/ /g, "\\s+")).join("|") +
  ")\\b",
  "gi"
);

/**
 * Find all SKILL_KEYWORDS that appear anywhere in the given text. Returned in
 * canonical capitalization (matching SKILL_KEYWORDS spelling), de-duplicated.
 */
function harvestSkillsFromText(text: string): string[] {
  const found = new Set<string>();
  if (!text) return [];
  // Build a case-folded lookup so we can normalize matches back to canonical case.
  const canonicalByLower = new Map<string, string>();
  for (const k of SKILL_KEYWORDS) canonicalByLower.set(k.toLowerCase(), k);
  for (const m of text.matchAll(SKILL_KEYWORD_RE)) {
    const matched = m[0].replace(/\s+/g, " ").toLowerCase();
    const canonical = canonicalByLower.get(matched);
    if (canonical) found.add(canonical);
    else found.add(m[0]); // fallback — shouldn't happen if regex came from list
  }
  return Array.from(found);
}

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
  if (!/[A-Za-z]{2}/.test(s)) return false;
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
  // ── 0. Pre-process: normalize common DOCX artifacts ─────────────────────
  // mammoth outputs table cells tab-separated — treat tabs like pipe separators
  const normalized = rawText
    .replace(/\t+/g, " | ")
    .replace(/[ \t]{3,}/g, "  ")
    .replace(/\r\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    // Split words fused without whitespace in DOCX (e.g. "yahoo.comLinkedIn:" → "yahoo.com LinkedIn:")
    .replace(/(\.([a-z]{2,6}))([A-Z][a-z])/g, "$1 $3");

  const lines = normalized.split(/\n/).map(l => l.trimEnd());

  // ── 1. Contact (scan header — first ~35 lines) ────────────────────────────
  let name = "", email = "", phone = "", location = "", linkedin = "";

  for (let i = 0; i < Math.min(35, lines.length); i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (detectSection(line)) break;

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

    if (!name) {
      const segments = (line.includes("|") || line.includes("•"))
        ? line.split(/\s*[|•]\s*/).map(s => s.trim()).filter(Boolean)
        : [line];
      for (const seg of segments) {
        if (looksLikeName(seg) && seg.trim().split(/\s+/).length >= 2) {
          name = seg;
          break;
        }
      }
      if (!name && looksLikeName(line)) {
        name = line;
      }
    }

    if (name && email && phone && linkedin) break;
  }

  // ── 2. Bucket lines into sections ─────────────────────────────────────────
  type SectionKey = "header" | "summary" | "experience" | "education" | "skills" | "certifications" | "achievements" | "other";
  const buckets: Record<SectionKey, string[]> = {
    header: [], summary: [], experience: [], education: [], skills: [], certifications: [], achievements: [], other: [],
  };
  let current: SectionKey = "header";

  for (const line of lines) {
    const sec = detectSection(line);
    if (sec && sec in buckets) { current = sec as SectionKey; continue; }
    buckets[current].push(line);
  }

  // ── 3. Summary ────────────────────────────────────────────────────────────
  let summary = buckets.summary.map(l => l.trim()).filter(Boolean).join(" ").slice(0, 800);

  if (!summary) {
    let pastContact = false;
    const implicitLines: string[] = [];

    for (const rawLine of buckets.header) {
      const t = rawLine.trim();
      if (!t) {
        if (implicitLines.length > 0) break;
        continue;
      }
      if (detectSection(t)) break;
      if (looksLikeContactLine(t)) { pastContact = true; continue; }
      if (!pastContact && looksLikeName(t) && t.split(/\s+/).length <= 5) continue;
      if (/^[A-Z][a-zA-Z\s]+,\s*[A-Z]{2,}/.test(t) && t.length < 60) { pastContact = true; continue; }
      if (!pastContact && t.includes("|") && t.length < 80) { pastContact = true; continue; }
      if (t.length > 25) {
        pastContact = true;
        implicitLines.push(t);
      }
    }
    summary = implicitLines.join(" ").slice(0, 800);
  }

  // ── 4. Skills ─────────────────────────────────────────────────────────────
  // Process line-by-line to handle both one-per-line AND comma/pipe-separated
  // formats. Dedup case-insensitively.
  const skillSet = new Set<string>();
  const skills: string[] = [];
  for (const rawLine of buckets.skills) {
    const t = rawLine.trim();
    if (!t) continue;
    // Split on comma, pipe, or bullet chars; each segment may be one skill
    const items = t.split(/[,|•●◦▪]+/).map(s => s.trim()).filter(Boolean);
    for (const item of items) {
      if (
        item.length > 1 &&
        item.length < 60 &&
        !DEGREE_KEYWORDS.test(item) &&
        !skillSet.has(item.toLowerCase())
      ) {
        skillSet.add(item.toLowerCase());
        skills.push(item);
      }
    }
  }

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

  // ── 6. Achievements / Accomplishments → portfolio items ─────────────────────
  const achieveSet = new Set<string>();
  const achievements: string[] = [];
  for (const rawLine of buckets.achievements) {
    const line = isBullet(rawLine) ? stripBullet(rawLine) : rawLine.trim();
    if (!line || line.length < 5) continue;
    const key = line.toLowerCase();
    if (!achieveSet.has(key)) {
      achieveSet.add(key);
      achievements.push(line);
    }
  }

  // ── 7. Experience ─────────────────────────────────────────────────────────
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
    // Key insight for DOCX (mammoth output): every paragraph is separated by a
    // blank line, so the layout is:
    //   Company
    //   [blank]
    //   Title
    //   [blank]
    //   Date  ← di0
    //
    // We push lines in "closest-to-date-first" order, then use blanksInScan to
    // decide assignment:
    //   blanksInScan=true  → DOCX: priorLines[0]=Title, priorLines[1]=Company
    //   blanksInScan=false → compact PDF: priorLines[0]=Company, priorLines[1]=Title

    let title = "", company = "";
    const priorLines: string[] = [];
    let blanksInScan = false;
    let nonBlankCount = 0;

    for (let k = di0 - 1; k >= 0 && nonBlankCount < 2; k--) {
      const l = expLines[k];
      if (l === undefined || l === null) break;
      if (!l) {
        // Blank line — skip but note it (DOCX artifact)
        blanksInScan = true;
        continue;
      }
      if (isBullet(l) || l.match(DATE_RANGE)) break;
      if (l.length < 120) {
        priorLines.push(l);   // push = closest-to-date first
        nonBlankCount++;
      } else {
        break; // description paragraph — stop here
      }
    }

    if (inlineText && priorLines.length > 0) {
      // Something on the date line AND prior lines — use blanksInScan for order
      if (blanksInScan) {
        title   = priorLines[0];
        company = priorLines[1] ?? inlineText;
      } else {
        title   = priorLines[1] ?? priorLines[0] ?? "";
        company = priorLines.length >= 2 ? priorLines[0] : inlineText;
      }
    } else if (inlineText) {
      [title, company] = splitTitleCompany(inlineText);
    } else if (priorLines.length >= 2) {
      if (blanksInScan) {
        // DOCX: closest-to-date = title (e.g. "VP, T&I"), next = company
        title   = priorLines[0];
        company = priorLines[1];
      } else {
        // Compact PDF: closest-to-date = company, next = title
        title   = priorLines[1];
        company = priorLines[0];
      }
    } else if (priorLines.length === 1) {
      [title, company] = splitTitleCompany(priorLines[0]);
      if (!company) title = priorLines[0];
    }

    // ── Body end: scan backward from next date anchor ─────────────────────
    const nextDi = di < dateIndices.length - 1 ? dateIndices[di + 1] : expLines.length;
    let bodyEnd = nextDi;

    if (di < dateIndices.length - 1) {
      let k = nextDi - 1;
      while (k > di0) {
        const l = expLines[k];
        if (l === undefined) break;
        if (!l) { k--; continue; }          // blank — skip, don't break
        if (isBullet(l)) break;
        if (l.match(DATE_RANGE)) break;
        if (l.length < 100) { bodyEnd = k; k--; }
        else break;
      }
    }

    // ── Description / bullets: forward scan ──────────────────────────────
    const bullets: string[] = [];
    const descriptionLines: string[] = [];
    for (let j = di0 + 1; j < bodyEnd; j++) {
      const l = expLines[j];
      if (!l) continue;
      if (isBullet(l)) {
        bullets.push(stripBullet(l));
      } else {
        descriptionLines.push(l);
        bullets.push(l);
      }
    }

    const description = descriptionLines.join(" ").trim();
    experience.push({ title, company, period, bullets, description: description || undefined });
  }

  // ── 7. Education ──────────────────────────────────────────────────────────
  // Handles two layouts:
  //   Compact:  "Master of Science in X, University of Y, 2006"  (degree first)
  //   DOCX:     "University of Detroit Mercy, Detroit, MI"        (school first)
  //             [blank]
  //             "Master of Science in Information Assurance"      (degree)
  //             [blank]
  //             "2006"
  //
  // SCHOOL_RE detects school lines so we don't misclassify them as degrees.
  const education: ParsedEducation[] = [];
  let currentEdu: ParsedEducation | null = null;

  for (const rawLine of buckets.education) {
    const t = rawLine.trim();
    if (!t) continue;
    if (/^gpa\s*:/i.test(t) || /^grade\s*:/i.test(t)) continue;

    const yearMatch = t.match(YEAR_RE);
    const hasDegree = DEGREE_KEYWORDS.test(t);
    const hasSchool = SCHOOL_RE.test(t) || (!hasDegree && CITY_STATE_RE.test(t));

    if (hasSchool && !hasDegree) {
      // Pure school line (e.g. "University of Detroit Mercy, Detroit, MI")
      if (!currentEdu) {
        currentEdu = { degree: "", school: t, year: yearMatch ? yearMatch[0] : "" };
      } else if (!currentEdu.school) {
        currentEdu.school = t;
        if (yearMatch && !currentEdu.year) currentEdu.year = yearMatch[0];
      } else {
        // Starting a new institution — commit current
        if (currentEdu.degree || currentEdu.school) education.push(currentEdu);
        currentEdu = { degree: "", school: t, year: yearMatch ? yearMatch[0] : "" };
      }
    } else if (hasDegree) {
      const year = yearMatch ? yearMatch[0] : "";
      if (!currentEdu) {
        // No prior school line — start fresh
        const parts = t.split(/\s*[\|,]\s*/).map(p => p.trim()).filter(Boolean);
        currentEdu = hasSchool
          ? { degree: parts[0] ?? t, school: parts[1] ?? "", year }
          : { degree: t, school: "", year };
      } else if (!currentEdu.degree) {
        // Fill in degree for existing school entry
        currentEdu.degree = t;
        if (year && !currentEdu.year) currentEdu.year = year;
      } else {
        // Already have a degree — push and start new
        if (currentEdu.degree || currentEdu.school) education.push(currentEdu);
        const parts = t.split(/\s*[\|,]\s*/).map(p => p.trim()).filter(Boolean);
        currentEdu = {
          degree: parts[0] ?? t,
          school: hasSchool ? (parts[1] ?? "") : "",
          year,
        };
      }
    } else if (yearMatch) {
      // Year-only or year+school line
      if (currentEdu) {
        if (!currentEdu.year) currentEdu.year = yearMatch[0];
        const rest = t.replace(yearMatch[0], "").replace(/[|\-–—,]+/g, " ").trim();
        if (rest && !currentEdu.school && rest.length < 100) currentEdu.school = rest;
      } else {
        currentEdu = { degree: "", school: "", year: yearMatch[0] };
      }
    } else if (currentEdu) {
      // Misc line — fill in gaps
      if (!currentEdu.school && t.length < 100) currentEdu.school = t;
      else if (!currentEdu.degree && t.length < 100) currentEdu.degree = t;
    } else {
      // Unclassified line at start
      currentEdu = { degree: t, school: "", year: "" };
    }
  }
  if (currentEdu && (currentEdu.degree || currentEdu.school)) education.push(currentEdu);

  // ── Skill harvesting fallback ───────────────────────────────────────────────
  // Many resumes don't have a dedicated Skills section. Scan the entire
  // resume text for known technologies / tools / methodologies and merge
  // them into skills[]. This is the single biggest reliability win — it
  // catches skills mentioned inside bullets like "Built X with React".
  const harvested = harvestSkillsFromText(rawText);
  if (harvested.length > 0) {
    const seen = new Set(skills.map(s => s.toLowerCase()));
    for (const k of harvested) {
      if (!seen.has(k.toLowerCase())) {
        skills.push(k);
        seen.add(k.toLowerCase());
      }
    }
  }

  return {
    contact: { name, email, phone, location, linkedin },
    summary,
    experience,
    education,
    skills,
    certifications,
    achievements,
  };
}
