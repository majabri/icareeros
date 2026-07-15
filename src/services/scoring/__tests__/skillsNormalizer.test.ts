/**
 * fix/jobs-skills-normalization — cross-domain skills normalization tests.
 *
 * Design invariants under test:
 *   1. Punctuation-glued compounds split cleanly (·, •, |, /, ,, ;, &, and)
 *   2. Protected slash-tokens survive (ISO/IEC 27001, CI/CD, TCP/IP, A/B Testing)
 *   3. Word-bounded matching (java ≠ javascript, SQL ≠ NoSQL, GRC ≠ TRUST_GRC)
 *   4. Alias symmetry (K8s ↔ Kubernetes, PM ↔ both project & product management)
 *   5. Cross-domain coverage: security/compliance, tech, finance, healthcare, marketing
 *   6. Idempotence: normalizeSkills(normalizeSkills(x)) === normalizeSkills(x)
 *   7. Determinism: identical input → identical output
 *   8. Regression: already-clean skills don't get inflated
 */
import { describe, it, expect } from "vitest";
import {
  normalizeSkills,
  skillsMatch,
  skillAppearsIn,
  canonicalize,
} from "../skillsNormalizer";

// ── Task 3 archetype (a) — Amir's actual compound ──────────────────
describe("normalizeSkills — Amir's real compound", () => {
  it("splits 'NIST CSF 2.0 · ISO/IEC 27001 · NIST 800-53' into 3 canonical skills", () => {
    const out = normalizeSkills(["NIST CSF 2.0 · ISO/IEC 27001 · NIST 800-53"]);
    expect(out).toContain("NIST CSF");
    expect(out).toContain("ISO 27001");
    expect(out).toContain("NIST 800-53");
  });

  it("splits 'OCC · FFIEC · GLBA · SOX · GDPR' into 5 canonical skills", () => {
    const out = normalizeSkills(["OCC · FFIEC · GLBA · SOX · GDPR"]);
    for (const c of ["OCC", "FFIEC", "GLBA", "SOX", "GDPR"]) {
      expect(out).toContain(c);
    }
  });

  it("splits 'Cloud Security · IT Infrastructure · DevOps' into 3", () => {
    const out = normalizeSkills(["Cloud Security · IT Infrastructure · DevOps"]);
    expect(out).toContain("Cloud Security");
    expect(out).toContain("DevOps");
    expect(out.length).toBeGreaterThanOrEqual(3);
  });
});

// ── Task 3 archetype (b) — protected slash-tokens ──────────────────
describe("normalizeSkills — protected slash-tokens", () => {
  it("'ISO/IEC 27001' survives splitting intact and canonicalises to 'ISO 27001'", () => {
    const out = normalizeSkills(["ISO/IEC 27001"]);
    expect(out).toContain("ISO 27001");
  });

  it("'CI/CD' survives splitting intact", () => {
    const out = normalizeSkills(["CI/CD"]);
    expect(out).toContain("CI/CD");
  });

  it("'TCP/IP' survives splitting intact", () => {
    const out = normalizeSkills(["TCP/IP"]);
    expect(out).toContain("TCP/IP");
  });

  it("'A/B Testing' survives splitting intact", () => {
    const out = normalizeSkills(["A/B Testing"]);
    expect(out).toContain("A/B Testing");
  });
});

// ── Task 3 archetype (c) — alias symmetry ──────────────────────────
describe("skillsMatch — alias symmetry", () => {
  it("K8s ↔ Kubernetes both directions", () => {
    expect(skillsMatch("K8s", "Kubernetes")).toBe(true);
    expect(skillsMatch("Kubernetes", "K8s")).toBe(true);
  });

  it("ISO 27001 ↔ ISO/IEC 27001 both directions", () => {
    expect(skillsMatch("ISO 27001", "ISO/IEC 27001")).toBe(true);
    expect(skillsMatch("ISO/IEC 27001", "ISO 27001")).toBe(true);
  });

  it("PM matches BOTH Project Management and Product Management (ambiguous stays ambiguous)", () => {
    expect(skillsMatch("PM", "Project Management")).toBe(true);
    expect(skillsMatch("PM", "Product Management")).toBe(true);
    expect(skillsMatch("Project Management", "PM")).toBe(true);
    expect(skillsMatch("Product Management", "PM")).toBe(true);
  });
});

// ── Task 3 archetype (d) — containment (word-bounded, no fuzzy) ────
describe("skillsMatch / skillAppearsIn — word-bounded discipline", () => {
  it("'incident response' matches 'security incident response processes' via containment", () => {
    expect(skillAppearsIn("Incident Response", "we need security incident response processes")).toBe(true);
  });

  it("'java' does NOT match 'javascript' (word boundary)", () => {
    expect(skillAppearsIn("Java", "5+ years of JavaScript required")).toBe(false);
  });

  it("'SQL' does NOT match 'PostgreSQL' via containment (word boundary)", () => {
    expect(skillAppearsIn("SQL", "PostgreSQL required")).toBe(false);
  });

  it("'GRC' matches 'GRC.' with punctuation on the trailing edge", () => {
    // Real JDs have punctuation. Ensure our word-boundary regex allows
    // sentence-ending punctuation.
    expect(skillAppearsIn("GRC", "Familiarity with GRC.")).toBe(true);
  });
});

// ── Task 3 archetype (e) — cross-domain: finance / marketing / healthcare ──
describe("normalizeSkills — cross-domain coverage (R1)", () => {
  it("finance compound 'GAAP, SOX, FP&A' splits into 3 canonical skills", () => {
    const out = normalizeSkills(["GAAP, SOX, FP&A"]);
    expect(out).toContain("GAAP");
    expect(out).toContain("SOX");
    expect(out).toContain("FP&A");
  });

  it("finance JD phrasings match the acronyms", () => {
    expect(skillAppearsIn("SOX", "Sarbanes-Oxley compliance experience required")).toBe(true);
    expect(skillAppearsIn("FP&A", "3+ years of Financial Planning and Analysis")).toBe(true);
    expect(skillAppearsIn("M&A", "Mergers and Acquisitions due diligence")).toBe(true);
    expect(skillAppearsIn("P&L", "P&L ownership required")).toBe(true);
  });

  it("marketing compound 'SEO/SEM · CRM' splits and canonicalises", () => {
    const out = normalizeSkills(["SEO/SEM · CRM"]);
    expect(out).toContain("SEO");
    expect(out).toContain("SEM");
    expect(out).toContain("CRM");
  });

  it("marketing JD phrasings match the acronyms", () => {
    expect(skillAppearsIn("SEO", "Deep search engine optimization background")).toBe(true);
    expect(skillAppearsIn("GTM", "own the go-to-market strategy")).toBe(true);
    expect(skillAppearsIn("LTV", "improve customer lifetime value")).toBe(true);
  });

  it("healthcare compound 'HIPAA; EMR' splits into 2 canonical skills", () => {
    const out = normalizeSkills(["HIPAA; EMR"]);
    expect(out).toContain("HIPAA");
    expect(out).toContain("EMR");
  });

  it("healthcare JD phrasings match the acronyms", () => {
    expect(skillAppearsIn("EMR", "experience with electronic health records")).toBe(true);
    expect(skillAppearsIn("RN", "registered nurse license required")).toBe(true);
  });
});

// ── Task 3 archetype (f) — idempotence + determinism ───────────────
describe("normalizeSkills — algebra", () => {
  const AMIR_SAMPLE = [
    "Business Information Security (BISO)",
    "NIST CSF 2.0 · ISO/IEC 27001 · NIST 800-53",
    "OCC · FFIEC · GLBA · SOX · GDPR",
    "Cloud Security · IT Infrastructure · DevOps",
    "C",
    "GDPR",
    "DevOps",
  ];

  it("idempotent: normalizeSkills(normalizeSkills(x)) === normalizeSkills(x)", () => {
    const once  = normalizeSkills(AMIR_SAMPLE);
    const twice = normalizeSkills(once);
    expect(twice).toEqual(once);
  });

  it("deterministic: identical input → byte-identical output", () => {
    const a = normalizeSkills(AMIR_SAMPLE);
    const b = normalizeSkills(AMIR_SAMPLE);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("drops single-character fragments (the 'C' junk)", () => {
    const out = normalizeSkills(["C", "  ", ""]);
    expect(out).toEqual([]);
  });

  it("dedupes GDPR and DevOps that appeared twice in the raw list", () => {
    const out = normalizeSkills(AMIR_SAMPLE);
    const gdprHits   = out.filter(s => s === "GDPR").length;
    const devopsHits = out.filter(s => s === "DevOps").length;
    expect(gdprHits).toBe(1);
    expect(devopsHits).toBe(1);
  });
});

// ── Task 3 archetype (g) — regression: no inflation for clean data ─
describe("normalizeSkills — no inflation on already-clean skills", () => {
  it("already-canonical clean list passes through with no growth", () => {
    const clean = ["Python", "AWS", "Kubernetes", "Docker", "PostgreSQL"];
    const out = normalizeSkills(clean);
    // Every input must appear; no synthetic additions.
    for (const s of clean) expect(out).toContain(s);
    expect(out.length).toBe(clean.length);
  });

  it("canonicalize is a no-op for a canonical form (round-trip stability)", () => {
    for (const s of ["Kubernetes", "ISO 27001", "SOC 2", "SEO", "HIPAA"]) {
      expect(canonicalize(s)).toBe(s);
    }
  });
});

// ── Task 3 archetype (h) — the exact RBC-scenario check ────────────
describe("normalizeSkills — RBC BISO scenario", () => {
  it("Amir's full raw skills list yields >= 15 distinct canonical skills including the security exec set", () => {
    const RAW = [
      "Business Information Security (BISO)",
      "Enterprise Cyber Security Strategy & Governance",
      "US Financial Services Regulatory Compliance",
      "NIST CSF 2.0 · ISO/IEC 27001 · NIST 800-53",
      "OCC · FFIEC · GLBA · SOX · GDPR",
      "Risk Assessment & Security Control Testing",
      "Incident Prevention",
      "Response & Tabletops",
      "Security Program Build",
      "Scale & Operationalization",
      "Executive",
      "Board & Regulator Advisory",
      "Cross-Functional Stakeholder Engagement",
      "Business Continuity & Disaster Recovery",
      "Cloud Security · IT Infrastructure · DevOps",
      "Security Operations & Threat Intelligence",
      "Policy Development & Control Effectiveness",
      "C",
      "GDPR",
      "DevOps",
    ];
    const out = normalizeSkills(RAW);
    // Must expose the compliance frameworks that got lost inside compounds.
    for (const expected of [
      "NIST CSF", "ISO 27001", "NIST 800-53",
      "OCC", "FFIEC", "GLBA", "SOX", "GDPR",
      "BISO", "Cloud Security", "DevOps", "Disaster Recovery",
    ]) {
      expect(out).toContain(expected);
    }
    // And length is comfortably above the 15 threshold — the raw list
    // exposed only ~5 canonicals to the string-matcher.
    expect(out.length).toBeGreaterThanOrEqual(15);
    // Anti-inflation: don't blow past 40 either.
    expect(out.length).toBeLessThanOrEqual(40);
  });
});
