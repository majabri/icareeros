/**
 * feat/jobs-for-you-curator Task 8 — deterministic explanation tests.
 */
import { describe, it, expect } from "vitest";
import { generateTierExplanation, generateJobReasoning, type ScoredOpportunity } from "../explanations";
import type { UserProfile, ProfileFitScore } from "@/services/scoring/profileScorer";
import type { SkillsFingerprint } from "../skillsFingerprint";

const profile: UserProfile = {
  skills: ["Python", "AWS", "GRC"], targetRoles: ["Director of Security"],
  targetSeniority: "director", currentTitle: "", yearsExperience: 9,
  summary: "", keywords: [],
};
const skills: SkillsFingerprint = {
  coreSkills: ["Python", "AWS", "GRC"], inferredSkills: [], industryKeywords: [],
  recentTechStack: [], allKeywords: ["python", "aws", "grc"],
};

function scored(pfs: Partial<ProfileFitScore["signals"]> & { fit_score?: number } = {}): ScoredOpportunity {
  return {
    title: "CISO", company: "Acme", location: "Remote", type: "",
    description: "", url: "https://acme.com/1", matchReason: "",
    fit_score: pfs.fit_score ?? 80,
    profileFitScore: {
      total: pfs.fit_score ?? 80,
      breakdown: { skillsMatch: 60, seniorityMatch: 80, targetRoleMatch: 100, experienceMatch: 60, keywordDensity: 40 },
      signals: {
        matchedSkills: pfs.matchedSkills ?? ["python", "aws"],
        missingSkills: pfs.missingSkills ?? ["ml"],
        senioritySignal: pfs.senioritySignal ?? "match",
        targetRoleSignal: pfs.targetRoleSignal ?? "exact",
        targetRoleBestMatch: pfs.targetRoleBestMatch ?? "CISO",
      },
    },
    queryOrigin: "exact",
  };
}

describe("generateTierExplanation", () => {
  it("mentions the target role + top skills + seniority for strongMatch", () => {
    const txt = generateTierExplanation("strongMatch", [scored(), scored()], profile, skills);
    // fix/jobs-per-role-scoring — tier now names the actually-matched role from targetRoleBestMatch.
    expect(txt).toContain("CISO");
    expect(txt).toContain("Python, AWS, GRC");
    expect(txt).toContain("director");
    expect(txt).toMatch(/^2 roles closely aligned/);
  });
  it("returns empty string when tier is empty", () => {
    expect(generateTierExplanation("strongMatch", [], profile, skills)).toBe("");
  });
  it("stretch copy mentions trajectory toward target role", () => {
    const txt = generateTierExplanation("stretch", [scored()], profile, skills);
    // fix/jobs-per-role-scoring — stretch copy now uses targetRoleBestMatch.
    expect(txt).toContain("CISO");
    expect(txt).toContain("stretch");
  });
});

describe("generateJobReasoning", () => {
  it("exact role match includes 'Exact match for CISO'", () => {
    const txt = generateJobReasoning(scored(), profile);
    expect(txt).toContain("Exact match for CISO");
  });
  it("shows N of M skills match", () => {
    const txt = generateJobReasoning(scored(), profile);
    expect(txt).toContain("2 of 3 required skills match");
  });
  it("adjacent role → 'Adjacent to your Director of Security'", () => {
    const txt = generateJobReasoning(scored({ targetRoleSignal: "adjacent" }), profile);
    // fix/jobs-per-role-scoring — Adjacent uses matched role from targetRoleBestMatch.
    expect(txt).toContain("Adjacent to CISO");
  });
  it("seniority match line included", () => {
    const txt = generateJobReasoning(scored(), profile);
    expect(txt).toContain("Right seniority level");
  });
});
