/**
 * geoTokens — isolated unit tests for the geography stoplist + sentence
 * strip. The paragraph strip + token backstop are tested end-to-end in
 * jdExtractor.test.ts; this file is the fine-grained coverage.
 */
import { describe, it, expect } from "vitest";
import { isPureGeography, stripLocationSentences } from "../geoTokens";

describe("isPureGeography — pure geo drops", () => {
  it("single city → drops", () => {
    expect(isPureGeography("Seoul")).toBe(true);
    expect(isPureGeography("Montreal")).toBe(true);
    expect(isPureGeography("Paris")).toBe(true);
  });

  it("multi-word city → drops", () => {
    expect(isPureGeography("New York City")).toBe(true);
    expect(isPureGeography("San Francisco")).toBe(true);
    expect(isPureGeography("Hong Kong")).toBe(true);
    expect(isPureGeography("Washington DC")).toBe(true);
  });

  it("country → drops", () => {
    expect(isPureGeography("Germany")).toBe(true);
    expect(isPureGeography("United States")).toBe(true);
    expect(isPureGeography("Singapore")).toBe(true);
  });

  it("US state (full name) → drops", () => {
    expect(isPureGeography("California")).toBe(true);
    expect(isPureGeography("Texas")).toBe(true);
    expect(isPureGeography("New York")).toBe(true);
  });

  it("comma-separated place list → drops", () => {
    expect(isPureGeography("London, Berlin, Singapore")).toBe(true);
    expect(isPureGeography("Toronto, Montreal, Vancouver")).toBe(true);
  });

  it("geo + suffix → drops", () => {
    expect(isPureGeography("Seoul region")).toBe(true);
    expect(isPureGeography("Metro area")).toBe(true);
  });

  it("modifier alone → drops", () => {
    expect(isPureGeography("remote")).toBe(true);
    expect(isPureGeography("hybrid")).toBe(true);
    expect(isPureGeography("on-site")).toBe(true);
  });
});

describe("isPureGeography — compound with non-geo tokens survives", () => {
  // ── R1 discipline case explicitly from Amir's spec ──
  it("regulation containing a place name — MUST SURVIVE", () => {
    expect(isPureGeography("New York SHIELD Act")).toBe(false);
    expect(isPureGeography("California CCPA")).toBe(false);
    expect(isPureGeography("Illinois BIPA")).toBe(false);
    expect(isPureGeography("EU GDPR")).toBe(false); // "EU" not in geo set → survives
  });

  it("cloud provider region — MUST SURVIVE", () => {
    expect(isPureGeography("AWS Seoul region")).toBe(false);
    expect(isPureGeography("Azure US East")).toBe(false);
    expect(isPureGeography("GCP us-east1")).toBe(false);
  });

  it("compound with a technical noun — MUST SURVIVE", () => {
    expect(isPureGeography("San Francisco bank")).toBe(false);
    expect(isPureGeography("US federal law")).toBe(false);
    expect(isPureGeography("London insurance market")).toBe(false);
    expect(isPureGeography("Germany banking")).toBe(false);
  });

  it("skill-like phrase that happens to include a geo word — MUST SURVIVE", () => {
    // "LangChain" not in geo set → survives even though "IN" is a state abbrev
    expect(isPureGeography("LangChain")).toBe(false);
    expect(isPureGeography("Tokyo Stack Exchange")).toBe(false);
  });
});

describe("isPureGeography — 2-letter state code disambiguation", () => {
  it("ambiguous 2-letter alone → SURVIVES (not confident enough)", () => {
    // "IN" the preposition, "OR" the boolean — killing these on sight
    // would murder real skills. Only drop when anchored.
    expect(isPureGeography("IN")).toBe(false);
    expect(isPureGeography("OR")).toBe(false);
    expect(isPureGeography("MA")).toBe(false);
    expect(isPureGeography("LA")).toBe(false);
  });

  it("2-letter code anchored by unambiguous geo → drops", () => {
    // "California, TX" — "California" anchors "TX" as a state abbrev.
    expect(isPureGeography("California, TX")).toBe(true);
    expect(isPureGeography("Texas, CA, NY")).toBe(true);
    expect(isPureGeography("Georgia, GA")).toBe(true);
  });
});

describe("isPureGeography — edge cases", () => {
  it("empty / whitespace → survives (do not drop)", () => {
    expect(isPureGeography("")).toBe(false);
    expect(isPureGeography("   ")).toBe(false);
  });

  it("case-insensitive", () => {
    expect(isPureGeography("MONTREAL")).toBe(true);
    expect(isPureGeography("montreal")).toBe(true);
    expect(isPureGeography("MoNtReAl")).toBe(true);
  });

  it("mixed punctuation → still detects", () => {
    expect(isPureGeography("Seoul.")).toBe(true);
    expect(isPureGeography("(New York)")).toBe(true);
    expect(isPureGeography("US, UK, Canada")).toBe(true);
  });
});

describe("stripLocationSentences — paragraph-level strip", () => {
  it("strips 'offices in …' sentence, keeps neighbours", () => {
    const jd = "About Cohere. We have offices in New York City, Montreal, Seoul, Germany, Paris. We build AI.";
    const out = stripLocationSentences(jd);
    expect(out).not.toMatch(/offices in/i);
    expect(out).toMatch(/About Cohere/);
    expect(out).toMatch(/We build AI/);
  });

  it("strips 'headquartered in …' sentence", () => {
    const jd = "Acme Corp is headquartered in San Francisco. We hire engineers.";
    const out = stripLocationSentences(jd);
    expect(out).not.toMatch(/headquartered/i);
    expect(out).toMatch(/We hire engineers/);
  });

  it("strips 'hubs in …' sentence", () => {
    const jd = "Our engineering hubs in London, Berlin, and Singapore work together. Python required.";
    const out = stripLocationSentences(jd);
    expect(out).not.toMatch(/hubs in/i);
    expect(out).toMatch(/Python required/);
  });

  it("strips 'we hire in …' sentence", () => {
    const jd = "We hire in California, Texas, New York, Florida. Requirements: TypeScript.";
    const out = stripLocationSentences(jd);
    expect(out).not.toMatch(/we hire in/i);
    expect(out).toMatch(/TypeScript/);
  });

  it("preserves content when NO location prose", () => {
    const jd = "Requirements: Python, AWS, Kubernetes. Nice to have: Rust.";
    expect(stripLocationSentences(jd)).toContain("Python");
    expect(stripLocationSentences(jd)).toContain("Kubernetes");
  });

  it("preserves line count for section-slicer alignment", () => {
    const jd = "Line A.\nWe have offices in London.\nLine C.";
    const out = stripLocationSentences(jd);
    expect(out.split("\n").length).toBe(3);
  });
});
