/**
 * feat/jobs-for-you-curator Task 8 — skills fingerprint tests.
 */
import { describe, it, expect } from "vitest";
import { extractSkillsFingerprint, extractSkillsFromText, extractIndustryKeywords } from "../skillsFingerprint";
import type { UserProfile } from "@/services/scoring/profileScorer";

function makeProfile(over: Partial<UserProfile> = {}): UserProfile {
  return {
    skills: ["Python", "AWS"],
    targetRoles: ["Director of Security"],
    targetSeniority: "director",
    currentTitle: "Senior Security Engineer",
    yearsExperience: 9,
    summary: "Security leader focused on SaaS and financial services.",
    keywords: [],
    ...over,
  };
}

describe("extractSkillsFromText", () => {
  it("finds AWS/K8s/SOC/GRC from experience bullets", () => {
    const text = "Built a SOC. Migrated infra to AWS. Deployed to Kubernetes. Ran GRC audits for SOC 2.";
    const found = extractSkillsFromText(text);
    expect(found).toContain("AWS");
    expect(found).toContain("Kubernetes");
    expect(found).toContain("SOC operations");
    expect(found).toContain("GRC");
    expect(found).toContain("Compliance Frameworks");
  });
});

describe("extractIndustryKeywords", () => {
  it("recognises SaaS + financial services + healthcare", () => {
    expect(extractIndustryKeywords("SaaS startup")).toContain("SaaS");
    expect(extractIndustryKeywords("worked in financial services and healthcare")).toEqual(
      expect.arrayContaining(["financial services", "healthcare"])
    );
  });
});

describe("extractSkillsFingerprint", () => {
  it("union of core + inferred + industry + recent lands in allKeywords", () => {
    const profile = makeProfile();
    const work = [
      { title: "CISO", company: "Acme", startDate: "2023-01", endDate: "Present",
        bullets: ["Managed SIEM + zero trust rollout on AWS", "Led GRC + SOC 2 audits"] },
    ];
    const fp = extractSkillsFingerprint(profile, work);
    // coreSkills unchanged
    expect(fp.coreSkills).toEqual(["Python", "AWS"]);
    // inferredSkills from bullets
    expect(fp.inferredSkills).toEqual(expect.arrayContaining(["SIEM", "Zero Trust", "AWS", "GRC"]));
    // industry
    expect(fp.industryKeywords).toContain("SaaS");
    expect(fp.industryKeywords).toContain("financial services");
    // allKeywords is the union, lowercased
    expect(fp.allKeywords).toEqual(expect.arrayContaining(["aws", "python", "grc", "siem"]));
  });
});
