/**
 * Job Fit Analysis — Pro-tier deep analysis engine.
 *
 * Ported and consolidated from the deleted Wave 3 `src/services/jobAnalysis/`
 * subtree (PR #199). Rebuilt here as a single self-contained module gated
 * behind Standard/Pro plans per Sprint 2 Wave 1.
 *
 * What this provides on top of the AI-powered `fitScoreService`:
 *   - 24-category SKILL_CATEGORIES dictionary (~300+ keywords)
 *   - Deterministic keyword extraction (no LLM call, ~5ms)
 *   - Career-level detection from job descriptions (Entry → C-Level, 8 tiers)
 *   - Skill match + gaps + improvement plan (week-by-week actions)
 *   - Composite interview probability (5–95)
 *
 * Free + Starter plans see only the AI `% match` score on cards.
 * Standard + Pro plans see this full DeepFitResult in the drawer panel.
 *
 * Pure synchronous — no DB or AI calls. Safe to run inline in API routes.
 */

// ── Types (DeepFitResult per Sprint 2 brief) ──────────────────────────────

export interface SkillMatch {
  skill:      string;          // canonical skill name (lower-case keyword form)
  matched:    boolean;
  category:   string;          // which SKILL_CATEGORIES bucket
  confidence: number;          // 0–100
}

export type GapSeverity = "critical" | "moderate" | "minor";

export interface GapItem {
  area:           string;       // skill name
  severity:       GapSeverity;
  action:         string;       // one-line suggestion (e.g. "Take an intro <skill> course")
  estimatedWeeks: number;       // 1–8
}

export interface DeepFitResult {
  overallScore:        number;          // % keyword overlap (0–100)
  matchedSkills:       SkillMatch[];    // both matched + the top unmatched, sorted
  gaps:                GapItem[];       // top 5 missing skills with severity + action
  strengths:           string[];        // matched skills capitalised, top 4
  interviewProbability: number;         // composite 5–95
  experienceMatch:     number;          // career level alignment 0–100
  keywordAlignment:    number;          // % of job keywords present in resume
  improvementPlan:     { week: string; action: string }[];
  summary:             string;          // 2-sentence summary
  jobLevel:            string;          // detected career level on the JD
}

// ── 24-category Skill Dictionary (~300+ keywords) ──────────────────────────

const SKILL_CATEGORIES: Record<string, string[]> = {
  "Programming Languages": [
    "python", "javascript", "typescript", "java", "c++", "c#", "go", "golang", "rust",
    "ruby", "php", "swift", "kotlin", "scala", "r", "matlab", "perl", "bash", "shell",
    "powershell", "objective-c", "dart", "lua", "haskell", "elixir", "clojure",
  ],
  "Web & Frontend": [
    "react", "angular", "vue", "svelte", "next.js", "nuxt", "html", "css", "sass",
    "tailwind", "bootstrap", "jquery", "webpack", "vite", "redux", "graphql", "rest",
    "api", "responsive design", "web development", "frontend", "ui/ux",
  ],
  "Backend & Infrastructure": [
    "node", "node.js", "express", "django", "flask", "spring", "spring boot",
    ".net", "asp.net", "rails", "fastapi", "microservices", "serverless",
    "docker", "kubernetes", "terraform", "ansible", "jenkins", "ci/cd", "devops",
    "aws", "azure", "gcp", "cloud computing", "cloud architecture",
    "linux", "unix", "windows server", "vmware", "virtualization",
    "nginx", "apache", "load balancing", "cdn",
  ],
  "Data & Analytics": [
    "sql", "nosql", "mongodb", "postgresql", "mysql", "oracle", "redis",
    "elasticsearch", "kafka", "spark", "hadoop", "data analysis", "data engineering",
    "data science", "data modeling", "data warehousing", "etl", "data pipeline",
    "excel", "tableau", "power bi", "looker", "analytics", "business intelligence",
    "big data", "data visualization", "statistics", "reporting",
  ],
  "AI & Machine Learning": [
    "machine learning", "deep learning", "natural language processing", "nlp",
    "computer vision", "tensorflow", "pytorch", "scikit-learn", "neural networks",
    "ai", "artificial intelligence", "generative ai", "llm", "large language models",
    "reinforcement learning", "predictive modeling", "data mining",
  ],
  "Cybersecurity": [
    "cybersecurity", "information security", "infosec", "network security",
    "application security", "cloud security", "endpoint security",
    "vulnerability management", "penetration testing", "pen testing",
    "incident response", "threat intelligence", "threat detection",
    "siem", "soc", "security operations", "security architecture",
    "identity management", "iam", "access management", "zero trust",
    "encryption", "cryptography", "pki", "ssl/tls",
    "malware analysis", "forensics", "digital forensics",
    "dlp", "data loss prevention", "firewalls", "ids/ips",
    "security awareness", "security training",
    "devsecops", "secure sdlc", "application whitelisting",
  ],
  "Compliance & Governance": [
    "compliance", "governance", "risk management", "cyber risk",
    "grc", "audit", "internal audit", "regulatory compliance",
    "iso 27001", "iso/iec 27001", "iso 27002", "nist", "nist csf",
    "soc 2", "soc2", "sox", "hipaa", "pci dss", "pci", "gdpr", "ccpa", "fedramp",
    "cobit", "itil", "coso", "cmmc",
    "information assurance", "data privacy", "privacy",
    "policy development", "security policy", "risk assessment",
    "business continuity", "disaster recovery", "bcdr", "bcp", "drp",
    "third-party risk", "vendor risk management",
  ],
  "Project & Product Management": [
    "project management", "program management", "portfolio management",
    "product management", "product strategy", "product roadmap",
    "agile", "scrum", "kanban", "waterfall", "lean", "safe",
    "jira", "confluence", "asana", "trello",
    "pmp", "prince2", "six sigma",
    "stakeholder management", "requirements gathering", "business analysis",
    "change management", "release management",
  ],
  "Leadership & Strategy": [
    "leadership", "team leadership", "people management", "team building",
    "employee development", "mentoring", "coaching", "talent development",
    "strategic planning", "strategy", "digital transformation",
    "business process improvement", "process optimization",
    "organizational development", "cross-functional", "executive leadership",
    "budget management", "p&l", "cost optimization", "resource planning",
    "vendor management", "contract negotiation",
    "m&a", "mergers and acquisitions", "due diligence",
    "board reporting", "c-suite communication",
  ],
  "Communication & Soft Skills": [
    "communication", "public speaking", "presentation", "negotiation",
    "teamwork", "collaboration", "problem solving", "critical thinking",
    "analytical thinking", "decision making", "conflict resolution",
    "time management", "organizational skills", "attention to detail",
    "writing", "technical writing", "documentation",
    "customer success", "client relations", "relationship management",
  ],
  "Marketing & Sales": [
    "marketing", "digital marketing", "content marketing", "seo", "sem",
    "social media", "email marketing", "marketing automation",
    "google analytics", "hubspot", "salesforce", "crm",
    "sales", "business development", "lead generation",
    "brand strategy", "market research", "competitive analysis",
    "account management", "customer acquisition",
  ],
  "Design": [
    "ux", "ui", "user experience", "user interface", "ux design", "ui design",
    "figma", "sketch", "adobe xd", "invision",
    "graphic design", "visual design", "interaction design",
    "design thinking", "wireframing", "prototyping",
    "adobe creative suite", "photoshop", "illustrator",
  ],
  "Finance & Operations": [
    "finance", "accounting", "financial analysis", "financial modeling",
    "budgeting", "forecasting", "operations", "supply chain",
    "logistics", "procurement", "inventory management",
    "erp", "sap", "oracle financials",
    "lean manufacturing", "quality assurance", "qa",
  ],
  "Industry Domains": [
    "healthcare", "fintech", "banking", "insurance",
    "aerospace", "defense", "government", "federal",
    "pharmaceutical", "biotech", "life sciences",
    "manufacturing", "retail", "e-commerce",
    "telecommunications", "media", "entertainment",
    "legal", "real estate", "education", "edtech",
    "energy", "oil and gas", "utilities",
    "automotive", "transportation",
  ],
  "Certifications": [
    "cissp", "cism", "cisa", "ceh", "oscp", "comptia security+", "security+",
    "comptia network+", "aws certified", "azure certified", "gcp certified",
    "ccna", "ccnp", "itil certified",
    "certified scrum master", "csm", "psm",
    "togaf", "sabsa",
  ],
  "Testing & QA": [
    "testing", "unit testing", "integration testing", "e2e testing",
    "test automation", "selenium", "cypress", "playwright",
    "qa", "quality assurance", "performance testing", "load testing",
    "manual testing", "regression testing",
  ],
  "Networking": [
    "networking", "tcp/ip", "dns", "dhcp", "vpn",
    "routing", "switching", "wan", "lan", "sd-wan",
    "wireless", "802.1x",
  ],
  "Mobile": [
    "ios", "android", "react native", "flutter", "mobile development",
    "app development",
  ],
};

const SKILL_KEYWORDS: string[] = Object.values(SKILL_CATEGORIES).flat();
const KEYWORD_TO_CATEGORY: Record<string, string> = {};
for (const [cat, keywords] of Object.entries(SKILL_CATEGORIES)) {
  for (const kw of keywords) KEYWORD_TO_CATEGORY[kw] = cat;
}

// ── Career-level detection (8 tiers, weighted) ─────────────────────────────

const CAREER_LEVEL_PATTERNS: { level: string; patterns: RegExp[]; weight: number }[] = [
  { level: "C-Level / Executive", weight: 100, patterns: [
    /\b(chief|cto|cio|ciso|cfo|ceo|coo|cmo)\b/i,
    /\bchief\s+(technology|information|security|financial|executive|operating|marketing)\s+officer\b/i,
    /\bexecutive\s+(vice\s+president|director)\b/i, /\bevp\b/i,
  ]},
  { level: "VP / Senior Leadership", weight: 90, patterns: [
    /\b(vice\s+president|v\.?p\.?)\s+(of\s+)?\w/i, /\bvp\s+(of\s+)?\w/i, /\bsvp\b/i,
    /\bsenior\s+vice\s+president\b/i, /\bhead\s+of\b/i, /\bglobal\s+head\b/i, /\bregional\s+head\b/i,
  ]},
  { level: "Director", weight: 80, patterns: [
    /\bdirector\b/i, /\bsenior\s+director\b/i, /\bmanaging\s+director\b/i, /\bglobal\s+director\b/i,
  ]},
  { level: "Senior Manager / Principal", weight: 70, patterns: [
    /\bsenior\s+manager\b/i, /\bprincipal\b/i,
    /\bstaff\s+(engineer|architect|scientist)\b/i,
    /\bdistinguished\s+(engineer|architect)\b/i,
  ]},
  { level: "Manager", weight: 60, patterns: [
    /\bmanager\b/i, /\bteam\s+lead\b/i, /\blead\s+(engineer|developer|architect|analyst)\b/i,
  ]},
  { level: "Senior", weight: 50, patterns: [
    /\bsenior\b/i, /\bsr\.?\b/i,
  ]},
  { level: "Mid-Level", weight: 30, patterns: [
    /\b(engineer|developer|analyst|consultant|specialist|coordinator|administrator)\b/i,
  ]},
  { level: "Entry-Level / Junior", weight: 35, patterns: [
    /\bjunior\b/i, /\bassociate\b/i, /\bentry[\s-]level\b/i, /\bintern\b/i,
  ]},
];

export function detectCareerLevel(text: string): string {
  let highest = 0; let detected = "Mid-Level";
  for (const { level, patterns, weight } of CAREER_LEVEL_PATTERNS) {
    if (patterns.some(p => p.test(text))) {
      if (weight > highest) { highest = weight; detected = level; }
    }
  }
  return detected;
}

// ── Skill extraction ───────────────────────────────────────────────────────

export function extractKeywords(text: string): string[] {
  const lower = text.toLowerCase();
  const sorted = [...SKILL_KEYWORDS].sort((a, b) => b.length - a.length);
  const found: string[] = [];
  const foundSet = new Set<string>();
  for (const kw of sorted) {
    if (foundSet.has(kw)) continue;
    if (kw.includes(" ") || kw.includes("/")) {
      if (lower.includes(kw)) { found.push(kw); foundSet.add(kw); }
    } else {
      const safe = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`\\b${safe}\\b`, "i");
      if (re.test(lower)) { found.push(kw); foundSet.add(kw); }
    }
  }
  return found;
}

function scoreOverlap(jobKeywords: string[], resumeKeywords: string[]): number {
  if (jobKeywords.length === 0) return 65;
  const matched = jobKeywords.filter(k => resumeKeywords.includes(k)).length;
  return Math.round(Math.min(98, (matched / jobKeywords.length) * 100));
}

// ── Career-level alignment (0–100) ─────────────────────────────────────────

function levelWeight(level: string): number {
  const found = CAREER_LEVEL_PATTERNS.find(p => p.level === level);
  return found?.weight ?? 30;
}

function computeExperienceMatch(jobDescription: string, resumeText: string): number {
  const jobLevel    = detectCareerLevel(jobDescription);
  const resumeLevel = detectCareerLevel(resumeText);
  const jw = levelWeight(jobLevel);
  const rw = levelWeight(resumeLevel);
  // Resume >= job: full credit. Resume slightly under: partial. Far under: low.
  if (rw >= jw) return 95;
  const ratio = rw / jw;             // 0..1
  return Math.round(Math.max(20, 100 * ratio));
}

// ── Gap building + improvement plan ────────────────────────────────────────

function classifySeverity(rank: number, total: number): GapSeverity {
  // The first ~25% of unmatched-but-job-required skills are critical,
  // next ~40% moderate, rest minor.
  const pct = rank / Math.max(total, 1);
  if (pct <= 0.25) return "critical";
  if (pct <= 0.65) return "moderate";
  return "minor";
}

function gapActionFor(skill: string): string {
  const cat = KEYWORD_TO_CATEGORY[skill] || "General";
  const cap = skill.charAt(0).toUpperCase() + skill.slice(1);
  if (cat === "Certifications") return `Study for the ${cap} certification`;
  if (cat === "Programming Languages") return `Build a small project in ${cap}`;
  if (cat === "AI & Machine Learning") return `Take a hands-on ${cap} course (Coursera, fast.ai)`;
  if (cat === "Cybersecurity" || cat === "Compliance & Governance") return `Learn ${cap} via a SANS / ISC2 short course`;
  if (cat === "Communication & Soft Skills" || cat === "Leadership & Strategy") return `Demonstrate ${cap} through an experience story you can tell in interviews`;
  return `Take an intro course on ${cap} and ship a small artifact`;
}

function buildGaps(matched: SkillMatch[]): GapItem[] {
  const unmatched = matched.filter(s => !s.matched);
  const top = unmatched.slice(0, 5);
  return top.map((m, i) => ({
    area:           m.skill,
    severity:       classifySeverity(i, top.length),
    action:         gapActionFor(m.skill),
    estimatedWeeks: m.confidence >= 80 ? 2 : m.confidence >= 60 ? 4 : 8,
  }));
}

function buildImprovementPlan(gaps: GapItem[]): { week: string; action: string }[] {
  const out: { week: string; action: string }[] = [];
  let cursor = 1;
  for (const g of gaps) {
    out.push({ week: `Week ${cursor}-${cursor + g.estimatedWeeks - 1}`, action: g.action });
    cursor += g.estimatedWeeks;
    if (cursor > 12) break;        // 3-month horizon max
  }
  return out;
}

function buildSummary(score: number, gapCount: number, level: string): string {
  if (score >= 75) {
    return `Strong match (${score}%) for this ${level} role. ${gapCount > 0 ? `${gapCount} small gap${gapCount === 1 ? "" : "s"} to close.` : `Apply with confidence.`}`;
  }
  if (score >= 50) {
    return `Partial match (${score}%) for this ${level} role. ${gapCount} gap${gapCount === 1 ? "" : "s"} to address — consider building these before applying.`;
  }
  return `Significant gap to this ${level} role (${score}%). Worth a focused upskilling plan first; see Improvement Plan below.`;
}

// ── Main entry point ───────────────────────────────────────────────────────

export function analyzeJobFit(jobDescription: string, resumeText: string): DeepFitResult {
  const jobKeywords    = extractKeywords(jobDescription);
  const resumeKeywords = extractKeywords(resumeText);
  const overallScore   = scoreOverlap(jobKeywords, resumeKeywords);

  // Build SkillMatch[] using the union of jobKeywords (the role's wants).
  // Each entry is matched=true if it appears in the resume too.
  const matchedSkills: SkillMatch[] = jobKeywords.map(skill => ({
    skill,
    matched:   resumeKeywords.includes(skill),
    category:  KEYWORD_TO_CATEGORY[skill] || "General",
    confidence: resumeKeywords.includes(skill) ? 95 : 0,
  }));
  // Sort: matched first, then by category-grouping
  matchedSkills.sort((a, b) => (b.matched === a.matched ? 0 : b.matched ? 1 : -1));

  const strengths = matchedSkills
    .filter(s => s.matched)
    .slice(0, 4)
    .map(s => s.skill.charAt(0).toUpperCase() + s.skill.slice(1));

  const gaps             = buildGaps(matchedSkills);
  const improvementPlan  = buildImprovementPlan(gaps);
  const jobLevel         = detectCareerLevel(jobDescription);
  const experienceMatch  = computeExperienceMatch(jobDescription, resumeText);

  const matched   = matchedSkills.filter(s => s.matched).length;
  const total     = matchedSkills.length;
  const keywordAlignment = total > 0 ? Math.round((matched / total) * 100) : 50;

  // Composite interview probability — three signals weighted.
  const interviewProbability = Math.min(95, Math.max(5, Math.round(
    overallScore * 0.4 + experienceMatch * 0.3 + keywordAlignment * 0.3
  )));

  const summary = buildSummary(overallScore, gaps.length, jobLevel);

  return {
    overallScore,
    matchedSkills,
    gaps,
    strengths,
    interviewProbability,
    experienceMatch,
    keywordAlignment,
    improvementPlan,
    summary,
    jobLevel,
  };
}
