/**
 * fix/jobs-skills-normalization — split punctuation-glued skill compounds
 * and alias-map to canonical forms, so the scorer sees "ISO 27001" instead
 * of the raw 40-character `"NIST CSF 2.0 · ISO/IEC 27001 · NIST 800-53"`.
 *
 * Design rules:
 *   1. ZERO fuzzy matching. Word-overlap ratios have burned us twice
 *      (curator PR #354, tsquery PR #372). Aliases + word-bounded
 *      containment only.
 *   2. Cross-domain by construction. The alias table has explicit
 *      sections for security/compliance, tech, business/finance,
 *      healthcare, marketing, and general. Adding a domain later means
 *      adding a section — no code changes.
 *   3. Deterministic. Given identical input, normalizeSkills returns
 *      byte-identical output. No Set enumeration order, no Date, no
 *      Math.random.
 *   4. Idempotent. normalizeSkills(normalizeSkills(x)) === normalizeSkills(x).
 *   5. Slash-safe. Known compounds like "ISO/IEC 27001" and "CI/CD"
 *      are protected before splitting on `/`, then restored. See
 *      PROTECTED_SLASH_TOKENS below.
 */

// ─────────────────────────────────────────────────────────────────────
// ALIAS GROUPS
//
// Each entry is a group of strings that all mean the same thing. The
// FIRST entry is the display form used in strengths/gaps templates.
// Add new groups here; the code doesn't care about ordering between
// groups.
//
// A note on ambiguous acronyms like "PM": include all reasonable
// expansions in the same group. Matching is symmetric — "PM" then
// matches JD phrases containing "project management" AND "product
// management" via the shared canonical form.
// ─────────────────────────────────────────────────────────────────────
const ALIAS_GROUPS: string[][] = [
  // ── Security / compliance ────────────────────────────────────────
  ["ISO 27001", "ISO/IEC 27001", "ISO27001", "ISO/IEC-27001"],
  ["NIST CSF", "NIST CSF 2.0", "NIST Cybersecurity Framework", "Cybersecurity Framework"],
  ["NIST 800-53", "NIST SP 800-53", "SP 800-53", "800-53"],
  ["NIST 800-171", "NIST SP 800-171", "SP 800-171"],
  ["SOC 2", "SOC2", "SOC II", "SOC 2 Type II", "SOC 2 Type 2"],
  ["PCI DSS", "PCI-DSS", "PCI", "Payment Card Industry Data Security Standard"],
  ["GRC", "Governance Risk and Compliance", "Governance, Risk and Compliance", "Governance Risk & Compliance"],
  ["IAM", "Identity and Access Management", "Identity & Access Management"],
  ["SIEM", "Security Information and Event Management"],
  ["Incident Response", "IR", "Incident Handling"],
  ["Tabletop Exercises", "Tabletops", "Tabletop", "Tabletop Exercise"],
  ["BISO", "Business Information Security Officer", "Business Information Security"],
  ["CISO", "Chief Information Security Officer", "Chief Security Officer"],
  ["Disaster Recovery", "DR"],
  ["Business Continuity", "BCP", "Business Continuity Planning", "Business Continuity Plan"],
  ["Business Continuity and Disaster Recovery", "BCDR", "BC/DR", "BC DR"],
  ["Zero Trust", "Zero Trust Architecture", "ZTA", "ZTNA"],
  ["Threat Intelligence", "CTI", "Cyber Threat Intelligence"],
  ["Vulnerability Management", "VM"],
  ["Penetration Testing", "PenTest", "Pen Test", "Pentesting"],
  ["Cloud Security"],
  ["DevOps", "Dev Ops"],
  ["DevSecOps", "Dev Sec Ops"],
  ["Risk Assessment"],
  ["Control Testing", "Security Control Testing"],
  ["Policy Development"],
  ["FFIEC"],
  ["GLBA", "Gramm Leach Bliley"],
  ["SOX", "Sarbanes-Oxley", "Sarbanes Oxley"],
  ["GDPR", "General Data Protection Regulation"],
  ["OCC"],
  ["NYDFS", "23 NYCRR 500"],
  ["NFA"],
  ["HIPAA"],
  ["COBIT"],
  ["ITIL"],
  ["OWASP"],
  // ── Tech ─────────────────────────────────────────────────────────
  ["Kubernetes", "K8s", "K8"],
  ["JavaScript", "JS"],
  ["TypeScript", "TS"],
  ["CI/CD", "CICD", "CI CD", "Continuous Integration", "Continuous Delivery", "Continuous Deployment"],
  ["AWS", "Amazon Web Services"],
  ["GCP", "Google Cloud Platform", "Google Cloud"],
  ["Azure", "Microsoft Azure"],
  ["Machine Learning", "ML"],
  ["Artificial Intelligence", "AI"],
  ["ETL", "Extract Transform Load"],
  ["API", "Application Programming Interface"],
  ["REST", "RESTful", "REST API"],
  ["GraphQL"],
  ["gRPC"],
  ["TCP/IP", "TCP IP"],
  ["OAuth", "OAuth2", "OAuth 2.0"],
  ["SSO", "Single Sign-On", "Single Sign On"],
  ["MFA", "Multi-Factor Authentication", "Multifactor Authentication", "Two-Factor Authentication", "2FA"],
  ["SQL"],
  ["NoSQL", "No SQL"],
  ["PostgreSQL", "Postgres"],
  ["MongoDB", "Mongo"],
  ["Redis"],
  ["Docker"],
  ["Terraform"],
  ["Ansible"],
  ["Git"],
  ["Linux"],
  ["Python"],
  ["Java"],
  ["Go", "Golang"],
  ["Rust"],
  ["C++", "CPP"],
  ["C#", "CSharp", "C Sharp"],
  ["React", "React.js", "ReactJS"],
  ["Next.js", "NextJS", "Next JS"],
  ["Vue", "Vue.js", "VueJS"],
  ["Node.js", "NodeJS", "Node JS", "Node"],
  // ── Business / finance ───────────────────────────────────────────
  ["P&L", "PnL", "Profit and Loss", "Profit & Loss"],
  ["GAAP", "Generally Accepted Accounting Principles"],
  ["FP&A", "FPA", "Financial Planning and Analysis"],
  ["M&A", "Mergers and Acquisitions", "Mergers & Acquisitions"],
  ["KPI", "Key Performance Indicator", "Key Performance Indicators"],
  ["ROI", "Return on Investment"],
  ["ERP", "Enterprise Resource Planning"],
  ["CRM", "Customer Relationship Management"],
  ["IFRS", "International Financial Reporting Standards"],
  ["EBITDA"],
  ["OKR", "OKRs", "Objectives and Key Results"],
  ["Budget Oversight", "Budget Management", "Budget Ownership"],
  // ── Healthcare ────────────────────────────────────────────────────
  ["EMR", "EHR", "Electronic Health Records", "Electronic Medical Records"],
  ["RN", "Registered Nurse"],
  ["BLS", "Basic Life Support"],
  ["ACLS", "Advanced Cardiac Life Support"],
  ["PALS", "Pediatric Advanced Life Support"],
  ["Telehealth", "Telemedicine"],
  ["HL7", "Health Level 7"],
  ["FHIR"],
  // ── Marketing ─────────────────────────────────────────────────────
  ["SEO", "Search Engine Optimization"],
  ["SEM", "Search Engine Marketing"],
  ["GTM", "Go-to-market", "Go To Market", "Go To Market Strategy"],
  ["PPC", "Pay-per-click", "Pay Per Click"],
  ["CAC", "Customer Acquisition Cost"],
  ["LTV", "Lifetime Value", "Customer Lifetime Value", "CLV"],
  ["ROAS", "Return On Ad Spend"],
  ["A/B Testing", "AB Testing", "Split Testing"],
  ["Attribution Modeling"],
  // ── General / cross-domain ───────────────────────────────────────
  //   Ambiguous — both expansions in the same group so matching is
  //   symmetric. A JD mentioning "project management" OR "product
  //   management" both match a profile with "PM".
  ["PM", "Project Management", "Product Management"],
  ["QA", "Quality Assurance"],
  ["UX", "User Experience"],
  ["UI", "User Interface"],
  ["OKR", "Objectives and Key Results"],
  ["Agile"],
  ["Scrum"],
  ["Kanban"],
  ["Stakeholder Engagement", "Stakeholder Management", "Cross-Functional Stakeholder Engagement"],
  ["Executive Advisory", "Board Advisory", "Board & Regulator Advisory", "Regulator Advisory"],
];

// ─────────────────────────────────────────────────────────────────────
// PROTECTED_SLASH_TOKENS
//
// Compound skills whose `/` must survive the /-split step. We replace
// them with placeholders before splitting on unprotected `/`, then
// restore.
// ─────────────────────────────────────────────────────────────────────
const PROTECTED_SLASH_TOKENS = [
  "ISO/IEC 27001", "ISO/IEC 27002", "ISO/IEC 27017", "ISO/IEC 27018",
  "CI/CD", "TCP/IP", "S/4HANA", "24/7", "A/B Testing", "BC/DR",
];

// ─────────────────────────────────────────────────────────────────────
// Build lookup table (canonical form ← every alias, lower-cased).
// ─────────────────────────────────────────────────────────────────────
const ALIAS_LOOKUP: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const group of ALIAS_GROUPS) {
    const canonical = group[0];
    for (const variant of group) {
      m.set(variant.toLowerCase(), canonical);
    }
  }
  return m;
})();

// Reverse index: canonical → all lower-cased aliases (for JD-side match).
const CANONICAL_TO_ALIASES: Map<string, string[]> = (() => {
  const m = new Map<string, string[]>();
  for (const group of ALIAS_GROUPS) {
    const canonical = group[0];
    m.set(canonical, group.map(g => g.toLowerCase()));
  }
  return m;
})();

// ─────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────

/**
 * Normalize a list of raw skill strings into a deduped canonical list.
 *
 * Pipeline:
 *   1. Protect known slash-tokens (ISO/IEC 27001, CI/CD, TCP/IP, …)
 *   2. Split on `·` `•` `|` `/` `,` `;` `&` word-bounded `and`
 *   3. Restore protected tokens
 *   4. Trim; drop empties + fragments < 2 chars
 *   5. Alias-map to canonical form (case-insensitive)
 *   6. Dedupe by canonical form, preserving first-seen order
 */
export function normalizeSkills(raw: string[]): string[] {
  const canonicalSeen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    for (const piece of splitCompound(item)) {
      const canonical = canonicalize(piece);
      if (!canonical) continue;
      const key = canonical.toLowerCase();
      if (canonicalSeen.has(key)) continue;
      canonicalSeen.add(key);
      out.push(canonical);
    }
  }
  return out;
}

/**
 * Alias-aware equality for two skill strings. Case-insensitive.
 * Uses canonical-form equality (fastest path) and falls back to
 * word-bounded containment if neither has a canonical mapping.
 *
 * Word-bounded means "java" NEVER matches "javascript" and "GRC" NEVER
 * matches "TRUST_GRC" — the token boundary matters.
 */
export function skillsMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  const na = canonicalize(a);
  const nb = canonicalize(b);
  if (!na || !nb) return false;
  if (na.toLowerCase() === nb.toLowerCase()) return true;
  // Word-bounded containment either way.
  return containsWord(na.toLowerCase(), nb.toLowerCase())
      || containsWord(nb.toLowerCase(), na.toLowerCase());
}

/**
 * Does any alias of the canonical `skill` appear as a word-bounded
 * substring inside `text`? Used by the JD-side matcher.
 */
export function skillAppearsIn(skill: string, text: string): boolean {
  const canonical = canonicalize(skill);
  if (!canonical) return false;
  const t = text.toLowerCase();
  const aliases = CANONICAL_TO_ALIASES.get(canonical) ?? [canonical.toLowerCase()];
  for (const a of aliases) {
    if (containsWord(t, a)) return true;
  }
  return false;
}

/**
 * Return the display (canonical) form of a raw skill string.
 * Exported for tests + for producing readable strengths/gaps lines.
 */
export function canonicalize(raw: string): string {
  const cleaned = raw.trim();
  if (cleaned.length < 2) return "";
  const hit = ALIAS_LOOKUP.get(cleaned.toLowerCase());
  if (hit) return hit;
  // Not in the alias table — return as-is but with light title-casing
  // normalization (leave acronyms uppercase; capitalize first letter of
  // each significant word).
  return cleaned;
}

// ─────────────────────────────────────────────────────────────────────
// Internals
// ─────────────────────────────────────────────────────────────────────

/**
 * Split one raw compound skill string into candidate pieces.
 * Slash-token protection guarantees "ISO/IEC 27001" survives.
 */

function escapeReg(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Word-bounded contains: does `needle` appear inside `haystack` bounded
 * on both sides by non-alphanumeric characters (or string boundary)?
 * Prevents "java" from matching "javascript" or "sql" from matching
 * "postgresql".
 */
function containsWord(haystack: string, needle: string): boolean {
  if (!haystack || !needle) return false;
  if (haystack === needle) return true;
  // Escape needle for regex use.
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Character class boundaries — we want [non-word][needle][non-word]
  // but the needle itself may contain internal punctuation (spaces,
  // hyphens, ampersands). Use lookbehind/lookahead over word-y chars.
  const re = new RegExp(`(?:^|[^A-Za-z0-9+#])${escaped}(?:$|[^A-Za-z0-9+#])`, "i");
  return re.test(haystack);
}

/**
 * Attempt to alias-hit the whole raw string BEFORE splitting.
 * Returns the canonical form when the whole string (with light &↔and +
 * whitespace normalisation) is itself a known alias. Otherwise null.
 * Distinct from `canonicalize()` which passthroughs unknown strings.
 */
function strictAliasHit(raw: string): string | null {
  const norm = raw
    .replace(/\s+&\s+/g, " and ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return ALIAS_LOOKUP.get(norm) ?? null;
}

/**
 * Extract parenthetical / bracketed acronyms as extra candidates.
 * "Business Information Security (BISO)" →
 *   { main: "Business Information Security", extras: ["BISO"] }
 */
function extractParens(raw: string): { main: string; extras: string[] } {
  const extras: string[] = [];
  const main = raw
    .replace(/[\(\[\{]([^)\]\}]+)[\)\]\}]/g, (_m, inner: string) => {
      const t = inner.trim();
      if (t.length >= 2) extras.push(t);
      return " ";
    })
    .replace(/\s+/g, " ")
    .trim();
  return { main, extras };
}

function splitCompound(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  // Extract paren contents ("Business Information Security (BISO)" → BISO)
  // and try strict alias hits on the whole string AND the paren-stripped
  // main as CANDIDATES. Do not short-circuit — always split too, so JDs
  // that mention one component of a compound (e.g. only "business
  // continuity") still match. Dedupe by canonical form downstream.
  const { main, extras } = extractParens(trimmed);
  const candidates: string[] = [...extras];
  const wholeHit = strictAliasHit(trimmed);
  if (wholeHit) candidates.push(wholeHit);
  const mainHit = strictAliasHit(main);
  if (mainHit) candidates.push(mainHit);

  // Split on delimiters, protecting known slash-tokens first.
  const protectedTokens: string[] = [];
  let scratch = main;
  for (let i = 0; i < PROTECTED_SLASH_TOKENS.length; i++) {
    const tok = PROTECTED_SLASH_TOKENS[i];
    const re  = new RegExp(escapeReg(tok), "gi");
    scratch = scratch.replace(re, () => {
      // Sentinel: single  + index — regex-safe, will never appear
      // in a real skill string.
      const idx = protectedTokens.length;
      protectedTokens.push(tok);
      return `${idx}`;
    });
  }
  const parts = scratch
    .split(/[·•|,;/]|\s+&\s+|\s+\band\b\s+/i)
    .map(p => p.trim())
    .map(p => p.replace(/(\d+)/g, (_m, i: string) => protectedTokens[Number(i)]))
    .filter(Boolean);
  return [...candidates, ...parts];
}
