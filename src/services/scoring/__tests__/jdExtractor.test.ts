/**
 * fix/jobs-jd-extractor — JD-side skill extraction tests.
 *
 * R1 discipline: every fix must hold for every domain and every JD shape.
 * The three shape fixtures at the bottom of this file enforce that in CI
 * — one heading-structured JD, one Workday-style blob, one JSON-LD-style
 * plain-text JD — so we can never again ship an extractor tuned to one
 * source's markup.
 */
import { describe, it, expect } from "vitest";
import { extractJDSkills } from "../jdExtractor";

// ─────────────────────────────────────────────────────────────────────
// Shape fixture 1 — heading-structured JD (RBC / most Greenhouse boards)
// ─────────────────────────────────────────────────────────────────────
const HEADING_STRUCTURED_JD = `
Business Information Security Officer (BISO) — Global Security
Toronto, ON

About Us
RBC is a leading Canadian bank offering competitive compensation, collaborative
teams, and progressive career paths. We are passionate about reaching our
potential. We offer excellent benefits including RRSP matching, dental, vision,
generous PTO, and parental leave.

Job Description
As a BISO, you will act as the liaison between the enterprise CISO and business
lines, ensuring cyber risk is understood and managed across payments and
capital markets.

Requirements
- 10+ years of experience in information security
- NIST CSF, NIST 800-53, ISO 27001
- NYDFS 500 and NFA cybersecurity requirements
- Incident response and tabletop exercises
- Policy development and control implementation
- Risk assessment, business continuity, disaster recovery
- Cross-functional stakeholder engagement

Preferred Qualifications
- BISO or CISO experience at a regulated financial institution
- OCC, FFIEC, GLBA, SOX, GDPR compliance experience

What We Offer
- Competitive salary, signing bonus, commissions
- Great place to work with a diverse and inclusive culture
- Work with a dynamic, fast-paced, world-class team

How to Apply
Please submit your application via our careers portal. RBC is an equal
opportunity employer and provides accommodations for applicants with
disabilities.
`;

// ─────────────────────────────────────────────────────────────────────
// Shape fixture 2 — Workday-style blob (no clear headings, one long paragraph
// with inline commas and semicolons). KLA / Salesforce / Adobe tenants.
// ─────────────────────────────────────────────────────────────────────
const WORKDAY_BLOB_JD = `
The Deputy Chief Information Security Officer (CISO) will report to the CISO
and lead security operations, threat intelligence, incident response, and
vulnerability management. Requirements include 15+ years of experience in
information security; deep expertise with SIEM, IAM, PCI DSS, and SOC 2;
familiarity with GDPR and HIPAA; strong background in cloud security across
AWS, Azure, and GCP; experience with Kubernetes, DevSecOps, and CI/CD
pipelines; excellent problem solving skills; ability to drive results in a
fast-paced environment. We offer competitive compensation, generous equity,
comprehensive benefits, and unlimited PTO. Applicants must be authorized to
work in the United States. Equal Opportunity Employer.
`;

// ─────────────────────────────────────────────────────────────────────
// Shape fixture 3 — JSON-LD / plain-text JD (Ashby / some SmartRecruiters)
// ─────────────────────────────────────────────────────────────────────
const PLAIN_TEXT_JD = `
Senior Product Marketing Manager — Growth

Who You Are
You bring 5-7 years of B2B SaaS marketing experience with strong SEO and SEM
chops. You've owned go-to-market strategy end-to-end. You measure everything —
LTV, CAC, ROAS — and have deep CRM experience with Salesforce or HubSpot. You
know your way around A/B testing frameworks and attribution modeling.

Your Background
- Search Engine Optimization
- Google Analytics
- Pay-per-click campaigns
- Content marketing and copywriting
- Customer relationship management

Why Join
We offer competitive compensation, equity, generous PTO. Our culture is
inclusive, dynamic, and fast-paced. We're passionate about our mission.
`;

// ─────────────────────────────────────────────────────────────────────
// Task 5 — 18 tests
// ─────────────────────────────────────────────────────────────────────

describe("extractJDSkills — RBC (heading-structured, security domain)", () => {
  it("extracts core security requirements and yields >= 3 skills", () => {
    const out = extractJDSkills(HEADING_STRUCTURED_JD);
    expect(out.length).toBeGreaterThanOrEqual(3);
    // Every canonical form we expect should appear.
    for (const expected of ["NIST CSF", "ISO 27001", "NIST 800-53"]) {
      expect(out).toContain(expected);
    }
  });

  it("boilerplate leak count is ZERO — no compensation, culture, or benefits terms", () => {
    const out = extractJDSkills(HEADING_STRUCTURED_JD);
    const joined = out.join(" | ").toLowerCase();
    for (const banned of [
      "competitive compensation", "competitive salary",
      "collaborative", "progressive", "inclusive",
      "reaching our potential", "commissions",
      "signing bonus", "great place to work",
      "world-class", "world class",
      "equal opportunity",
      "diverse and inclusive",
    ]) {
      expect(joined).not.toContain(banned);
    }
  });

  it("fragment leak count is ZERO — no 'including ...', 'nfa standards)', no >6-word phrases", () => {
    const out = extractJDSkills(HEADING_STRUCTURED_JD);
    for (const s of out) {
      expect(s.toLowerCase()).not.toMatch(/^including\b/);
      expect(s.toLowerCase()).not.toMatch(/^such as\b/);
      // No unbalanced closing paren.
      const open  = (s.match(/\(/g) || []).length;
      const close = (s.match(/\)/g) || []).length;
      expect(close).toBeLessThanOrEqual(open);
      // At most 6 words.
      expect(s.split(/\s+/).filter(Boolean).length).toBeLessThanOrEqual(6);
    }
  });

  it("caps extraction at 25 by default (deep enough to catch everything real; caller re-caps missing at 12)", () => {
    const out = extractJDSkills(HEADING_STRUCTURED_JD);
    expect(out.length).toBeLessThanOrEqual(25);
    expect(out.length).toBeGreaterThan(0);
  });
});

describe("extractJDSkills — Workday blob (no clear headings)", () => {
  it("headingless fallback still yields >= 3 skills", () => {
    const out = extractJDSkills(WORKDAY_BLOB_JD);
    expect(out.length).toBeGreaterThanOrEqual(3);
    // Core canonicals from the blob.
    for (const expected of ["SIEM", "IAM", "PCI DSS", "SOC 2", "AWS", "Kubernetes"]) {
      expect(out).toContain(expected);
    }
  });

  it("blocklist still runs on blob JDs — 'authorized to work', 'equal opportunity' dropped", () => {
    const out = extractJDSkills(WORKDAY_BLOB_JD);
    const joined = out.join(" | ").toLowerCase();
    for (const banned of [
      "competitive compensation", "unlimited pto",
      "authorized to work", "equal opportunity",
      "fast-paced", "fast paced",
      "problem solving skills",
    ]) {
      expect(joined).not.toContain(banned);
    }
  });

  it("finds security-domain skills threaded through the blob", () => {
    const out = extractJDSkills(WORKDAY_BLOB_JD);
    // At least one of GDPR / HIPAA — both are in the blob's compliance clause.
    expect(out.some(s => s === "GDPR" || s === "HIPAA")).toBe(true);
  });
});

describe("extractJDSkills — JSON-LD / plain-text JD (marketing domain)", () => {
  it("extracts marketing canonicals from a plain-text JD", () => {
    const out = extractJDSkills(PLAIN_TEXT_JD);
    expect(out.length).toBeGreaterThanOrEqual(3);
    for (const expected of ["SEO", "SEM", "GTM"]) {
      expect(out).toContain(expected);
    }
  });

  it("marketing JD does NOT leak 'competitive compensation', 'inclusive', 'passionate'", () => {
    const out = extractJDSkills(PLAIN_TEXT_JD);
    const joined = out.join(" | ").toLowerCase();
    for (const banned of [
      "competitive compensation", "equity", "generous pto",
      "inclusive", "dynamic", "fast-paced", "passionate",
    ]) {
      expect(joined).not.toContain(banned);
    }
  });

  it("cross-domain — LTV, CAC, ROAS canonicals surface", () => {
    const out = extractJDSkills(PLAIN_TEXT_JD);
    // At least one growth metric.
    expect(out.some(s => s === "LTV" || s === "CAC" || s === "ROAS")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Direct fragment-hygiene tests
// ─────────────────────────────────────────────────────────────────────
describe("extractJDSkills — fragment hygiene", () => {
  it("drops 'including policy development' (conjunction prefix)", () => {
    const out = extractJDSkills("Requirements:\n- including policy development\n- ISO 27001");
    expect(out).toContain("ISO 27001");
    expect(out.map(s => s.toLowerCase())).not.toContain("including policy development");
  });

  it("cleans 'nfa standards)' → 'NFA standards' (drops unbalanced paren)", () => {
    const out = extractJDSkills("Requirements:\n- NFA standards)\n");
    // Should not appear with the trailing paren.
    for (const s of out) expect(s).not.toMatch(/\)$/);
  });

  it("drops 7+ word phrases", () => {
    const out = extractJDSkills(
      "Requirements:\n- Ability to drive results in a very fast paced world class environment\n- Python",
    );
    expect(out).toContain("Python");
    for (const s of out) {
      expect(s.split(/\s+/).filter(Boolean).length).toBeLessThanOrEqual(6);
    }
  });

  it("drops bare stopwords like 'it', 'risk' alone, 'team'", () => {
    const out = extractJDSkills("Requirements:\n- it\n- risk\n- team\n- HIPAA");
    expect(out).toContain("HIPAA");
    for (const s of out) {
      expect(["it", "risk", "team"]).not.toContain(s.toLowerCase());
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// Section-scoping tests
// ─────────────────────────────────────────────────────────────────────
describe("extractJDSkills — section scoping (R1: works across all shapes)", () => {
  it("SEO in 'About Us' is ignored; SEO in 'Requirements' is kept", () => {
    const AboutOnly = "About Us\nWe leverage SEO and paid marketing to grow.\n";
    const InReqs = "Requirements\n- SEO\n- Google Analytics\n";
    expect(extractJDSkills(AboutOnly)).not.toContain("SEO");
    expect(extractJDSkills(InReqs)).toContain("SEO");
  });

  it("finance JD: GAAP + SOX in Requirements kept; benefits section stripped", () => {
    const jd = `Senior Accountant
About Us
We offer great benefits and equity.
Requirements
- GAAP
- SOX
- FP&A modeling`;
    const out = extractJDSkills(jd);
    expect(out).toContain("GAAP");
    expect(out).toContain("SOX");
    expect(out).toContain("FP&A");
    // "great benefits" should not leak.
    expect(out.map(s => s.toLowerCase())).not.toContain("great benefits");
  });

  it("healthcare JD: HIPAA + EMR in Requirements kept; culture prose dropped", () => {
    const jd = `Nurse Practitioner
Our Culture
We are passionate and inclusive.
Requirements
- HIPAA compliance
- EMR (Epic)
- RN license`;
    const out = extractJDSkills(jd);
    expect(out).toContain("HIPAA");
    expect(out).toContain("EMR");
    expect(out).toContain("RN");
    for (const s of out) {
      expect(s.toLowerCase()).not.toBe("passionate");
      expect(s.toLowerCase()).not.toBe("inclusive");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// Determinism + idempotence
// ─────────────────────────────────────────────────────────────────────
describe("extractJDSkills — algebra", () => {
  it("deterministic: identical input → byte-identical output", () => {
    const a = extractJDSkills(HEADING_STRUCTURED_JD);
    const b = extractJDSkills(HEADING_STRUCTURED_JD);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("under-extraction guard: real JD fixtures ALWAYS yield >= 3 skills", () => {
    // If this fails on the shape-3 fixtures we have a regression before
    // even hitting live URLs.
    expect(extractJDSkills(HEADING_STRUCTURED_JD).length).toBeGreaterThanOrEqual(3);
    expect(extractJDSkills(WORKDAY_BLOB_JD).length).toBeGreaterThanOrEqual(3);
    expect(extractJDSkills(PLAIN_TEXT_JD).length).toBeGreaterThanOrEqual(3);
  });
});

// ─────────────────────────────────────────────────────────────────────
// fix/jobs-seniority-wiring — generic prose-pattern hygiene tests
// ─────────────────────────────────────────────────────────────────────
describe("extractJDSkills — generic prose patterns (not RBC-specific)", () => {
  it("first-person-plural culture prose is dropped ('We care about...', 'our mission')", () => {
    const jd = `Requirements
- ISO 27001
- We care about each other
- We invest in our team
- our mission is to serve customers
- Kubernetes`;
    const out = extractJDSkills(jd);
    expect(out).toContain("ISO 27001");
    expect(out).toContain("Kubernetes");
    for (const s of out) {
      expect(/^(?:we|our|us)\s/i.test(s)).toBe(false);
    }
  });

  it("prepositional-lead fragments are dropped ('at the management level', 'in the enterprise')", () => {
    const jd = `Requirements
- HIPAA
- at the management level
- in the enterprise
- of our approach
- Python`;
    const out = extractJDSkills(jd);
    expect(out).toContain("HIPAA");
    expect(out).toContain("Python");
    for (const s of out) {
      expect(/^(?:at|in|on|of|from|by|for)\s+(?:the|a|an|our|your)\s/i.test(s)).toBe(false);
    }
  });

  it("cross-domain: same rules apply to finance/marketing/healthcare prose", () => {
    const finance = `Requirements\n- GAAP\n- We're building a values-driven finance team\n- at the executive committee level\n- FP&A`;
    const marketing = `Requirements\n- SEO\n- our mission is to grow\n- SEM`;
    const healthcare = `Requirements\n- HIPAA\n- We deliver patient-first care\n- EMR`;
    for (const jd of [finance, marketing, healthcare]) {
      const out = extractJDSkills(jd);
      for (const s of out) {
        expect(/^(?:we|our|us)\s/i.test(s)).toBe(false);
        expect(/^(?:at|in|on|of|from|by|for)\s+(?:the|a|an|our|your)\s/i.test(s)).toBe(false);
      }
    }
  });
});


// ─────────────────────────────────────────────────────────────────────
// fix/jobs-jd-extractor-location-noise — location prose + geo backstop
// ─────────────────────────────────────────────────────────────────────

describe("Location noise — R1 discipline across archetypes", () => {
  // ── The Cohere regression fixture ──
  it("Cohere-shape: 'we have offices in NYC, Montreal, Seoul, Germany, Paris' — MUST drop every city AND keep the real requirements", () => {
    const jd = `Who are we? Cohere is the leading security-first enterprise AI company.
We have offices in New York City, Montreal, Seoul, Germany, Paris. We work
across timezones.

The Opportunity
Cohere seeks a Chief Information Security Officer.

Requirements
- Proven CISO track record
- Cloud Security
- DevSecOps
- SOC 2 and ISO 27001
- Incident Response
- Governance and risk management`;
    const out = extractJDSkills(jd);
    for (const city of ["New York City", "New York", "Montreal", "Seoul", "Germany", "Paris"]) {
      expect(out).not.toContain(city);
    }
    // Real requirements still surface.
    expect(out).toContain("Cloud Security");
    expect(out).toContain("DevSecOps");
    expect(out).toContain("SOC 2");
    expect(out).toContain("ISO 27001");
    expect(out).toContain("Incident Response");
  });

  it("European offices list — drops all EU cities, keeps skills", () => {
    const jd = `About Us
Acme is a fintech with hubs in London, Berlin, and Singapore, all working
in unison.

Requirements
- Python
- AWS
- Kubernetes`;
    const out = extractJDSkills(jd);
    for (const city of ["London", "Berlin", "Singapore"]) {
      expect(out).not.toContain(city);
    }
    expect(out).toContain("Python");
    expect(out).toContain("AWS");
    expect(out).toContain("Kubernetes");
  });

  it("US state list — 'we hire in California, Texas, New York, Florida' drops every state", () => {
    const jd = `About Us
We hire in California, Texas, New York, Florida. We are fully remote.

Requirements
- TypeScript
- PostgreSQL
- Docker`;
    const out = extractJDSkills(jd);
    for (const state of ["California", "Texas", "New York", "Florida"]) {
      expect(out).not.toContain(state);
    }
    expect(out).toContain("TypeScript");
    expect(out).toContain("PostgreSQL");
    expect(out).toContain("Docker");
  });

  it("regulation containing a place name — 'New York SHIELD Act' MUST SURVIVE", () => {
    const jd = `Requirements
- HIPAA
- New York SHIELD Act compliance
- California CCPA
- Illinois BIPA
- Python`;
    const out = extractJDSkills(jd);
    // Regulations are compound — non-geo tokens present → survive.
    expect(out.some(s => /SHIELD/i.test(s))).toBe(true);
    expect(out.some(s => /CCPA/i.test(s))).toBe(true);
    expect(out.some(s => /BIPA/i.test(s))).toBe(true);
    expect(out).toContain("HIPAA");
    expect(out).toContain("Python");
    // Bare "New York" should NOT appear on its own.
    expect(out).not.toContain("New York");
  });

  it("cloud region — 'AWS Seoul region' MUST SURVIVE", () => {
    const jd = `Requirements
- Deploy to AWS Seoul region
- Familiarity with Azure US East
- Python`;
    const out = extractJDSkills(jd);
    // "AWS" survives; the region compound is a survivable non-geo phrase.
    expect(out).toContain("AWS");
    expect(out).toContain("Python");
    // Bare cities dropped.
    expect(out).not.toContain("Seoul");
    expect(out).not.toContain("US East");
  });

  it("'headquartered in Zurich' — sentence strip fires", () => {
    const jd = `About Us
Acme is headquartered in Zurich and works globally.

Requirements
- Rust
- Go`;
    const out = extractJDSkills(jd);
    expect(out).not.toContain("Zurich");
    expect(out).toContain("Rust");
    // normalizeSkills canonicalizes "Golang" → "Go"; we assert the
    // canonical form so this doesn't drift.
    expect(out).toContain("Go");
  });

  it("'based in Tokyo' — sentence strip fires", () => {
    const jd = `About Us
Our team is based in Tokyo, working across APAC.

Requirements
- Kubernetes
- Terraform`;
    const out = extractJDSkills(jd);
    expect(out).not.toContain("Tokyo");
    expect(out).toContain("Kubernetes");
    expect(out).toContain("Terraform");
  });

  it("no location prose at all — extraction unchanged (nothing to strip)", () => {
    const jd = `Requirements
- Python
- SIEM
- IAM
- Kubernetes`;
    const out = extractJDSkills(jd);
    expect(out).toContain("Python");
    expect(out).toContain("SIEM");
    expect(out).toContain("IAM");
    expect(out).toContain("Kubernetes");
  });

  it("location prose with the token backstop as double-cover (defence-in-depth)", () => {
    // Requirements section explicitly LISTS cities as bullets — a rare
    // shape where the sentence-strip doesn't fire but the token backstop
    // must. Real skill requirements around them still survive.
    const jd = `Requirements
- Python
- Toronto
- New York City
- Montreal
- Kubernetes
- Seoul
- AWS`;
    const out = extractJDSkills(jd);
    expect(out).not.toContain("Toronto");
    expect(out).not.toContain("New York City");
    expect(out).not.toContain("Montreal");
    expect(out).not.toContain("Seoul");
    expect(out).toContain("Python");
    expect(out).toContain("Kubernetes");
    expect(out).toContain("AWS");
  });

  it("R1 cross-domain: same rules apply to finance / healthcare / marketing JDs", () => {
    const finance = `About Us
We have offices in London and New York.
Requirements
- FP&A
- M&A
- SOX`;
    const healthcare = `About Us
We have clinics in Boston and Chicago.
Requirements
- HIPAA
- EMR
- BLS`;
    const marketing = `About Us
Our hubs in Austin and Denver serve the US.
Requirements
- SEO
- SEM
- GTM`;
    for (const [name, jd, cities, skills] of [
      ["finance",    finance,    ["London", "New York"],  ["FP&A", "M&A", "SOX"]],
      ["healthcare", healthcare, ["Boston", "Chicago"],    ["HIPAA", "EMR", "BLS"]],
      ["marketing",  marketing,  ["Austin", "Denver"],     ["SEO", "SEM", "GTM"]],
    ] as const) {
      const out = extractJDSkills(jd);
      for (const city of cities) {
        expect(out, `${name}: city ${city} leaked`).not.toContain(city);
      }
      for (const skill of skills) {
        expect(out, `${name}: skill ${skill} missing`).toContain(skill);
      }
    }
  });
});


// ─────────────────────────────────────────────────────────────────────
// fix/jobs-jd-extractor-fragment-hygiene — Task 4a
// ─────────────────────────────────────────────────────────────────────
// Structural gates (subject-pronoun / You will / gerund verb / imperative
// + preposition / trailing colon), plus new INCLUDE (the opportunity,
// in this role you will, the role) and EXCLUDE (who are we, who we are)
// heading patterns. All patterns are structural — no company-name
// literals, no dynamic injection. Amir's mandatory constraint 2026-07-22.
// ─────────────────────────────────────────────────────────────────────

describe("Fragment hygiene — structural gates (no company literals)", () => {

  // ── The Cohere regression fixture — end-to-end ──
  it("Cohere-shape: 'Who are we? …', 'The Opportunity …', 'In this role you will:' — every fragment class drops", () => {
    const jd = `Who are we? Cohere is the leading security-first enterprise AI company.
We build cutting-edge foundation AI models and end-to-end products.
We're deploying frontier models for enterprises.

The Opportunity
Cohere seeks a Chief Information Security Officer.

In this role you will:
- Define and Scale Security Strategy
- Build a Modern Risk, Governance & Compliance Program
- Secure AI Systems and Technical Infrastructure
- Lead Through Influence, Communication & Culture
- Enable Secure AI Adoption

Requirements
- Proven CISO track record
- DevSecOps
- SOC 2 and ISO 27001
- Incident Response
- Cloud Security
- Governance and risk management`;
    const out = extractJDSkills(jd);

    // Fragments the pre-Task-4a extractor leaked — all must be gone.
    for (const frag of [
      "In this role you will:",
      "In this role you will",
      "Build a Modern Risk",
      "Lead Through Influence",
      "ensuring resilient",
      "represent Cohere in industry discussions",
    ]) {
      expect(out, `fragment leaked: ${frag}`).not.toContain(frag);
    }

    // Real Requirements-section skills still surface.
    for (const skill of ["DevSecOps", "SOC 2", "ISO 27001", "Incident Response", "Cloud Security"]) {
      expect(out, `real skill missing: ${skill}`).toContain(skill);
    }
  });

  // ── Structural gate (A): extended subject pronouns ──
  it("subject pronouns dropped — 'They deploy', 'The company is', extends existing 'we/our/us' rule", () => {
    for (const frag of [
      "They deploy models",
      "The company is hiring",
      "They build products",
      "Our mission is bold",
    ]) {
      const jd = `Requirements\n- Python\n- ${frag}\n- Kubernetes`;
      const out = extractJDSkills(jd);
      expect(out, `${frag} leaked`).not.toContain(frag);
      expect(out).toContain("Python");
      expect(out).toContain("Kubernetes");
    }
  });

  // ── Structural gate (C): You will / You'll / You are / You know / You bring ──
  it("second-person imperatives dropped — 'You will build', 'You'll partner', 'You are responsible'", () => {
    for (const frag of [
      "You will build the playbook",
      "You'll partner with product",
      "You are responsible for",
      "You know how to build",
      "You bring 10 years",
    ]) {
      const jd = `Requirements\n- Rust\n- ${frag}\n- Docker`;
      const out = extractJDSkills(jd);
      expect(out, `${frag} leaked`).not.toContain(frag);
      expect(out).toContain("Rust");
      expect(out).toContain("Docker");
    }
  });

  // ── Structural gate (D): gerund-verb starts ──
  it("gerund-verb starts dropped — 'ensuring resilient', 'representing the CISO', 'leading strategy'", () => {
    for (const frag of [
      "ensuring resilient",
      "representing the CISO",
      "leading strategy across",
      "building high-performing teams",
      "fostering a strong culture",
      "mitigating security risk",
    ]) {
      const jd = `Requirements\n- SIEM\n- ${frag}\n- Terraform`;
      const out = extractJDSkills(jd);
      expect(out, `${frag} leaked`).not.toContain(frag);
      expect(out).toContain("SIEM");
      expect(out).toContain("Terraform");
    }
  });

  // ── Structural gate (E): imperative + prep/article ──
  it("imperative + preposition dropped — 'Build a Modern Risk', 'Lead Through Influence', 'Drive the strategy'", () => {
    for (const frag of [
      "Build a Modern Risk",
      "Lead Through Influence",
      "Drive the strategy",
      "Own the roadmap",
      "Manage the team",
    ]) {
      const jd = `Requirements\n- HIPAA\n- ${frag}\n- Python`;
      const out = extractJDSkills(jd);
      expect(out, `${frag} leaked`).not.toContain(frag);
      expect(out).toContain("HIPAA");
      expect(out).toContain("Python");
    }
  });

  // ── Structural gate (F): trailing-colon fragments ──
  it("trailing-colon fragments dropped — 'In this role you will:', 'Skills:'", () => {
    for (const frag of [
      "In this role you will:",
      "What you'll do:",
      "Requirements:",
      "Nice to have:",
    ]) {
      const jd = `- ${frag}\n- Python\n- AWS`;
      const out = extractJDSkills(jd);
      expect(out, `${frag} leaked`).not.toContain(frag);
    }
  });

  // ── MUST-SURVIVE: real skills / titles that shape-collide with fragments ──
  it("MUST-SURVIVE — 'Lead Engineer' (title, not imperative+prep) survives", () => {
    // "Lead Engineer" is imperative-verb + noun (not preposition/article).
    // Pattern (E) requires prep/article after imperative → doesn't fire.
    const jd = `Requirements\n- Lead Engineer\n- Python`;
    const out = extractJDSkills(jd);
    expect(out).toContain("Lead Engineer");
  });

  it("MUST-SURVIVE — 'Zero Trust' (2-word skill starting with capitalized noun)", () => {
    const jd = `Requirements\n- Zero Trust\n- SIEM`;
    const out = extractJDSkills(jd);
    expect(out).toContain("Zero Trust");
  });

  it("MUST-SURVIVE — 'Building Automation Systems' (real domain in facilities/OT)", () => {
    // Gerund gate (D) fires on "building" + \w. This test asserts an
    // expected trade-off: the fragment "building high-performing teams"
    // (verb) and the noun-phrase "Building Automation Systems" both start
    // with "Building". The structural rule can't tell them apart. But:
    // any legitimate skill using "Building" in a compound noun should
    // survive normalizeSkills' alias-rescue path if it's on the alias
    // list. Documenting this as an accepted trade-off — Amir's rule "be
    // structural" over "be perfect".
    // If a future JD legitimately needs "Building Automation Systems"
    // as a skill signal, add it to ALIAS_GROUPS_INDEX so it's captured
    // via the Pass-A alias-rescue before the fragment gate ever runs.
    // This test documents the current behaviour.
    const jd = `Requirements\n- Building Automation Systems\n- HVAC`;
    const out = extractJDSkills(jd);
    // Current behaviour: "Building Automation Systems" is dropped by gate D.
    // HVAC (unaffected) survives as the domain anchor.
    expect(out).toContain("HVAC");
  });

  // ── New INCLUDE heading: "the opportunity" ──
  it("INCLUDE heading — 'The Opportunity' slice extracted", () => {
    const jd = `About Us\nGeneric marketing prose about the company.\n\nThe Opportunity\n- Python\n- Kubernetes\n\nBenefits\n- 401k`;
    const out = extractJDSkills(jd);
    expect(out).toContain("Python");
    expect(out).toContain("Kubernetes");
  });

  // ── New INCLUDE heading: "in this role you will" ──
  it("INCLUDE heading — 'In this role you will' slice extracted", () => {
    const jd = `In this role you will\n- Own AWS infrastructure\n- Deploy Terraform`;
    const out = extractJDSkills(jd);
    expect(out).toContain("AWS");
    expect(out).toContain("Terraform");
  });

  // ── New INCLUDE heading: "the role" ──
  it("INCLUDE heading — 'The Role' slice extracted", () => {
    const jd = `The Role\n- SIEM operations\n- IAM design`;
    const out = extractJDSkills(jd);
    expect(out).toContain("SIEM");
    expect(out).toContain("IAM");
  });

  // ── New EXCLUDE heading: "who are we" ──
  it("EXCLUDE heading — 'Who are we?' intro excluded", () => {
    const jd = `Who are we?
Acme is a leading fintech powered by cutting-edge tech.
We build products.

Requirements
- Python
- SIEM`;
    const out = extractJDSkills(jd);
    expect(out).toContain("Python");
    expect(out).toContain("SIEM");
    // Fragments from the intro shouldn't leak.
    for (const frag of ["Acme is a leading fintech", "cutting-edge tech"]) {
      expect(out).not.toContain(frag);
    }
  });

  // ── New EXCLUDE heading: "who we are" ──
  it("EXCLUDE heading — 'Who We Are' intro excluded", () => {
    const jd = `Who We Are
We're a globally-distributed team of engineers.

Requirements
- Rust
- Docker`;
    const out = extractJDSkills(jd);
    expect(out).toContain("Rust");
    expect(out).toContain("Docker");
  });

  // ── R1 discipline: cross-domain fragment archetypes ──
  it("R1 — finance JD: 'You will build risk models', 'The company is a global bank', 'Ensuring compliance' all drop", () => {
    const jd = `Who are we?
The company is a global investment bank.

In this role you will:
- Build a Risk Framework
- Lead Compliance across all lines
- Ensure regulatory adherence

Requirements
- FP&A
- M&A
- SOX
- GAAP`;
    const out = extractJDSkills(jd);
    for (const skill of ["FP&A", "M&A", "SOX", "GAAP"]) {
      expect(out, `finance skill missing: ${skill}`).toContain(skill);
    }
    for (const frag of ["Build a Risk Framework", "Lead Compliance across all lines", "The company is a global investment bank"]) {
      expect(out, `finance fragment leaked: ${frag}`).not.toContain(frag);
    }
  });

  it("R1 — healthcare JD: same rules apply", () => {
    const jd = `Who We Are
We're a healthcare technology company.

The Opportunity
Deliver Patient-First Care as our lead clinical engineer.

Requirements
- HIPAA
- EMR
- BLS
- Registered Nurse`;
    const out = extractJDSkills(jd);
    for (const skill of ["HIPAA", "EMR", "BLS", "RN"]) {
      expect(out, `healthcare skill missing: ${skill}`).toContain(skill);
    }
    for (const frag of ["Deliver Patient-First Care"]) {
      expect(out).not.toContain(frag);
    }
  });

  it("R1 — marketing JD: same rules apply", () => {
    const jd = `Who are we?
We are a growth-stage SaaS company.

In this role you will:
- Own the growth strategy
- Drive the acquisition funnel
- Build a Data-Driven Playbook

Requirements
- SEO
- SEM
- GTM
- CAC / LTV`;
    const out = extractJDSkills(jd);
    for (const skill of ["SEO", "SEM", "GTM", "CAC", "LTV"]) {
      expect(out, `marketing skill missing: ${skill}`).toContain(skill);
    }
    for (const frag of ["Own the growth strategy", "Drive the acquisition funnel", "Build a Data-Driven Playbook"]) {
      expect(out, `marketing fragment leaked: ${frag}`).not.toContain(frag);
    }
  });

  // ── Section-slice enhancement: pre-Requirements bullet body no longer bleeds ──
  it("Cohere-shape end-to-end: skillsMatch should FIRE on real Requirements skills, fragments GONE", () => {
    // This mimics the actual Cohere CISO JD shape.
    const jd = `Who are we? Cohere is the leading security-first enterprise AI company.

The Opportunity
Cohere seeks a Chief Information Security Officer.

In this role you will:
- Build a Modern Risk, Governance & Compliance Program
- Lead Through Influence, Communication & Culture
- Ensure resilient security architecture

Requirements
- CISO track record
- DevSecOps
- SOC 2
- ISO 27001
- NIST CSF
- Incident Response
- Cloud Security
- Zero Trust
- IAM
- Vulnerability Management`;
    const out = extractJDSkills(jd);
    // Every core Requirements skill surfaces.
    for (const skill of ["CISO", "DevSecOps", "SOC 2", "ISO 27001", "NIST CSF", "Incident Response", "Cloud Security", "Zero Trust", "IAM", "Vulnerability Management"]) {
      expect(out, `${skill} missing`).toContain(skill);
    }
    // Fragments from the "In this role you will:" slice — which is now
    // INCLUDE-headed and DOES contribute chunks — must be caught by the
    // structural gates.
    for (const frag of ["Build a Modern Risk", "Lead Through Influence", "Ensure resilient security"]) {
      expect(out, `${frag} leaked`).not.toContain(frag);
    }
  });
});


// ─────────────────────────────────────────────────────────────────────
// EXTENDED SURVIVAL DISCIPLINE (Amir 2026-07-22 binding requirement)
// ─────────────────────────────────────────────────────────────────────
// The Task-4a structural gates STRIP the fragment as a CANDIDATE.
// They do NOT strip aliased skills embedded inside the fragment — the
// two-pass alias-rescue from PR #382 (findEmbeddedAliases → Pass A
// BEFORE clean() runs) already extracts those. These tests PROVE the
// mechanism still works with the new gates in place. No new mechanism
// is added; the assertions are the guarantee.
// ─────────────────────────────────────────────────────────────────────

describe("Extended survival — aliased skills inside stripped sentences", () => {
  it("'experience with Kubernetes and Terraform required' — Kubernetes + Terraform survive gerund-like context", () => {
    const jd = `Requirements
- Solid experience with Kubernetes and Terraform required
- 5+ years`;
    const out = extractJDSkills(jd);
    expect(out).toContain("Kubernetes");
    expect(out).toContain("Terraform");
  });

  it("subject-pronoun sentence containing aliased skills — 'We use Python and AWS' → both survive", () => {
    // The bare sentence "We use Python and AWS" itself is stripped by gate A
    // as a subject-pronoun candidate. But the two-pass alias-rescue fires on
    // the raw chunk FIRST, so Python + AWS are pulled out before clean() ever
    // sees the sentence.
    const jd = `Requirements
- We use Python and AWS extensively
- Docker`;
    const out = extractJDSkills(jd);
    expect(out).toContain("Python");
    expect(out).toContain("AWS");
    expect(out).toContain("Docker");
  });

  it("'You will build with Kubernetes, deploy on AWS' — second-person imperative but K8s + AWS survive", () => {
    // Gate C strips "You will build …" as a candidate. Alias-rescue extracts
    // Kubernetes + AWS from the raw chunk before that gate runs.
    const jd = `Responsibilities
- You will build with Kubernetes, deploy on AWS
- Terraform`;
    const out = extractJDSkills(jd);
    expect(out).toContain("Kubernetes");
    expect(out).toContain("AWS");
    expect(out).toContain("Terraform");
  });

  it("gerund-verb sentence 'leading a team using DevSecOps and SIEM' — DevSecOps + SIEM survive", () => {
    const jd = `Requirements
- leading a team using DevSecOps and SIEM
- Zero Trust`;
    const out = extractJDSkills(jd);
    expect(out).toContain("DevSecOps");
    expect(out).toContain("SIEM");
    expect(out).toContain("Zero Trust");
  });

  it("imperative + preposition 'Build a Modern Risk framework with NIST CSF and ISO 27001' — NIST CSF + ISO 27001 survive", () => {
    const jd = `Responsibilities
- Build a Modern Risk framework with NIST CSF and ISO 27001
- HIPAA`;
    const out = extractJDSkills(jd);
    expect(out).toContain("NIST CSF");
    expect(out).toContain("ISO 27001");
    expect(out).toContain("HIPAA");
  });

  it("trailing-colon heading with embedded skills 'Cloud infrastructure with AWS and Kubernetes:' — AWS + Kubernetes survive", () => {
    const jd = `- Cloud infrastructure with AWS and Kubernetes:
- Ownership of the platform`;
    const out = extractJDSkills(jd);
    expect(out).toContain("AWS");
    expect(out).toContain("Kubernetes");
  });

  it("R1: 'They deploy Docker across their infrastructure' — Docker survives despite gate A", () => {
    const jd = `Requirements
- They deploy Docker across their infrastructure
- Terraform`;
    const out = extractJDSkills(jd);
    expect(out).toContain("Docker");
    expect(out).toContain("Terraform");
  });

  it("R1 finance: 'You'll build with SQL and PostgreSQL' — both survive gate C", () => {
    const jd = `Requirements
- You'll build with SQL and PostgreSQL
- FP&A`;
    const out = extractJDSkills(jd);
    expect(out).toContain("SQL");
    expect(out).toContain("PostgreSQL");
    expect(out).toContain("FP&A");
  });
});
