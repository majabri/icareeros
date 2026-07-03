/**
 * feat/jobs-enrichment — canonical skill inference patterns shared between
 * the Next.js curator (skillsFingerprint.ts) and the enrich-jobs edge
 * function. Extracted so the pattern set stays in one place.
 */

export interface SkillPattern {
  pattern: RegExp;
  skill:   string;
}

export const SKILL_PATTERNS: SkillPattern[] = [
  { pattern: /\bAWS\b|Amazon Web Services/i, skill: "AWS" },
  { pattern: /\bAzure\b/i,                    skill: "Azure" },
  { pattern: /\bGCP\b|Google Cloud/i,         skill: "GCP" },
  { pattern: /\bkubernetes\b|\bk8s\b/i,       skill: "Kubernetes" },
  { pattern: /\bdocker\b/i,                   skill: "Docker" },
  { pattern: /\bterraform\b/i,                skill: "Terraform" },
  { pattern: /\bansible\b/i,                  skill: "Ansible" },
  { pattern: /\bhelm\b/i,                     skill: "Helm" },
  { pattern: /\bCI\/CD\b|jenkins|circleci|github actions/i, skill: "CI/CD" },
  { pattern: /\bprometheus\b/i,               skill: "Prometheus" },
  { pattern: /\bgrafana\b/i,                  skill: "Grafana" },
  { pattern: /\bdatadog\b/i,                  skill: "Datadog" },
  { pattern: /\bsplunk\b/i,                   skill: "Splunk" },
  { pattern: /\belasticsearch\b|\belk\b/i,    skill: "Elasticsearch" },
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
  { pattern: /\bpython\b/i,                   skill: "Python" },
  { pattern: /\btypescript\b/i,               skill: "TypeScript" },
  { pattern: /\bjavascript\b/i,               skill: "JavaScript" },
  { pattern: /\bgo\b(?!\s*(?:home|to|forward))/i, skill: "Go" },
  { pattern: /\brust\b/i,                     skill: "Rust" },
  { pattern: /\bjava\b(?!script)/i,           skill: "Java" },
  { pattern: /\breact\b/i,                    skill: "React" },
  { pattern: /\bnode\.?js\b/i,                skill: "Node.js" },
  { pattern: /\bsql\b/i,                      skill: "SQL" },
  { pattern: /\bpostgres|postgresql\b/i,      skill: "PostgreSQL" },
  { pattern: /\bmongodb\b/i,                  skill: "MongoDB" },
  { pattern: /\bredis\b/i,                    skill: "Redis" },
  { pattern: /\bkafka\b/i,                    skill: "Kafka" },
  { pattern: /\bsnowflake\b/i,                skill: "Snowflake" },
  { pattern: /\bdatabricks\b/i,               skill: "Databricks" },
  { pattern: /\bagile\b|\bscrum\b/i,          skill: "Agile / Scrum" },
  { pattern: /\bOKRs?\b/i,                    skill: "OKRs" },
  { pattern: /\bkanban\b/i,                   skill: "Kanban" },
];

export function extractSkillsFromText(text: string): string[] {
  const found = new Set<string>();
  for (const { pattern, skill } of SKILL_PATTERNS) {
    if (pattern.test(text)) found.add(skill);
  }
  return Array.from(found);
}

/**
 * Seniority inference — canonical logic ported from profileScorer.inferSeniority
 * so it's usable in Deno (edge) contexts without pulling the whole Next.js graph.
 */
export type Seniority =
  | "intern" | "junior" | "associate" | "mid" | "senior"
  | "staff" | "principal" | "director" | "vp" | "executive" | "unknown";

export function inferSeniority(title: string): Seniority {
  const t = title.toLowerCase();
  if (/\bintern\b/.test(t))                        return "intern";
  if (/\bjunior\b|\bjr\.?\b/.test(t))              return "junior";
  if (/\bassociate\b/.test(t))                     return "associate";
  if (/\bstaff\b|\bstaff engineer\b/.test(t))      return "staff";
  if (/\bprincipal\b/.test(t))                     return "principal";
  if (/\bcto\b|\bceo\b|\bcio\b|\bciso\b|\bcfo\b|\bcoo\b|\bcso\b|\bcmo\b|\bcpo\b/i.test(t) ||
      /\bchief\b|\bpresident\b|\bexecutive\b/i.test(t)) return "executive";
  if (/\bbiso\b|\bbusiness information security officer\b/i.test(t)) return "director";
  if (/\bvp\b|\bvice president\b|\bsvp\b|\bevp\b/.test(t)) return "vp";
  if (/\bdirector\b|\bhead of\b/.test(t))          return "director";
  if (/\bsenior\b|\bsr\.?\b|\blead\b/.test(t))     return "senior";
  if (/\bmanager\b/.test(t))                       return "mid";
  return "unknown";
}
