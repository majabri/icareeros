/**
 * feat/jobs-multi-industry-coverage — canonical role/seniority/industry
 * classifiers used by both the Next.js curator and the enrich-jobs edge
 * function. Deterministic, regex-based, zero LLM.
 */

import { ROLE_FAMILIES } from "./roleFamilies";
import type { Seniority } from "@/services/scoring/profileScorer";

export type SeniorityTier =
  | "intern" | "junior" | "associate" | "mid" | "senior"
  | "staff"  | "principal" | "director" | "vp" | "executive"
  | "unknown";

// ── Role family classification ──────────────────────────────────────────
/**
 * Given a job title, return the list of role_family keys it belongs to.
 * A title can belong to multiple families (e.g. "Senior Security Architect"
 * → ["security_architect", "senior_engineer"]).
 */
export function classifyIntoRoleFamilies(title: string): string[] {
  const raw = (title ?? "").toLowerCase().trim();
  if (!raw) return [];
  // Normalise the title: strip punctuation to spaces, drop "of" so that
  // "VP of Sales" matches "vp sales", and collapse whitespace so that
  // token-boundary matching becomes safe.
  const t = " " + raw
    .replace(/[,;:—–\-]/g, " ")
    .replace(/\bof\b/g, " ")
    .replace(/\s+/g, " ")
    .trim() + " ";
  const hit = new Set<string>();
  for (const [familyKey, synonyms] of Object.entries(ROLE_FAMILIES)) {
    for (const rawSyn of synonyms) {
      const syn = " " + rawSyn
        .toLowerCase()
        .replace(/\bof\b/g, " ")
        .replace(/\s+/g, " ")
        .trim() + " ";
      // Word-boundary substring match (both sides padded with spaces).
      if (t.includes(syn)) { hit.add(familyKey); break; }
    }
  }
  return Array.from(hit);
}

// ── Seniority tier inference ────────────────────────────────────────────
/**
 * Slightly richer than profileScorer.inferSeniority — the tier is the same
 * enum with an "unknown" fallback. Uses both title and description for
 * disambiguation (e.g. "SWE" alone → mid; "SWE with 10+ years experience"
 * → senior).
 */
export function inferSeniorityTier(title: string, description: string = ""): SeniorityTier {
  const t = (title ?? "").toLowerCase();
  const d = (description ?? "").toLowerCase();

  if (/\bintern\b/.test(t))                             return "intern";
  if (/\bjunior\b|\bjr\.?\b/.test(t))                   return "junior";
  if (/\bassociate\b/.test(t))                          return "associate";

  // C-suite BEFORE the "vp" pattern — "CISO / CTO / CFO" etc. are exec, not VP.
  if (/\bciso\b|\bcto\b|\bceo\b|\bcio\b|\bcfo\b|\bcoo\b|\bcso\b|\bcmo\b|\bcpo\b/i.test(t)) return "executive";
  if (/\bchief\b|\bpresident\b|\bexecutive vp\b/i.test(t))                                return "executive";
  if (/\bbiso\b|\bbusiness information security officer\b/i.test(t))                       return "director";

  if (/\bsvp\b|\bevp\b|\bsr\.?\s*vp\b|\bsenior vp\b/.test(t))     return "vp";
  if (/\bvp\b|\bvice president\b/.test(t))                        return "vp";
  if (/\bdirector\b|\bhead of\b/.test(t))                         return "director";
  if (/\bprincipal\b/.test(t))                                    return "principal";
  if (/\bstaff\b/.test(t))                                        return "staff";
  if (/\bsenior\b|\bsr\.?\s/.test(t) || /\blead\b/.test(t))       return "senior";
  if (/\bmanager\b/.test(t))                                      return "mid";

  // Description-based fallback: "10+ years" → senior.
  if (/\b10\+? years|\b12\+? years|\b15\+? years/.test(d))        return "senior";

  return "unknown";
}

// ── Industry inference ──────────────────────────────────────────────────
/**
 * Given the company name + full description, classify into 0..N industry
 * keys. Order matters: more-specific keys tried first (fintech before
 * financial_services).
 */
const INDUSTRY_KEYWORDS: Array<{ key: string; patterns: RegExp[] }> = [
  { key: "fintech", patterns: [
    /\bfintech\b/i, /\bpayment(s)?\b/i, /\bcrypto\b/i, /\bblockchain\b/i,
    /\bneobank\b/i, /\bstablecoin\b/i, /\bdefi\b/i,
  ] },
  { key: "financial_services", patterns: [
    /\bbank\b/i, /\bfinancial\b/i, /\btrading\b/i, /\bcredit\b/i,
    /\bloan\b/i, /\bmortgage\b/i, /\binvestment\b/i, /\bhedge fund\b/i,
    /\bcapital markets\b/i, /\binsurance\b/i,
  ] },
  { key: "healthcare", patterns: [
    /\bhospital\b/i, /\bclinic\b/i, /\bpatient\b/i, /\bmedical\b/i,
    /\bclinical\b/i, /\bnursing\b/i, /\bphysician\b/i, /\bhealthcare\b/i,
    /\btelehealth\b/i, /\btelemedicine\b/i,
  ] },
  { key: "life_sciences", patterns: [
    /\bpharma\b/i, /\bbiotech\b/i, /\bdrug\b/i, /\bclinical trial\b/i,
    /\bfda\b/i, /\bbiologics\b/i, /\bgenomics\b/i,
  ] },
  { key: "defense", patterns: [
    /\bdefen(s|c)e\b/i, /\bmilitary\b/i, /\baerospace\b/i,
    /\bsecurity clearance\b/i, /\bTS\/SCI\b/i, /\bDoD\b/i,
  ] },
  { key: "energy", patterns: [
    /\boil\b/i, /\bgas\b/i, /\brenewable\b/i, /\bsolar\b/i, /\bwind\b/i,
    /\bgrid\b/i, /\butility\b/i,
  ] },
  { key: "retail", patterns: [
    /\bretail\b/i, /\be-?commerce\b/i, /\bmerchandising\b/i, /\bbrand\b/i,
    /\bconsumer\b/i, /\bDTC\b/i,
  ] },
  { key: "consulting", patterns: [
    /\bconsulting\b/i, /\badvisory\b/i, /\bclient engagement\b/i,
    /\bmanagement consulting\b/i, /\bpartner\b/i,
  ] },
  { key: "media", patterns: [
    /\bmedia\b/i, /\bentertainment\b/i, /\bstreaming\b/i, /\bfilm\b/i,
    /\bmusic\b/i, /\bgame(s|ing)\b/i, /\bpublish/i,
  ] },
  { key: "saas", patterns: [
    /\bSaaS\b/i, /\bsoftware as a service\b/i, /\bplatform\b/i,
    /\bcloud native\b/i, /\bB2B\b/i,
  ] },
  { key: "cybersecurity", patterns: [
    /\bcybersecurity\b/i, /\binformation security\b/i, /\bthreat intelligence\b/i,
    /\bSOC\b/i, /\bSIEM\b/i, /\bEDR\b/i, /\bpentesting\b/i,
  ] },
  { key: "manufacturing", patterns: [
    /\bmanufactur/i, /\bindustrial\b/i, /\bautomotive\b/i, /\bsupply chain\b/i,
  ] },
];

// Small brand → industry override map for companies whose keywords may be
// ambiguous. Only used when the company name matches EXACTLY (lowercase).
const COMPANY_INDUSTRY_HINTS: Record<string, string[]> = {
  ramp:              ["fintech", "financial_services"],
  brex:              ["fintech", "financial_services"],
  mercury:           ["fintech", "financial_services"],
  stripe:            ["fintech", "financial_services"],
  affirm:            ["fintech", "financial_services"],
  chime:             ["fintech", "financial_services"],
  sofi:              ["fintech", "financial_services"],
  robinhood:         ["fintech", "financial_services"],
  coinbase:          ["fintech"],
  monzo:             ["fintech", "financial_services"],
  klarna:            ["fintech", "financial_services"],
  toast:             ["fintech"],
  carta:             ["fintech", "financial_services"],
  plaid:             ["fintech"],
  adyen:             ["fintech", "financial_services"],
  betterment:        ["fintech", "financial_services"],
  wealthfront:       ["fintech", "financial_services"],
  paypal:            ["fintech", "financial_services"],
  nubank:            ["fintech", "financial_services"],
  marqeta:           ["fintech"],
  square:            ["fintech"],
  "cash app":        ["fintech"],
  vanta:             ["saas", "cybersecurity"],
  drata:             ["saas", "cybersecurity"],
  crowdstrike:       ["saas", "cybersecurity"],
  zscaler:           ["saas", "cybersecurity"],
  cloudflare:        ["saas", "cybersecurity"],
  "palo alto networks": ["saas", "cybersecurity"],
  okta:              ["saas", "cybersecurity"],
  dashlane:          ["saas", "cybersecurity"],
  cyberark:          ["saas", "cybersecurity"],
  sentinelone:       ["saas", "cybersecurity"],
  "one medical":     ["healthcare"],
  "oscar health":    ["healthcare"],
  hims:              ["healthcare"],
  ro:                ["healthcare"],
  zocdoc:            ["healthcare"],
  talkspace:         ["healthcare"],
  abridge:           ["healthcare"],
  whoop:             ["healthcare"],
  peloton:           ["retail", "healthcare"],
  "riot games":      ["media"],
  roblox:            ["media"],
  "epic games":      ["media"],
  bcg:               ["consulting"],
  mckinsey:          ["consulting"],
  bain:              ["consulting"],
  deloitte:          ["consulting"],
  accenture:         ["consulting"],
  palantir:          ["consulting"],
  thoughtworks:      ["consulting"],
  tcs:               ["consulting"],
};

export function inferIndustries(company: string, description: string): string[] {
  const c = (company ?? "").toLowerCase().trim();
  const d = (description ?? "").toLowerCase();
  const hits = new Set<string>();

  // 1) Explicit brand hints
  if (COMPANY_INDUSTRY_HINTS[c]) {
    for (const ind of COMPANY_INDUSTRY_HINTS[c]) hits.add(ind);
  }

  // 2) Description keyword scan
  for (const { key, patterns } of INDUSTRY_KEYWORDS) {
    if (patterns.some(p => p.test(d) || p.test(c))) hits.add(key);
  }

  return Array.from(hits);
}

// ── Title normalisation ─────────────────────────────────────────────────
/**
 * Compress a raw title into a comparable canonical form:
 *   "Sr. Director, InfoSec"  → "director of information security"
 *   "VP, Global Sales"       → "vice president of global sales"
 *   "Chief Info Sec Officer" → "chief information security officer"
 */
const ABBREVIATIONS: Array<{ pattern: RegExp; expansion: string }> = [
  { pattern: /\bsr\.?\b/gi,   expansion: "senior" },
  { pattern: /\bjr\.?\b/gi,   expansion: "junior" },
  { pattern: /\bvp\b/gi,      expansion: "vice president" },
  { pattern: /\bsvp\b/gi,     expansion: "senior vice president" },
  { pattern: /\bevp\b/gi,     expansion: "executive vice president" },
  { pattern: /\bmgr\b/gi,     expansion: "manager" },
  { pattern: /\bdir\b/gi,     expansion: "director" },
  { pattern: /\bproj\.?\s*mgr\b/gi, expansion: "project manager" },
  { pattern: /\bpm\b/gi,      expansion: "product manager" },
  { pattern: /\binfosec\b/gi, expansion: "information security" },
  { pattern: /\bciso\b/gi,    expansion: "chief information security officer" },
  { pattern: /\bcto\b/gi,     expansion: "chief technology officer" },
  { pattern: /\bcfo\b/gi,     expansion: "chief financial officer" },
  { pattern: /\bcoo\b/gi,     expansion: "chief operating officer" },
  { pattern: /\bceo\b/gi,     expansion: "chief executive officer" },
  { pattern: /\bcmo\b/gi,     expansion: "chief marketing officer" },
  { pattern: /\bcpo\b/gi,     expansion: "chief product officer" },
  { pattern: /\bcio\b/gi,     expansion: "chief information officer" },
  { pattern: /\bchro\b/gi,    expansion: "chief human resources officer" },
  { pattern: /\bbiso\b/gi,    expansion: "business information security officer" },
];

export function normalizeTitle(title: string): string {
  let t = (title ?? "").toLowerCase().trim();
  if (!t) return "";
  // Replace commas / dashes / colons with spaces so "Director, Security" → "director security"
  t = t.replace(/[,;:—–\-]/g, " ");
  // Expand abbreviations
  for (const { pattern, expansion } of ABBREVIATIONS) {
    t = t.replace(pattern, expansion);
  }
  // Normalise ", of, & " → " of "
  t = t.replace(/\bof\s+/g, "of ");
  // Collapse whitespace
  t = t.replace(/\s+/g, " ").trim();
  return t;
}

// Re-export for consumers that already imported role families here.

// Bridge to Seniority (the profileScorer enum lacks 'unknown' in its main map).
export function tierToSeniority(t: SeniorityTier): Seniority {
  return (t === "unknown" ? "unknown" : t) as Seniority;
}
