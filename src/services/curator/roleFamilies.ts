/**
 * feat/jobs-for-you-curator Task 1 — Role family taxonomy.
 *
 * Hard-coded synonym tables for common role families. Zero LLM calls.
 * Given a user's target roles we look up the family (or families) they
 * belong to and expand to the full synonym list so the curator can OR
 * across all of them when querying ats_jobs.
 */

export const ROLE_FAMILIES: Record<string, string[]> = {
  // ── Security executive family ──────────────────────────────────────────
  director_of_security: [
    "director of security", "director security", "head of security",
    "head of information security", "director information security",
    "security director", "director cyber security", "director of infosec",
    "director of cybersecurity", "security program director",
    "senior director security", "senior director of security",
    // fix/jobs-curator-relaxation Fix 3 — additional variations
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
    // fix/jobs-curator-relaxation Fix 3 — vCISO + adjacent exec titles
    "ciso office", "ciso deputy", "associate ciso",
    "field ciso", "virtual ciso", "vciso",
    "security executive", "executive security", "security chief",
  ],
  biso: [
    "biso", "business information security officer",
    "business information security", "business security officer",
    "divisional ciso", "business unit ciso",
  ],
  // fix/jobs-curator-relaxation Fix 3 — new security architecture family
  security_architect: [
    "security architect", "principal security architect",
    "lead security architect", "senior security architect",
    "chief security architect", "staff security architect",
    "enterprise security architect", "cybersecurity architect",
    // fix/jobs-enrichment-throughput Fix 4 — architect variants where the
    // "architect" word comes BEFORE "security" (e.g. Elastic's job title
    // was previously falling out of every security family).
    "solutions architect security", "security solutions architect",
    "principal solutions architect security",
  ],
  vp_security: [
    "vp security", "vice president security", "vp information security",
    "vp cybersecurity", "vice president of security",
    "vice president cybersecurity", "vp cyber",
  ],
  // ── Engineering ────────────────────────────────────────────────────────
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
  // ── Product ────────────────────────────────────────────────────────────
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
  // ── Data / analytics ───────────────────────────────────────────────────
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
  // ── Design ─────────────────────────────────────────────────────────────
  director_of_design: [
    "director of design", "design director", "head of design",
    "director product design", "director ux",
  ],
  vp_design: [
    "vp design", "vice president design", "chief design officer",
  ],
  // ── Sales ──────────────────────────────────────────────────────────────
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
  // ── Marketing ──────────────────────────────────────────────────────────
  cmo: [
    "chief marketing officer", "cmo", "vp marketing", "svp marketing",
    "head of marketing",
  ],
  director_of_marketing: [
    "director of marketing", "marketing director", "director growth",
    "director demand generation", "director performance marketing",
  ],
  // ── HR / people ────────────────────────────────────────────────────────
  chro: [
    "chro", "chief people officer", "chief human resources officer",
    "cpeo", "vp people", "vp hr", "vp human resources",
  ],
  director_of_people: [
    "director of people", "people director", "head of people",
    "director talent", "director of talent",
  ],
  // ── Finance ────────────────────────────────────────────────────────────
  cfo: [
    "cfo", "chief financial officer", "vp finance", "svp finance",
  ],
  controller: [
    "controller", "financial controller", "corporate controller", "assistant controller",
  ],
  // ── Operations ─────────────────────────────────────────────────────────
  coo: [
    "coo", "chief operating officer", "chief operations officer",
    "vp operations", "svp operations",
  ],
  director_of_operations: [
    "director of operations", "operations director", "head of operations",
    "director business operations",
  ],
  // ── Legal ──────────────────────────────────────────────────────────────
  general_counsel: [
    "general counsel", "chief legal officer", "clo", "vp legal",
    "head of legal",
  ],
  // ── Customer / support ─────────────────────────────────────────────────
  vp_customer_success: [
    "vp customer success", "vice president customer success",
    "head of customer success", "chief customer officer", "cco",
  ],
  director_of_customer_success: [
    "director of customer success", "customer success director",
    "head of cs",
  ],
};

/**
 * Expand a list of user target-role labels into a de-duplicated synonym
 * bag + the family keys they matched. Match rule: either substring OR
 * ≥ 50% word-overlap ratio between the user's role and any synonym.
 */
export function expandTargetRoles(targetRoles: string[]): {
  expanded: string[];
  families: string[];
} {
  const expanded = new Set<string>();
  const families = new Set<string>();

  for (const role of targetRoles) {
    const normalized = role.toLowerCase().trim();
    if (!normalized) continue;
    expanded.add(normalized);

    for (const [familyKey, synonyms] of Object.entries(ROLE_FAMILIES)) {
      const isMatch = synonyms.some(s =>
        normalized.includes(s) || s.includes(normalized) ||
        wordOverlapRatio(normalized, s) >= 0.5
      );
      if (isMatch) {
        families.add(familyKey);
        for (const s of synonyms) expanded.add(s);
      }
    }
  }

  return {
    expanded: Array.from(expanded),
    families: Array.from(families),
  };
}

export function wordOverlapRatio(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  const intersection = [...wordsA].filter(w => wordsB.has(w));
  const union = new Set([...wordsA, ...wordsB]);
  return intersection.length / union.size;
}
