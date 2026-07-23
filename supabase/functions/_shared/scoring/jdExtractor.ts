/**
 * fix/jobs-jd-extractor — replaces the naive JD-side extractor.
 *
 * The old `extractJobSkills` in profileScorer.ts sliced from "requirements"
 * onward and split on `,;•·|\n`. It counted RBC's marketing prose
 * ("competitive compensation", "collaborative", "reaching our potential")
 * as missing skills, and included parser fragments like `"nfa standards)"`.
 * This diluted every score.
 *
 * Pipeline:
 *   1. Locate INCLUDE sections (requirements / qualifications / what you'll
 *      need / must have / …). Locate EXCLUDE sections (about us / benefits /
 *      culture / EEO / how to apply). Slice out only the include text.
 *   2. Split on newlines + list punctuation.
 *   3. Fragment hygiene: strip unbalanced parens/brackets, drop candidates
 *      starting with conjunctions ("including ...", "such as ..."), drop
 *      < 2 chars, drop > 6 words, drop bare stopwords.
 *   4. Blocklist: compensation, culture prose, generic filler, legal
 *      boilerplate — all word-bounded.
 *   5. Normalize every survivor through `normalizeSkills` (PR #381) so the
 *      output is canonical, deduped, and speaks the same language as
 *      profile.skills.
 *   6. Cap at TOP_N (default 12) preserving section-position order so the
 *      "gaps" list is readable rather than a firehose.
 *
 * If NO include-section heading is found, the pipeline falls back to
 * full-text extraction but the blocklist still runs — a JD that omits
 * headings shouldn't score 0.
 */

import { normalizeSkills } from "./skillsNormalizer.ts";
// fix/jobs-jd-extractor-location-noise — geography backstop.
import { isPureGeography, stripLocationSentences } from "./geoTokens.ts";

// ── Section headings ─────────────────────────────────────────────────

const INCLUDE_HEADINGS: RegExp[] = [
  /\brequirements?\b/i,
  /\bqualifications?\b/i,
  /\bwhat\s+you(?:'|’)?ll\s+need\b/i,
  /\bwhat\s+we(?:'|’)?re\s+looking\s+for\b/i,
  /\bmust[-\s]?have\b/i,
  /\bnice[-\s]?to[-\s]?have\b/i,
  /\bpreferred\s+qualifications?\b/i,
  /\bskills?\b/i,
  /\bexperience\s+required\b/i,
  /\brequired\s+experience\b/i,
  /\bwho\s+you\s+are\b/i,
  /\babout\s+you\b/i,
  /\byour\s+background\b/i,
  /\bkey\s+(?:responsibilities|skills)\b/i,
  // fix/jobs-jd-extractor-fragment-hygiene — Task 4a. Cohere-shape
  //   JDs used none of the standard headings; the responsibilities
  //   section went unrecognised and its bullets leaked as prose
  //   fragments into missing_skills. These three are universal JD
  //   conventions (not company-specific strings).
  /\bthe\s+opportunity\b/i,
  /\bin\s+this\s+role\s+you\s+will\b/i,
  /\bthe\s+role\b/i,
];

const EXCLUDE_HEADINGS: RegExp[] = [
  /\babout\s+(?:us|the\s+company|the\s+team|the\s+role)\b/i,
  /\bwhy\s+join\b/i,
  /\bbenefits?\b/i,
  /\bcompensation\b/i,
  /\bperks?\b/i,
  /\bwhat\s+we\s+offer\b/i,
  /\bour\s+culture\b/i,
  /\bour\s+values?\b/i,
  /\bdiversity\b/i,
  /\bequal\s+(?:employment|opportunity)\b/i,
  /\bEEO\b/i,
  /\baccommodation(?:s)?\b/i,
  /\bhow\s+to\s+apply\b/i,
  /\bapplication\s+process\b/i,
  // fix/jobs-jd-extractor-fragment-hygiene — Task 4a. Cohere
  //   opens with "Who are we?" — question-headline JDs need this
  //   to route the intro paragraph into the exclude bucket.
  /\bwho\s+are\s+we\b/i,
  /\bwho\s+we\s+are\b/i,
];

// ── Blocklist ─────────────────────────────────────────────────────────

const BLOCK_SUBSTRINGS: string[] = [
  // Compensation / benefits
  "competitive compensation", "competitive salary", "competitive pay",
  "commissions", "commission structure",
  "bonus", "signing bonus", "equity", "stock options",
  "401k", "401(k)", "rrsp",
  "benefits", "health insurance", "dental", "vision", "insurance",
  "pto", "paid time off", "vacation", "sick leave", "parental leave",
  "wellness", "gym", "fitness",
  // Culture prose
  "collaborative", "progressive", "inclusive", "passionate",
  "dynamic", "fast-paced", "fast paced",
  "team player", "self-starter", "self starter",
  "results-driven", "results driven", "results-oriented", "results oriented",
  "detail-oriented", "detail oriented",
  "problem solver", "problem-solver", "problem solving skills",
  "reaching our potential", "reach our potential",
  "make an impact", "make a difference",
  "world-class", "world class",
  "cutting edge", "cutting-edge",
  "innovative environment",
  "great place to work",
  // Legal boilerplate
  "equal opportunity", "equal employment",
  "background check", "criminal background",
  "work authorization", "authorized to work",
  "sponsorship", "visa sponsorship",
];

// Words a candidate must NEVER start with — pure conjunction/gerund glue.
const CONJUNCTION_PREFIXES: string[] = [
  "and ", "or ", "but ", "with ",
  "including ", "such as ", "for example ", "e.g. ", "e.g ",
  "as well as ",
];

// Context prefixes to STRIP — "experience with X" → "X". These aren't
// candidates to drop (their tail IS a skill); they're wrapper phrases we
// need to peel back before alias lookup.
const CONTEXT_PREFIX_STRIPS: RegExp[] = [
  /^(?:deep\s+|solid\s+|strong\s+|proven\s+|demonstrated\s+|hands[-\s]?on\s+|working\s+|excellent\s+|great\s+|good\s+|extensive\s+|significant\s+|prior\s+|relevant\s+)?(?:experience|expertise|familiarity|proficiency|understanding|knowledge|background|competency|competence|skilled|comfort|comfortable|fluency|fluent|track\s+record)\s+(?:with|of|in|around)\s+/i,
  /^(?:ability\s+to|able\s+to|capable\s+of)\s+/i,
  /^(?:strong|solid|proven|demonstrated|excellent|great|good|working|extensive|significant|deep)\s+/i,
];

// Minimum index of canonical → aliases used for the prose-to-alias rescue.
// Kept small on purpose — the full alias table lives in skillsNormalizer.ts.
// Any canonical missing here just means the prose phrase falls through
// unchanged (still gets normalizeSkills-canonicalized downstream via its
// alias table if the phrase itself matches).
const ALIAS_GROUPS_INDEX: Array<{ canonical: string; aliases: string[] }> = [
  { canonical: "NIST CSF",       aliases: ["nist csf", "nist csf 2.0", "cybersecurity framework"] },
  { canonical: "NIST 800-53",    aliases: ["nist 800-53", "nist sp 800-53", "sp 800-53", "800-53"] },
  { canonical: "ISO 27001",      aliases: ["iso 27001", "iso/iec 27001", "iso27001"] },
  { canonical: "SOC 2",          aliases: ["soc 2", "soc2", "soc ii"] },
  { canonical: "PCI DSS",        aliases: ["pci dss", "pci-dss", "pci"] },
  { canonical: "SIEM",           aliases: ["siem"] },
  { canonical: "IAM",            aliases: ["iam"] },
  { canonical: "GRC",            aliases: ["grc"] },
  { canonical: "Incident Response",   aliases: ["incident response"] },
  { canonical: "Tabletop Exercises",  aliases: ["tabletop exercises", "tabletops"] },
  { canonical: "Vulnerability Management", aliases: ["vulnerability management"] },
  { canonical: "Threat Intelligence", aliases: ["threat intelligence"] },
  { canonical: "Zero Trust",     aliases: ["zero trust"] },
  { canonical: "Cloud Security", aliases: ["cloud security"] },
  { canonical: "BISO",           aliases: ["biso", "business information security officer"] },
  { canonical: "CISO",           aliases: ["ciso", "chief information security officer"] },
  { canonical: "HIPAA",          aliases: ["hipaa"] },
  { canonical: "GDPR",           aliases: ["gdpr"] },
  { canonical: "SOX",            aliases: ["sox", "sarbanes-oxley"] },
  { canonical: "GAAP",           aliases: ["gaap"] },
  { canonical: "FP&A",           aliases: ["fp&a", "fpa", "financial planning and analysis"] },
  { canonical: "M&A",            aliases: ["m&a", "mergers and acquisitions"] },
  { canonical: "P&L",            aliases: ["p&l", "pnl", "profit and loss"] },
  { canonical: "EMR",            aliases: ["emr", "ehr", "electronic health records"] },
  { canonical: "RN",             aliases: ["rn", "registered nurse"] },
  { canonical: "BLS",            aliases: ["bls", "basic life support"] },
  { canonical: "SEO",            aliases: ["seo", "search engine optimization"] },
  { canonical: "SEM",            aliases: ["sem", "search engine marketing"] },
  { canonical: "CRM",            aliases: ["crm", "customer relationship management"] },
  { canonical: "GTM",            aliases: ["gtm", "go-to-market", "go to market"] },
  { canonical: "PPC",            aliases: ["ppc", "pay-per-click", "pay per click"] },
  { canonical: "LTV",            aliases: ["ltv", "lifetime value"] },
  { canonical: "CAC",            aliases: ["cac", "customer acquisition cost"] },
  { canonical: "ROAS",           aliases: ["roas"] },
  { canonical: "Kubernetes",     aliases: ["kubernetes", "k8s"] },
  { canonical: "AWS",            aliases: ["aws", "amazon web services"] },
  { canonical: "Azure",          aliases: ["azure"] },
  { canonical: "GCP",            aliases: ["gcp", "google cloud"] },
  { canonical: "CI/CD",          aliases: ["ci/cd", "cicd", "continuous integration"] },
  { canonical: "DevOps",         aliases: ["devops"] },
  { canonical: "DevSecOps",      aliases: ["devsecops"] },
  { canonical: "TCP/IP",         aliases: ["tcp/ip"] },
  { canonical: "TypeScript",     aliases: ["typescript", "ts"] },
  { canonical: "JavaScript",     aliases: ["javascript", "js"] },
  { canonical: "Python",         aliases: ["python"] },
  { canonical: "Java",           aliases: ["java"] },
  { canonical: "SQL",            aliases: ["sql"] },
  { canonical: "PostgreSQL",     aliases: ["postgresql", "postgres"] },
  { canonical: "Docker",         aliases: ["docker"] },
  { canonical: "Terraform",      aliases: ["terraform"] },
  { canonical: "OCC",            aliases: ["occ"] },
  { canonical: "FFIEC",          aliases: ["ffiec"] },
  { canonical: "GLBA",           aliases: ["glba"] },
  { canonical: "NYDFS",          aliases: ["nydfs"] },
  { canonical: "NFA",            aliases: ["nfa"] },
  { canonical: "Policy Development",  aliases: ["policy development"] },
  { canonical: "Risk Assessment",     aliases: ["risk assessment"] },
  { canonical: "Business Continuity", aliases: ["business continuity"] },
  { canonical: "Disaster Recovery",   aliases: ["disaster recovery"] },
];

// Bare stopwordish tokens that survive comma-splitting but aren't skills.
const BARE_STOPWORDS = new Set<string>([
  "it", "the", "and", "or", "for", "with", "in", "on",
  "of", "to", "as", "by", "at", "an", "a",
  "you", "your", "we", "our", "us", "they", "them",
  "risk",   // borderline — filtered here; if the JD says "Risk Management" the compound survives
  "team", "role", "job", "work", "years", "year",
  "ability", "skill", "skills",
  "strong", "excellent", "great", "good",
]);

// ── Public API ────────────────────────────────────────────────────────

export interface ExtractOptions {
  /** Cap on how many canonical skills are returned. Default 12. */
  cap?: number;
  /** Skip blocklist (for testing extraction proper). Default false. */
  skipBlocklist?: boolean;
}

/**
 * Extract deduped canonical skills from a JD text. Every returned string
 * has already been run through the skillsNormalizer, so pairwise
 * comparison with profile.skills is apples-to-apples.
 */
export function extractJDSkills(text: string, opts: ExtractOptions = {}): string[] {
  const cap = opts.cap ?? 25;
  if (!text || typeof text !== "string") return [];

  // fix/jobs-jd-extractor — inline heading normalisation. Many ingested JDs
  //   (Ashby, some Workday, older Greenhouse) come as HTML-stripped walls
  //   of text where "RESPONSIBILITIES:" or "Qualifications:" appear inline
  //   with no preceding newline. Insert `\n\n` before each known heading
  //   word that is followed by a colon, so line-based heading detection
  //   sees them as their own line.
  const HEADING_WORDS = [
    "REQUIREMENTS", "Requirements", "requirements",
    "QUALIFICATIONS", "Qualifications", "qualifications",
    "RESPONSIBILITIES", "Responsibilities", "responsibilities",
    "WHO YOU ARE", "Who You Are",
    "ABOUT YOU", "About You",
    "YOUR BACKGROUND", "Your Background",
    "MUST HAVE", "Must Have", "MUST HAVES",
    "NICE TO HAVE", "Nice to Have",
    "PREFERRED", "Preferred",
    "KEY SKILLS", "Key Skills",
    "SKILLS", "Skills",
    "ABOUT US", "About Us",
    "BENEFITS", "Benefits",
    "COMPENSATION", "Compensation",
    "WHAT WE OFFER", "What We Offer",
    "OUR CULTURE", "Our Culture",
    "EEO", "Equal Opportunity",
    "HOW TO APPLY", "How to Apply",
  ];
  let preprocessed = text;
  for (const w of HEADING_WORDS) {
    const esc = w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`([^\n])\\s+${esc}\\s*:`, "g");
    preprocessed = preprocessed.replace(re, `$1\n\n${w}:\n`);
  }
  // fix/jobs-jd-extractor-location-noise — strip "offices in …",
  //   "headquartered in …", "hubs in …", "we hire in …" sentences
  //   BEFORE bullet reflow + section slicing. Location prose leaks
  //   city / country / state names into missing_skills otherwise
  //   (see Cohere CISO capture 2026-07-20 for the motivating case).
  preprocessed = stripLocationSentences(preprocessed);

  // Insert a newline before every " - " bullet marker so bullet items
  // become their own lines. Common in HTML-stripped Ashby / Workday JDs.
  preprocessed = preprocessed.replace(/([^\n])\s+-\s+/g, "$1\n- ");

  // 1. Locate section slices.
  const slices = findIncludeSlices(preprocessed);

  // 2. Split slices into candidate chunks.
  const rawCandidates: string[] = [];
  for (const slice of slices) {
    for (const chunk of splitIntoChunks(slice)) {
      if (chunk.length > 0) rawCandidates.push(chunk);
    }
  }

  // 3. Two-pass extraction:
  //    Pass A (alias rescue FIRST on raw chunks) — scan every chunk for
  //      embedded canonical aliases and pull them out, regardless of the
  //      chunk's word count. This catches "You bring 5+ years with strong
  //      SEO and SEM chops" → ["SEO", "SEM"] even though the chunk itself
  //      is a 15-word sentence we'd otherwise drop for length.
  //    Pass B (fragment hygiene) — for chunks with NO embedded aliases,
  //      apply the traditional clean pipeline (context-strip, word cap,
  //      blocklist, bare-stopwords). Unknown 1-word survivors must be
  //      title-case or acronym-shaped ("chops"/"the"/"an" drop;
  //      "TypeScript"/"HIPAA" pass).
  const rescued: string[] = [];
  for (const raw of rawCandidates) {
    const embedded = findEmbeddedAliases(raw);
    if (embedded.length > 0) {
      rescued.push(...embedded);
      continue;
    }
    const c = clean(raw);
    if (!c) continue;
    if (!opts.skipBlocklist && isBlocked(c)) continue;
    const words = c.split(/\s+/).filter(Boolean);
    if (words.length === 1) {
      const w = words[0];
      const looksLikeAcronym = /^[A-Z0-9+#/&\-]{2,}$/.test(w);
      const looksLikeTitle   = /^[A-Z][a-z]+/.test(w);
      if (!looksLikeAcronym && !looksLikeTitle) continue;
    }
    rescued.push(c);
  }

  // 4. Normalize through the shared pipeline and dedupe.
  // 5. Normalize through the shared pipeline and dedupe.
  const normalized = normalizeSkills(rescued);
  // Preserve section-position order — normalizeSkills already dedupes and
  // is stable. Trim to cap.
  return normalized.slice(0, cap);
}

/**
 * Scan a prose phrase for embedded alias hits. Returns the canonical
 * forms of every alias that appears as a word-bounded substring. Empty
 * array when nothing hits — caller keeps the original phrase.
 */
function findEmbeddedAliases(phrase: string): string[] {
  const t = phrase.toLowerCase();
  const hits: string[] = [];
  for (const g of ALIAS_GROUPS_INDEX) {
    for (const alias of g.aliases) {
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`(?:^|[^A-Za-z0-9+#])${escaped}(?:$|[^A-Za-z0-9+#])`, "i");
      if (re.test(t)) {
        if (!hits.includes(g.canonical)) hits.push(g.canonical);
        break;
      }
    }
  }
  return hits;
}

// ── Internals ─────────────────────────────────────────────────────────

/**
 * Find the text slices that live inside INCLUDE-heading sections and
 * NOT inside EXCLUDE-heading sections.
 *
 * A "section" is bounded by a heading line and the next heading line
 * (of any type). Falls back to the whole text if no include headings
 * are found, so headingless JDs still yield candidates.
 */
function findIncludeSlices(text: string): string[] {
  const lines = text.split(/\r?\n/);
  // Identify heading lines: short lines that match any include or exclude
  // pattern, or contain a colon-terminated section label.
  interface Heading { line: number; kind: "include" | "exclude"; label: string }
  const headings: Heading[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    // Headings are short. Reject lines that are clearly body text:
    //   * > 80 characters
    //   * > 5 words (bullet content typically is)
    //   * contain digits (bullet content with "5+ years" etc.)
    if (line.length > 80) continue;
    if (line.split(/\s+/).filter(Boolean).length > 5) continue;
    if (/\d/.test(line)) continue;
    for (const re of INCLUDE_HEADINGS) {
      if (re.test(line)) { headings.push({ line: i, kind: "include", label: line }); break; }
    }
    // A line can only be one kind, but exclude wins over include when both match
    // ("about us" contains "about", "our culture" doesn't match include). We
    // check exclude AFTER include on purpose so the last matching wins here.
    for (const re of EXCLUDE_HEADINGS) {
      if (re.test(line)) {
        // Replace the include-marked heading if the exclude pattern also hit.
        const existing = headings.find(h => h.line === i);
        if (existing) existing.kind = "exclude";
        else headings.push({ line: i, kind: "exclude", label: line });
        break;
      }
    }
  }

  const hasInclude = headings.some(h => h.kind === "include");
  const hasExclude = headings.some(h => h.kind === "exclude");
  const slices: string[] = [];

  // Case A: at least one include heading → return include slices ONLY.
  if (hasInclude) {
    for (let i = 0; i < headings.length; i++) {
      if (headings[i].kind !== "include") continue;
      const startLine = headings[i].line + 1;
      const endLine = i + 1 < headings.length ? headings[i + 1].line : lines.length;
      if (endLine > startLine) {
        slices.push(lines.slice(startLine, endLine).join("\n"));
      }
    }
    return slices;
  }

  // Case B: no include headings but exclude headings exist → return
  //   everything BUT the exclude sections. Prevents "SEO" from an
  //   "About Us" blob from leaking when the JD's only heading is
  //   exclude-flavored.
  if (hasExclude) {
    let cursor = 0;
    for (let i = 0; i < headings.length; i++) {
      const h = headings[i];
      // Content from cursor up to this heading is fair game.
      if (h.line > cursor) {
        slices.push(lines.slice(cursor, h.line).join("\n"));
      }
      // Skip the excluded section.
      const endLine = i + 1 < headings.length ? headings[i + 1].line : lines.length;
      cursor = endLine;
    }
    if (cursor < lines.length) {
      slices.push(lines.slice(cursor).join("\n"));
    }
    return slices;
  }

  // Case C: no headings at all → fall back to whole text.
  return [text];
}

/**
 * Split a text slice into candidate chunks. Uses list punctuation +
 * newlines as the primary separator. Bullet markers and leading
 * whitespace are trimmed by `clean()`.
 */
function splitIntoChunks(slice: string): string[] {
  return slice
    .split(/[\n\r]|[·•|;]|\s{2,}[-*]\s|(?:^|\n)[-*]\s/)
    .flatMap(part => part.split(/(?<=[a-z])(?:\.\s+|;\s+)/i))
    .flatMap(part =>
      // Comma-splitting is aggressive — many skills come from
      // "Python, AWS, Kubernetes, Terraform" style lists.
      part.split(/,\s+/),
    )
    .map(s => s.trim());
}

/**
 * Fragment hygiene: strip trailing punctuation, unbalanced parens,
 * conjunction prefixes, empty/too-long candidates, bare stopwords.
 */
function clean(raw: string): string {
  let s = raw.trim()
    // Drop leading bullet markers and quotes.
    .replace(/^[-*•·—–>\s"'`]+/, "")
    .replace(/[\s"'`.]+$/, "")
    .trim();

  // Strip context-prefix wrappers ("experience with SIEM" → "SIEM").
  // Apply repeatedly so "strong experience with SIEM" also collapses.
  for (let guard = 0; guard < 3; guard++) {
    let changed = false;
    for (const re of CONTEXT_PREFIX_STRIPS) {
      const next = s.replace(re, "");
      if (next !== s) { s = next; changed = true; }
    }
    if (!changed) break;
  }
  s = s.trim();

  // Balance parens/brackets — drop unmatched trailing ones.
  s = balancePairs(s);

  if (!s || s.length < 2) return "";
  const lower = s.toLowerCase();

  // Conjunction/gerund prefixes are pure glue — never a skill.
  for (const p of CONJUNCTION_PREFIXES) {
    if (lower.startsWith(p)) return "";
  }

  // > 6 words is a sentence fragment, not a skill.
  const wordCount = s.split(/\s+/).filter(Boolean).length;
  if (wordCount > 6) return "";

  // fix/jobs-seniority-wiring — generic prose patterns:
  //   (A) First-person-plural culture prose. "We care about each other",
  //       "our mission", "us as a team" — starts with we/our/us +
  //       verb-ish word. Shape rule, not a keyword list.
  //   (B) Prepositional-lead fragments. "at the management level",
  //       "in the enterprise", "of our approach" — bare preposition
  //       start followed by an article. Never a skill.
  // fix/jobs-jd-extractor-fragment-hygiene — Task 4a. All structural,
  //   no company-name literals, no dynamic injection. Amir's spec: "purely
  //   structural detection". These fire AFTER the ≤6-word cap so a real
  //   short skill like "IAM" or "Zero Trust" is never even considered.
  //
  // (A) Subject-pronoun starts. Extended from the pre-#394 "we/our/us"
  //     rule to add "they" and "the company" — same idea, wider net.
  //     "We build models", "Our mission", "They deploy", "The company is"
  //     → all body prose, never a skill.
  if (/^(?:we|our|us|ours|they|the\s+company)\s+\w/i.test(lower)) return "";
  //
  // (B) Prepositional-lead fragments — pre-existing rule, kept as-is.
  if (/^(?:at|in|on|of|from|by|for|to)\s+(?:the|a|an|our|your)\s+/i.test(lower)) return "";
  //
  // (C) Second-person imperatives / statements. "You will build the
  //     playbook", "You'll partner with…", "You are responsible" — always
  //     JD prose, never a skill.
  if (/^(?:you\s+will|you'll|you\s+are|you\s+know|you\s+bring)\b/i.test(lower)) return "";
  //
  // (D) Gerund-verb starts. Job-description bullets like "ensuring
  //     resilient", "representing the CISO", "leading strategy across…"
  //     have a distinctive shape: -ing verb at position 0. This list is
  //     the ~40 verbs that recur in JD action-item bullets. Structural,
  //     not company-specific.
  if (/^(?:ensuring|representing|leading|building|managing|driving|working|delivering|creating|developing|deploying|implementing|maintaining|architecting|designing|owning|scaling|supporting|enabling|coordinating|collaborating|partnering|reporting|fostering|mitigating|assessing|identifying|shaping|executing|planning|conducting|monitoring|reviewing|analyzing|advocating|educating|mentoring|hiring|recruiting|guiding|championing|overseeing)\s+\w/i.test(lower)) return "";
  //
  // (E) Imperative verb + preposition/article. "Build a Modern Risk",
  //     "Lead Through Influence", "Drive the strategy". The article /
  //     preposition after the verb marks it as a sentence, not a title.
  //     Bare "Lead Engineer" (title) doesn't match because "Engineer" is
  //     not in the follower list.
  if (/^(?:lead|build|manage|drive|own|ensure|represent|foster|deliver|create|develop|design|implement|maintain|architect|scale|support|enable|coordinate|monitor|report|advocate|mentor|partner|collaborate|guide|champion|oversee|shape|execute|conduct|review|analyze|advise|educate|train|train)\s+(?:the|a|an|through|for|to|our|your|via|in|on|of|with|across|by)\b/i.test(lower)) return "";
  //
  // (E-bis) Imperative verb + noun + preposition — e.g. "Lead Compliance
  //     across all lines", "Build Trust with customers", "Drive Growth
  //     through automation". The trailing preposition is what marks it
  //     as a sentence rather than a compound noun-title. 2-word titles
  //     like "Lead Engineer" don't match (no 3rd token, no prep).
  if (/^(?:lead|build|manage|drive|own|ensure|represent|foster|deliver|create|develop|design|implement|maintain|architect|scale|support|enable|coordinate|monitor|report|advocate|mentor|partner|collaborate|guide|champion|oversee|shape|execute|conduct|review|analyze|advise|educate|train)\s+\S+\s+(?:across|through|via|for|with|by|from|around|between|during|throughout|within|per|among|alongside|in|on|of|to|at)\b/i.test(lower)) return "";
  //
  // (F) Heading-with-trailing-colon fragments — "In this role you will:",
  //     "Build a Modern Risk, Governance & Compliance Program:", "Skills:".
  //     A bare-colon suffix is ALWAYS a heading, never a skill. Real
  //     skill acronyms don't end in colons.
  if (/:\s*$/.test(s)) return "";

  // Bare stopwords.
  if (BARE_STOPWORDS.has(lower)) return "";

  // Sanity: drop candidates that are purely numeric or years-of-experience
  // phrases ("5+ years", "10+ years experience", "5-7 years").
  if (/^\d+\s*[-\+]?\s*\d*\s*(?:years?|yrs?)\b/i.test(s)) return "";

  // fix/jobs-jd-extractor-location-noise — geography backstop.
  //   Kills pure-geo candidates ("New York City", "Montreal", "Seoul")
  //   that survived the paragraph-level strip. Compound candidates
  //   like "New York SHIELD Act" or "AWS Seoul region" survive because
  //   they contain at least one non-geo token — see geoTokens.ts.
  if (isPureGeography(s)) return "";

  return s;
}

function balancePairs(s: string): string {
  // Count parens; if there's more closing than opening, trim trailing ones.
  let open = 0, close = 0;
  for (const ch of s) {
    if (ch === "(") open++;
    else if (ch === ")") close++;
  }
  if (close > open) {
    let toDrop = close - open;
    s = s.replace(/\)+$/, m => m.slice(0, Math.max(0, m.length - toDrop)));
  }
  if (open > close) {
    let toDrop = open - close;
    s = s.replace(/^\(+/, m => m.slice(0, Math.max(0, m.length - toDrop)));
  }
  // Same for brackets.
  return s.trim();
}

/**
 * Is this candidate on the blocklist? Word-bounded, case-insensitive.
 */
function isBlocked(candidate: string): boolean {
  const lower = candidate.toLowerCase();
  for (const b of BLOCK_SUBSTRINGS) {
    // Simple substring check is fine here — the blocklist entries are
    // deliberately specific phrases, not single tokens that might live
    // inside a real skill.
    if (lower.includes(b)) return true;
  }
  return false;
}
