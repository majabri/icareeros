/**
 * feat/jobs-enrichment — shared skill/seniority inference tests.
 * The same functions run inside the enrich-jobs edge function.
 */
import { describe, it, expect } from "vitest";
import { extractSkillsFromText, inferSeniority, SKILL_PATTERNS } from "../skillPatterns";

describe("extractSkillsFromText", () => {
  it("recognises AWS + Kubernetes + Terraform from a job description", () => {
    const text = "We are building infra on AWS with Kubernetes clusters managed via Terraform.";
    const skills = extractSkillsFromText(text);
    expect(skills).toEqual(expect.arrayContaining(["AWS", "Kubernetes", "Terraform"]));
  });
  it("recognises security stack: SIEM + SOC + GRC + Zero Trust", () => {
    const text = "Lead SIEM tuning, SOC operations, GRC audits, and Zero Trust rollout.";
    const skills = extractSkillsFromText(text);
    expect(skills).toEqual(expect.arrayContaining([
      "SIEM", "SOC operations", "GRC", "Zero Trust"
    ]));
  });
  it("recognises compliance frameworks", () => {
    const text = "Managed SOC 2 audit, GDPR programme, and PCI-DSS controls.";
    expect(extractSkillsFromText(text)).toContain("Compliance Frameworks");
  });
  it("returns empty array for text with no known patterns", () => {
    expect(extractSkillsFromText("We bake artisan sourdough loaves.")).toEqual([]);
  });
  it("de-dupes when a skill matches multiple patterns", () => {
    const text = "AWS AWS AWS Amazon Web Services";
    const skills = extractSkillsFromText(text);
    expect(skills.filter(s => s === "AWS")).toHaveLength(1);
  });
});

describe("inferSeniority (edge-compatible port)", () => {
  it("director + head-of titles", () => {
    expect(inferSeniority("Director of Security")).toBe("director");
    expect(inferSeniority("Head of Information Security")).toBe("director");
  });
  it("executive C-suite initialisms", () => {
    expect(inferSeniority("CISO")).toBe("executive");
    expect(inferSeniority("Chief Security Officer")).toBe("executive");
    expect(inferSeniority("CTO")).toBe("executive");
  });
  it("BISO maps to director tier", () => {
    expect(inferSeniority("BISO")).toBe("director");
    expect(inferSeniority("Business Information Security Officer")).toBe("director");
  });
  it("VP + SVP + EVP → vp", () => {
    expect(inferSeniority("VP Security")).toBe("vp");
    expect(inferSeniority("SVP Engineering")).toBe("vp");
  });
  it("staff / principal / senior / mid / junior / intern", () => {
    expect(inferSeniority("Staff Engineer")).toBe("staff");
    expect(inferSeniority("Principal Architect")).toBe("principal");
    expect(inferSeniority("Senior Data Engineer")).toBe("senior");
    expect(inferSeniority("Engineering Manager")).toBe("mid");
    expect(inferSeniority("Junior Analyst")).toBe("junior");
    expect(inferSeniority("Intern — Summer 2027")).toBe("intern");
  });
});

describe("SKILL_PATTERNS", () => {
  it("has at least 40 distinct patterns", () => {
    expect(SKILL_PATTERNS.length).toBeGreaterThanOrEqual(40);
  });
});
