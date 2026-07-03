/**
 * feat/jobs-for-you-curator Task 2 — Skills fingerprint extraction.
 *
 * Extracts a signature of what the user actually did (from experience bullets
 * and summary), not just what they typed in the Skills box. Zero LLM calls.
 */

import type { UserProfile } from "@/services/scoring/profileScorer";

export interface WorkEntry {
  title?:     string;
  company?:   string;
  startDate?: string;
  endDate?:   string;
  description?: string;
  bullets?:   string[];
}

export interface SkillsFingerprint {
  coreSkills:       string[]; // exact skills from user_profiles.skills
  inferredSkills:   string[]; // regex-matched from bullets + description
  industryKeywords: string[]; // regex-matched from summary + headline
  recentTechStack:  string[]; // inferred from last-5-year experience
  allKeywords:      string[]; // union of above, lowercased
}

// ── Skill inference patterns ────────────────────────────────────────────
const SKILL_PATTERNS: Array<{ pattern: RegExp; skill: string }> = [
  // Cloud
  { pattern: /\bAWS\b|Amazon Web Services/i, skill: "AWS" },
  { pattern: /\bAzure\b/i,                    skill: "Azure" },
  { pattern: /\bGCP\b|Google Cloud/i,         skill: "GCP" },
  { pattern: /\bkubernetes\b|\bk8s\b/i,       skill: "Kubernetes" },
  { pattern: /\bdocker\b/i,                   skill: "Docker" },
  { pattern: /\bterraform\b/i,                skill: "Terraform" },
  { pattern: /\bansible\b/i,                  skill: "Ansible" },
  { pattern: /\bhelm\b/i,                     skill: "Helm" },
  // Infra / DevOps
  { pattern: /\bCI\/CD\b|jenkins|circleci|github actions/i, skill: "CI/CD" },
  { pattern: /\bprometheus\b/i,               skill: "Prometheus" },
  { pattern: /\bgrafana\b/i,                  skill: "Grafana" },
  { pattern: /\bdatadog\b/i,                  skill: "Datadog" },
  { pattern: /\bsplunk\b/i,                   skill: "Splunk" },
  { pattern: /\belasticsearch\b|\belk\b/i,    skill: "Elasticsearch" },
  // Security
  { pattern: /\bSOC\b|security operations center/i, skill: "SOC operations" },
  { pattern: /\bGRC\b|governance.*risk.*compliance/i, skill: "GRC" },
  { pattern: /\bSIEM\b/i,                     skill: "SIEM" },
  { pattern: /\bzero trust\b/i,               skill: "Zero Trust" },
  { pattern: /\bpenetration test|pentesting|red team/i, skill: "Penetration Testing" },
  { pattern: /\bincident response\b/i,        skill: "Incident Response" },
  { pattern: /\bthreat modeling\b/i,          skill: "Threat Modeling" },
  { pattern: /\bthreat intelligence\b/i,      skill: "Threat Intelligence" },
  { pattern: /\bSOC 2\b|SOX|ISO 27001|NIST|HIPAA|PCI[-\s]?DSS|GDPR|CCPA/i, skill: "Compliance Frameworks" },
  { pattern: /\bidentity.*access management|\bIAM\b/i, skill: "IAM" },
  { pattern: /\bDLP\b|data loss prevention/i, skill: "DLP" },
  { pattern: /\bEDR\b|endpoint detection/i,   skill: "EDR" },
  { pattern: /\bCASB\b/i,                     skill: "CASB" },
  { pattern: /\bsecrets? management\b|hashicorp vault|cyberark/i, skill: "Secrets Management" },
  // Languages / frameworks
  { pattern: /\bpython\b/i,                   skill: "Python" },
  { pattern: /\btypescript\b/i,               skill: "TypeScript" },
  { pattern: /\bjavascript\b/i,               skill: "JavaScript" },
  { pattern: /\bgo\b(?!\s*(?:home|to|forward))/i, skill: "Go" },
  { pattern: /\brust\b/i,                     skill: "Rust" },
  { pattern: /\bjava\b(?!script)/i,           skill: "Java" },
  { pattern: /\breact\b/i,                    skill: "React" },
  { pattern: /\bnode\.?js\b/i,                skill: "Node.js" },
  // Data
  { pattern: /\bsql\b/i,                      skill: "SQL" },
  { pattern: /\bpostgres|postgresql\b/i,      skill: "PostgreSQL" },
  { pattern: /\bmongodb\b/i,                  skill: "MongoDB" },
  { pattern: /\bredis\b/i,                    skill: "Redis" },
  { pattern: /\bkafka\b/i,                    skill: "Kafka" },
  { pattern: /\bsnowflake\b/i,                skill: "Snowflake" },
  { pattern: /\bdatabricks\b/i,               skill: "Databricks" },
  // Methodologies
  { pattern: /\bagile\b|\bscrum\b/i,          skill: "Agile / Scrum" },
  { pattern: /\bOKRs?\b/i,                    skill: "OKRs" },
  { pattern: /\bkanban\b/i,                   skill: "Kanban" },
];

const INDUSTRY_KEYWORDS: Array<{ pattern: RegExp; keyword: string }> = [
  { pattern: /\bfintech\b|financial services|banking|payments/i, keyword: "financial services" },
  { pattern: /\bhealthcare\b|med-?tech|health.tech|hospital/i,   keyword: "healthcare" },
  { pattern: /\be-?commerce\b|retail/i,                          keyword: "e-commerce" },
  { pattern: /\bSaaS\b|software as a service/i,                  keyword: "SaaS" },
  { pattern: /\benterprise\b/i,                                  keyword: "enterprise" },
  { pattern: /\bstartup\b|early.stage|seed|series [ab]\b/i,      keyword: "startup" },
  { pattern: /\bpublic sector\b|government|gov-?tech/i,          keyword: "government" },
  { pattern: /\bcasino\b|gaming|igaming/i,                       keyword: "gaming" },
  { pattern: /\bautomotive\b/i,                                  keyword: "automotive" },
  { pattern: /\bmedia\b|entertainment/i,                         keyword: "media" },
  { pattern: /\btelecom\b|telecommunications/i,                  keyword: "telecom" },
  { pattern: /\bmanufactur/i,                                    keyword: "manufacturing" },
  { pattern: /\bnon.?profit\b|NGO/i,                             keyword: "non-profit" },
];

// ── Public API ──────────────────────────────────────────────────────────

export function extractSkillsFingerprint(
  profile: UserProfile,
  workExperience: WorkEntry[] = [],
): SkillsFingerprint {
  const coreSkills = profile.skills ?? [];

  const allBullets = workExperience.flatMap(e =>
    ([...(e.bullets ?? []), e.description ?? ""] as string[]).filter(Boolean)
  );
  const bulletText = allBullets.join(" ");
  const inferredSkills = extractSkillsFromText(bulletText);

  const industrySource = [profile.summary ?? "", profile.currentTitle ?? "", bulletText].join(" ");
  const industryKeywords = extractIndustryKeywords(industrySource);

  const recentEntries = workExperience.filter(e => isWithinLastYears(e.endDate, 5));
  const recentText = recentEntries.flatMap(e => ([...(e.bullets ?? []), e.description ?? ""])).join(" ");
  const recentTechStack = extractSkillsFromText(recentText);

  const allKeywords = Array.from(new Set([
    ...coreSkills.map(s => s.toLowerCase()),
    ...inferredSkills.map(s => s.toLowerCase()),
    ...industryKeywords.map(s => s.toLowerCase()),
    ...recentTechStack.map(s => s.toLowerCase()),
    ...(profile.keywords ?? []).map(s => s.toLowerCase()),
  ]));

  return { coreSkills, inferredSkills, industryKeywords, recentTechStack, allKeywords };
}

export function extractSkillsFromText(text: string): string[] {
  const found = new Set<string>();
  for (const { pattern, skill } of SKILL_PATTERNS) {
    if (pattern.test(text)) found.add(skill);
  }
  return Array.from(found);
}

export function extractIndustryKeywords(text: string): string[] {
  const found = new Set<string>();
  for (const { pattern, keyword } of INDUSTRY_KEYWORDS) {
    if (pattern.test(text)) found.add(keyword);
  }
  return Array.from(found);
}

function isWithinLastYears(endDate: string | null | undefined, years: number): boolean {
  if (!endDate) return true;                     // ongoing
  if (/present|current/i.test(endDate)) return true;
  const m = endDate.match(/(\d{4})/);
  if (!m) return true;                            // undated — assume recent
  const cutoff = new Date().getFullYear() - years;
  return parseInt(m[1], 10) >= cutoff;
}
