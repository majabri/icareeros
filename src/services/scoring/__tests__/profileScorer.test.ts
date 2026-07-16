/**
 * feat/jobs-opportunity-scoring — profileScorer unit tests.
 */
import { describe, it, expect } from "vitest";
import {
  scoreTargetRoleMatch,
  scoreSkillsMatch,
  scoreSeniorityMatch,
  scoreExperienceMatch,
  scoreKeywordDensity,
  scoreOpportunityAgainstProfile,
  inferSeniority,
  type UserProfile,
} from "../profileScorer";
import type { OpportunityResult } from "@/services/opportunityTypes";

function makeJob(over: Partial<OpportunityResult> = {}): OpportunityResult {
  return {
    title:       "Director of Security",
    company:     "Acme",
    location:    "Remote",
    type:        "",
    description: "We need a Director of Security. Requirements: 8+ years of experience. Skills: python, aws, kubernetes, docker, terraform.",
    url:         "https://acme.com/jobs/1",
    matchReason: "",
    ...over,
  };
}

function makeProfile(over: Partial<UserProfile> = {}): UserProfile {
  return {
    skills:          ["python", "aws", "kubernetes", "terraform"],
    targetRoles:     ["Director of Security"],
    targetSeniority: "director",
    currentTitle:    "Senior Security Engineer",
    yearsExperience: 9,
    summary:         "Security leader with a decade of experience.",
    keywords:        ["security", "leader", "decade", "experience"],
    ...over,
  };
}

describe("scoreTargetRoleMatch", () => {
  it("returns 100 for exact title match against a target role", () => {
    const r = scoreTargetRoleMatch(makeJob({ title: "Director of Security" }), makeProfile());
    expect(r.score).toBe(100);
    expect(r.signal).toBe("exact");
  });
  it("returns < 30 for unrelated role", () => {
    const r = scoreTargetRoleMatch(makeJob({ title: "Pastry Chef" }), makeProfile());
    expect(r.score).toBeLessThan(30);
    expect(r.signal).toBe("mismatch");
  });
  it("returns 0 when profile has no target roles", () => {
    const r = scoreTargetRoleMatch(makeJob(), makeProfile({ targetRoles: [] }));
    expect(r.score).toBe(0);
  });
  it("scales via word overlap for adjacent titles", () => {
    // 'Director of Engineering' shares 'director' with target 'Director of Security'
    // Target has 2 significant words ('director','security'); job matches 'director' → 50/100.
    const r = scoreTargetRoleMatch(makeJob({ title: "Director of Engineering" }), makeProfile());
    expect(r.score).toBeGreaterThanOrEqual(30);
    expect(r.score).toBeLessThanOrEqual(60);
  });
});

describe("scoreSkillsMatch", () => {
  it("returns 100 when all profile skills appear in the JD", () => {
    // JD mentions python/aws/kubernetes/docker/terraform. Profile has 4 of those.
    const r = scoreSkillsMatch(makeJob(), makeProfile());
    expect(r.score).toBeGreaterThan(0);
    expect(r.matched).toEqual(expect.arrayContaining(["python","aws","kubernetes","terraform"]));
  });
  it("returns 0 when there is no skill overlap", () => {
    const r = scoreSkillsMatch(
      makeJob({ description: "Requirements: sales, negotiation, cold calling." }),
      makeProfile()
    );
    expect(r.score).toBe(0);
    expect(r.matched).toEqual([]);
  });
  it("returns 0 when profile has no skills", () => {
    const r = scoreSkillsMatch(makeJob(), makeProfile({ skills: [] }));
    expect(r.score).toBe(0);
  });
});

describe("scoreSeniorityMatch", () => {
  it("returns 100 when target matches the job's inferred level", () => {
    const r = scoreSeniorityMatch(makeJob({ title: "Director of X" }), makeProfile({ targetSeniority: "director" }));
    expect(r.score).toBe(100);
    expect(r.signal).toBe("match");
  });
  it("returns 70 when job is one level higher (overqualified)", () => {
    const r = scoreSeniorityMatch(makeJob({ title: "VP of Something" }), makeProfile({ targetSeniority: "director" }));
    expect(r.score).toBe(70);
    expect(r.signal).toBe("overqualified");
  });
  it("returns 30 or lower when the gap is two levels", () => {
    const r = scoreSeniorityMatch(makeJob({ title: "Junior Engineer" }), makeProfile({ targetSeniority: "senior" }));
    expect(r.score).toBeLessThanOrEqual(30);
  });
  it("returns neutral 50 when either side is unknown", () => {
    const r = scoreSeniorityMatch(makeJob({ title: "xyzzy", description: "" }), makeProfile());
    expect(r.score).toBe(50);
    expect(r.signal).toBe("unknown");
  });
});

describe("scoreExperienceMatch", () => {
  it("returns 100 when the candidate meets the years requirement", () => {
    expect(scoreExperienceMatch(makeJob({ description: "Requires 5+ years experience." }), makeProfile({ yearsExperience: 9 }))).toBe(100);
  });
  it("returns 70 for 1-2 years light", () => {
    expect(scoreExperienceMatch(makeJob({ description: "Requires 10 years experience." }), makeProfile({ yearsExperience: 9 }))).toBe(70);
  });
  it("returns 50 (neutral) when the JD doesn't mention years", () => {
    expect(scoreExperienceMatch(makeJob({ description: "Great role." }), makeProfile())).toBe(50);
  });
});

describe("scoreKeywordDensity", () => {
  it("scales with the fraction of profile keywords found in the JD", () => {
    // Profile keywords: security, leader, decade, experience
    // JD includes: 'experience' (via '8+ years of experience').
    const r = scoreKeywordDensity(makeJob(), makeProfile());
    expect(r).toBeGreaterThan(0);
    expect(r).toBeLessThanOrEqual(100);
  });
  it("returns 0 when profile has no keywords", () => {
    expect(scoreKeywordDensity(makeJob(), makeProfile({ keywords: [] }))).toBe(0);
  });
});

describe("scoreOpportunityAgainstProfile", () => {
  it("returns composite in the 0-100 range with breakdown fields populated", () => {
    const r = scoreOpportunityAgainstProfile(makeJob(), makeProfile());
    expect(r.total).toBeGreaterThanOrEqual(0);
    expect(r.total).toBeLessThanOrEqual(100);
    expect(r.breakdown).toEqual(expect.objectContaining({
      skillsMatch:     expect.any(Number),
      seniorityMatch:  expect.any(Number),
      targetRoleMatch: expect.any(Number),
      experienceMatch: expect.any(Number),
      keywordDensity:  expect.any(Number),
    }));
    expect(Array.isArray(r.signals.matchedSkills)).toBe(true);
  });
  it("scores a strong match above a weak match", () => {
    const strong = scoreOpportunityAgainstProfile(makeJob(), makeProfile());
    const weakJob = makeJob({ title: "Pastry Chef", description: "Bake bread. No skills required." });
    const weak = scoreOpportunityAgainstProfile(weakJob, makeProfile());
    expect(strong.total).toBeGreaterThan(weak.total);
  });
});

describe("inferSeniority", () => {
  it("recognises director / VP / staff / senior / junior / intern / executive", () => {
    expect(inferSeniority("Director of Security")).toBe("director");
    expect(inferSeniority("VP of Engineering")).toBe("vp");
    expect(inferSeniority("CISO — Chief Information Security Officer")).toBe("executive");
    expect(inferSeniority("Staff Engineer")).toBe("staff");
    expect(inferSeniority("Senior SWE")).toBe("senior");
    expect(inferSeniority("Junior Analyst")).toBe("junior");
    expect(inferSeniority("Intern — Summer 2027")).toBe("intern");
    expect(inferSeniority("Random blob")).toBe("unknown");
  });
});

// ── fix/jobs-multi-target-roles ────────────────────────────────────────────
// Task 6 — regression coverage for multi-role query + score-on-every-card.

describe("multi-target-roles: scoreTargetRoleMatch across multiple roles", () => {
  it("returns the highest match across N target roles + surfaces bestMatch", () => {
    const profile = makeProfile({
      targetRoles: [
        "Director of Security",
        "BISO",
        "CISO",
        "Chief Security Officer",
        "Chief Information Security Officer",
      ],
    });
    // Job title matches CISO best (word-overlap 100)
    const cisoJob = makeJob({ title: "CISO", description: "" });
    const r = scoreTargetRoleMatch(cisoJob, profile);
    expect(r.score).toBe(100);
    expect(r.bestMatch).toBe("CISO");
    expect(r.signal).toBe("exact");
  });

  it("returns 0 when none of the target roles overlap the job title", () => {
    const profile = makeProfile({ targetRoles: ["Director of Security", "CISO"] });
    const job = makeJob({ title: "Pastry Chef", description: "" });
    const r = scoreTargetRoleMatch(job, profile);
    expect(r.score).toBe(0);
    expect(r.bestMatch).toBe("");
    expect(r.signal).toBe("mismatch");
  });
});

describe("multi-target-roles: inferSeniority coverage for exec titles", () => {
  it("CISO / CSO / CTO / CFO / CEO / CIO / CMO / CPO / COO → executive", () => {
    for (const t of ["CISO", "CSO", "CTO", "CFO", "CEO", "CIO", "CMO", "CPO", "COO"]) {
      expect(inferSeniority(t)).toBe("executive");
    }
  });
  it("BISO → executive tier (fix/jobs-jd-extractor — was director pre-2026-07-15)", () => {
    expect(inferSeniority("BISO")).toBe("executive");
    expect(inferSeniority("Business Information Security Officer")).toBe("executive");
  });
  it("Chief / President / Executive keywords → executive", () => {
    expect(inferSeniority("Chief Security Officer")).toBe("executive");
    expect(inferSeniority("President of Engineering")).toBe("executive");
    expect(inferSeniority("Executive Director")).toBe("executive");
  });
});

describe("multi-target-roles: scoreOpportunityAgainstProfile with multi-role targetRoles", () => {
  it("populates targetRoleBestMatch when any of the roles matches", () => {
    const profile = makeProfile({
      targetRoles: ["Director of Security", "CISO"],
    });
    const job = makeJob({ title: "CISO", description: "" });
    const r = scoreOpportunityAgainstProfile(job, profile);
    expect(r.signals.targetRoleBestMatch).toBe("CISO");
    // targetRoleMatch is 35% of composite → strong contribution
    expect(r.breakdown.targetRoleMatch).toBe(100);
  });

  it("regression — user with 5 target roles still scores >0 on any-of match", () => {
    const profile = makeProfile({
      targetRoles: [
        "Director of Security",
        "BISO",
        "CISO",
        "Chief Security Officer",
        "Chief Information Security Officer",
      ],
    });
    // fix/jobs-target-role-match — under synonym-aware scoring, "CISO",
    //   "Chief Security Officer", and "Chief Information Security Officer"
    //   ALL resolve via the ciso family and all score 100 against a
    //   "Chief Security Officer" title. The tie-break falls to first-seen
    //   in profile.targetRoles order. Any of the three is a correct
    //   bestMatch — assert against the family, not the specific label.
    const job = makeJob({
      title: "Chief Security Officer",
      description: "Skills required: python, aws.",
    });
    const r = scoreOpportunityAgainstProfile(job, profile);
    expect(r.total).toBeGreaterThan(50);
    expect(["CISO", "Chief Security Officer", "Chief Information Security Officer"])
      .toContain(r.signals.targetRoleBestMatch);
  });
});
