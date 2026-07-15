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
  // fix/jobs-tsquery-mode Fix 4 — dedupe groups by identical query set.
  const seenQuerySets = new Map<string, string>();
  for (const raw of targetRoles) {
    const label = (raw ?? "").trim();
    if (!label) continue;
    if (seenLabels.has(label.toLowerCase())) continue;
    seenLabels.add(label.toLowerCase());
    const synonyms = synonymsForExactDeno(label);
    const queries = new Set<string>();
    queries.add(label.toLowerCase());
    for (const s of synonyms) queries.add(s.toLowerCase());
    const arr = Array.from(queries).slice(0, 15);
    const fp = [...arr].sort().join("|");
    if (seenQuerySets.has(fp)) continue;
    seenQuerySets.set(fp, label);
    groups.push({ label, queries: arr });
  }
  return groups;
}

export const MAX_PHRASES_PER_TSQUERY_DENO = 15;

/**
 * fix/jobs-tsquery-mode — DO NOT return `mode: "plain"` with operator-laden
 * args. The pre-fix version emitted `(tok & tok) | (tok & tok) | tok` under
 * `mode: "plain"`, which Supabase's `.textSearch(col, arg, {type:"plain"})`
 * routes to `plainto_tsquery`. plainto_tsquery treats `&`, `|`, `(`, `)` as
 * ordinary literal characters, so the arg matched zero rows on every call.
 *
 * The supabase-js SDK only supports `plain | phrase | websearch` — raw
 * `to_tsquery` is unreachable without `.rpc()`. `websearch_to_tsquery` gives
 * us the disjunction we need via the `word OR "quoted phrase"` grammar and
 * is safe to feed through `.textSearch(..., {type:"websearch"})`.
 *
 * Multi-word phrases are quoted so websearch treats them as phrase queries
 * (adjacent-token match), which is stricter than the pre-fix AND-of-tokens
 * form but correct: "director of security" should require adjacent occurrence,
 * not merely the co-presence of "director" + "security" anywhere in the title.
 */
export function buildTsqueryArgDeno(
  phrases: string[],
): { arg: string; mode: "websearch" } {
  const cleaned = phrases
    .map((p: string) => (p ?? "").trim().toLowerCase())
    .filter(Boolean)
    .slice(0, MAX_PHRASES_PER_TSQUERY_DENO)
    .map((p: string) =>
      /\s/.test(p) ? `"${p.replace(/"/g, "")}"` : p
    );
  return { arg: cleaned.join(" OR "), mode: "websearch" };
}

// ─────────────────────────────────────────────────────────────────────
// fix/jobs-skills-normalization — Deno port of the skills normalizer.
//
// Kept in sync manually with src/services/scoring/skillsNormalizer.ts.
// The parity test in
//   src/services/retrieval/__tests__/expandQueries.deno-parity.test.ts
// pattern is not applied here yet, but if skills-scoring drift becomes
// a problem the same technique (import lib.ts from vitest via a
// relative path) can guard it.
//
// This module is currently DEAD CODE from the edge function's
// perspective — index.ts's scoreJob doesn't call it yet. It's here so
// Platform can wire it in when they redeploy curate-user-
// recommendations, in the same PR that switches Deno-side scoring to
// alias-aware matching. Doing it code-only avoids a Platform deploy for
// this PR.
// ─────────────────────────────────────────────────────────────────────
const ALIAS_GROUPS_DENO: string[][] = [
  ["ISO 27001", "ISO/IEC 27001", "ISO27001"],
  ["NIST CSF", "NIST CSF 2.0", "NIST Cybersecurity Framework"],
  ["NIST 800-53", "NIST SP 800-53", "SP 800-53"],
  ["SOC 2", "SOC2", "SOC II", "SOC 2 Type II"],
  ["PCI DSS", "PCI-DSS", "PCI"],
  ["GRC", "Governance Risk and Compliance"],
  ["IAM", "Identity and Access Management"],
  ["SIEM"],
  ["Incident Response", "IR"],
  ["Tabletop Exercises", "Tabletops", "Tabletop"],
  ["BISO", "Business Information Security Officer", "Business Information Security"],
  ["CISO", "Chief Information Security Officer", "Chief Security Officer"],
  ["Disaster Recovery", "DR"],
  ["Business Continuity", "BCP"],
  ["Zero Trust", "Zero Trust Architecture", "ZTA"],
  ["Cloud Security"],
  ["DevOps"],
  ["Kubernetes", "K8s"],
  ["JavaScript", "JS"],
  ["TypeScript", "TS"],
  ["CI/CD", "CICD", "Continuous Integration"],
  ["AWS", "Amazon Web Services"],
  ["GCP", "Google Cloud"],
  ["Azure", "Microsoft Azure"],
  ["Machine Learning", "ML"],
  ["Artificial Intelligence", "AI"],
  ["P&L", "PnL", "Profit and Loss"],
  ["GAAP"],
  ["SOX", "Sarbanes-Oxley"],
  ["FP&A", "FPA", "Financial Planning and Analysis"],
  ["M&A", "Mergers and Acquisitions"],
  ["HIPAA"],
  ["EMR", "EHR", "Electronic Health Records"],
  ["SEO", "Search Engine Optimization"],
  ["SEM", "Search Engine Marketing"],
  ["CRM", "Customer Relationship Management"],
  ["GTM", "Go-to-market"],
  ["PPC", "Pay-per-click"],
  ["PM", "Project Management", "Product Management"],
  ["GDPR"],
  ["OCC"],
  ["FFIEC"],
  ["GLBA"],
  ["NYDFS"],
];

const PROTECTED_SLASH_TOKENS_DENO = ["ISO/IEC 27001", "CI/CD", "TCP/IP", "BC/DR"];

const ALIAS_LOOKUP_DENO: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const group of ALIAS_GROUPS_DENO) {
    const canonical = group[0];
    for (const variant of group) m.set(variant.toLowerCase(), canonical);
  }
  return m;
})();

function escapeRegDeno(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function strictAliasHitDeno(raw: string): string | null {
  const norm = raw.replace(/\s+&\s+/g, " and ").replace(/\s+/g, " ").trim().toLowerCase();
  return ALIAS_LOOKUP_DENO.get(norm) ?? null;
}

function extractParensDeno(raw: string): { main: string; extras: string[] } {
  const extras: string[] = [];
  const main = raw
    .replace(/[\(\[\{]([^)\]\}]+)[\)\]\}]/g, (_m: string, inner: string) => {
      const t = inner.trim();
      if (t.length >= 2) extras.push(t);
      return " ";
    })
    .replace(/\s+/g, " ")
    .trim();
  return { main, extras };
}

function splitCompoundDeno(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  const { main, extras } = extractParensDeno(trimmed);
  const candidates: string[] = [...extras];
  const wholeHit = strictAliasHitDeno(trimmed);
  if (wholeHit) candidates.push(wholeHit);
  const mainHit = strictAliasHitDeno(main);
  if (mainHit) candidates.push(mainHit);
  const protectedTokens: string[] = [];
  let scratch = main;
  for (let i = 0; i < PROTECTED_SLASH_TOKENS_DENO.length; i++) {
    const tok = PROTECTED_SLASH_TOKENS_DENO[i];
    const re  = new RegExp(escapeRegDeno(tok), "gi");
    scratch = scratch.replace(re, () => {
      const idx = protectedTokens.length;
      protectedTokens.push(tok);
      return `${idx}`;
    });
  }
  const parts = scratch
    .split(/[·•|,;/]|\s+&\s+|\s+\band\b\s+/i)
    .map((p: string) => p.trim())
    .map((p: string) => p.replace(/(\d+)/g, (_m: string, i: string) => protectedTokens[Number(i)]))
    .filter(Boolean);
  return [...candidates, ...parts];
}

export function canonicalizeDeno(raw: string): string {
  const cleaned = raw.trim();
  if (cleaned.length < 2) return "";
  const hit = ALIAS_LOOKUP_DENO.get(cleaned.toLowerCase());
  if (hit) return hit;
  return cleaned;
}

export function normalizeSkillsDeno(raw: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    for (const piece of splitCompoundDeno(item)) {
      const canonical = canonicalizeDeno(piece);
      if (!canonical) continue;
      const key = canonical.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(canonical);
    }
  }
  return out;
}
