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
