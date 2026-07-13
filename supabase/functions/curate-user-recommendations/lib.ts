/**
 * Pure functions extracted from index.ts so vitest (Node) can import them
 * directly and assert output parity against the Node-side
 * src/services/retrieval/expandQueries.ts + retrieveByTitle.ts.
 *
 * Everything here is Deno-compatible (no external imports, no globals).
 * index.ts re-exports the same functions for backward compat with any
 * caller that inlined them prior to fix/jobs-curator-deno-port.
 */

// ROLE_FAMILIES — copied verbatim from src/services/curator/roleFamilies.ts.
// The parity test asserts the Deno-side output matches the Node side. If
// the taxonomy drifts on either side the test fails.
export const ROLE_FAMILIES: Record<string, string[]> = {
  director_of_security: [
    "director of security", "director security", "head of security",
    "head of information security", "director information security",
    "security director", "director cyber security", "director of infosec",
    "director of cybersecurity", "security program director",
    "senior director security", "senior director of security",
    "security lead", "lead security", "principal security",
    "senior security manager", "sr security manager",
    "information security lead", "security operations director",
    "director of information security", "information security director",
    "security operations lead",
  ],
  ciso: [
    "ciso", "chief information security officer", "chief security officer",
    "chief information security", "chief cybersecurity officer",
    "cso", "global ciso", "deputy ciso",
    "ciso office", "ciso deputy", "associate ciso",
    "field ciso", "virtual ciso", "vciso",
    "security executive", "executive security", "security chief",
  ],
  biso: [
    "biso", "business information security officer",
    "business information security", "business security officer",
    "divisional ciso", "business unit ciso",
  ],
  security_architect: [
    "security architect", "principal security architect",
    "lead security architect", "senior security architect",
    "chief security architect", "staff security architect",
    "enterprise security architect", "cybersecurity architect",
    "solutions architect security", "security solutions architect",
    "principal solutions architect security",
  ],
  vp_security: [
    "vp security", "vice president security", "vp information security",
    "vp cybersecurity", "vice president of security",
    "vice president cybersecurity", "vp cyber",
  ],
  director_of_engineering: [
    "director of engineering", "engineering director", "head of engineering",
    "director software engineering", "director platform engineering",
    "senior director engineering", "director r&d",
  ],
  vp_engineering: [
    "vp engineering", "vice president engineering", "vp software engineering",
    "svp engineering", "evp engineering",
  ],
  cto: [
    "cto", "chief technology officer", "chief technical officer",
    "chief technical", "chief tech officer",
  ],
  staff_engineer: [
    "staff engineer", "staff software engineer", "staff sre",
    "principal engineer", "principal software engineer",
    "distinguished engineer",
  ],
  senior_engineer: [
    "senior engineer", "senior software engineer", "sr. software engineer",
    "senior swe", "senior developer", "senior full-stack engineer",
  ],
  director_of_product: [
    "director of product", "product director", "head of product",
    "director product management", "senior director product",
  ],
  vp_product: [
    "vp product", "vice president product", "svp product",
    "chief product officer", "cpo",
  ],
  senior_pm: [
    "senior product manager", "sr. product manager", "senior pm", "lead product manager",
  ],
  director_of_data: [
    "director of data", "data director", "head of data", "head of analytics",
    "director data science", "director analytics",
  ],
  cdo: [
    "chief data officer", "cdo", "chief data", "chief analytics officer",
  ],
  data_scientist: [
    "data scientist", "senior data scientist", "principal data scientist",
    "ml engineer", "machine learning engineer",
  ],
  director_of_design: [
    "director of design", "design director", "head of design",
    "director product design", "director ux",
  ],
  vp_design: [
    "vp design", "vice president design", "chief design officer",
  ],
  vp_sales: [
    "vp sales", "vice president sales", "svp sales", "head of sales",
    "chief revenue officer", "cro",
  ],
  director_of_sales: [
    "director of sales", "sales director", "director enterprise sales",
    "director of business development",
  ],
  ae: [
    "account executive", "senior account executive", "enterprise account executive", "ae",
  ],
  cmo: [
    "chief marketing officer", "cmo", "vp marketing", "svp marketing",
    "head of marketing",
  ],
  director_of_marketing: [
    "director of marketing", "marketing director", "director growth",
    "director demand generation", "director performance marketing",
  ],
  chro: [
    "chro", "chief people officer", "chief human resources officer",
    "cpeo", "vp people", "vp hr", "vp human resources",
  ],
  director_of_people: [
    "director of people", "people director", "head of people",
    "director talent", "director of talent",
  ],
  cfo: [
    "cfo", "chief financial officer", "vp finance", "svp finance",
  ],
  controller: [
    "controller", "financial controller", "corporate controller", "assistant controller",
  ],
  coo: [
    "coo", "chief operating officer", "chief operations officer",
    "vp operations", "svp operations",
  ],
  director_of_operations: [
    "director of operations", "operations director", "head of operations",
    "director business operations",
  ],
  general_counsel: [
    "general counsel", "chief legal officer", "clo", "vp legal",
    "head of legal",
  ],
  vp_customer_success: [
    "vp customer success", "vice president customer success",
    "head of customer success", "chief customer officer", "cco",
  ],
  director_of_customer_success: [
    "director of customer success", "customer success director",
    "head of cs",
  ],
};

const STOPWORDS = new Set<string>([
  "of", "the", "and", "for", "&", "a", "an", "in", "on", "at", "to",
]);

export function normalisePhraseDeno(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/[,;:—–\-\/&]+/g, " ")
    .split(/\s+/)
    .filter((w: string) => w && !STOPWORDS.has(w))
    .join(" ")
    .trim();
}

export function synonymsForExactDeno(role: string): string[] {
  const target = normalisePhraseDeno(role);
  if (!target) return [];
  const matched = new Set<string>();
  for (const [, synonyms] of Object.entries(ROLE_FAMILIES)) {
    const familyNormalised = synonyms.map(normalisePhraseDeno);
    if (familyNormalised.includes(target)) {
      for (const s of synonyms) matched.add(s);
    }
  }
  return Array.from(matched);
}

export function expandQueriesDeno(
  targetRoles: string[],
): Array<{ label: string; queries: string[] }> {
  const groups: Array<{ label: string; queries: string[] }> = [];
  const seenLabels = new Set<string>();
  for (const raw of targetRoles) {
    const label = (raw ?? "").trim();
    if (!label) continue;
    if (seenLabels.has(label.toLowerCase())) continue;
    seenLabels.add(label.toLowerCase());
    const synonyms = synonymsForExactDeno(label);
    const queries = new Set<string>();
    queries.add(label.toLowerCase());
    for (const s of synonyms) queries.add(s.toLowerCase());
    groups.push({ label, queries: Array.from(queries).slice(0, 15) });
  }
  return groups;
}

export const MAX_PHRASES_PER_TSQUERY_DENO = 15;

export function buildTsqueryArgDeno(
  phrases: string[],
): { arg: string; mode: "websearch" | "plain" } {
  const cleaned = phrases
    .map((p: string) => (p ?? "").trim().toLowerCase())
    .filter(Boolean)
    .slice(0, MAX_PHRASES_PER_TSQUERY_DENO);
  if (cleaned.length === 0) return { arg: "", mode: "websearch" };
  if (cleaned.length === 1) return { arg: cleaned[0], mode: "websearch" };
  const tokensOf = (s: string) => s.split(/\s+/).filter(Boolean);
  const arg = cleaned
    .map((p: string) => {
      const tokens = tokensOf(p);
      return tokens.length === 1 ? tokens[0] : "(" + tokens.join(" & ") + ")";
    })
    .join(" | ");
  return { arg, mode: "plain" };
}
