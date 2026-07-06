/**
 * fix/jobs-per-role-scoring — Task 7 tests.
 *
 * Covers:
 *   - scoreTargetRoleMatch.allScores contains per-role scores
 *   - scoreTargetRoleMatch identifies correct bestMatch across roles
 *   - matchedRole hint (queryJobsForRole origin) boosts that role's score
 *   - dedupeByUrlKeepHighestScore keeps highest-scoring dupe
 *   - generateJobReasoning names the matched target role
 *   - Regression: 5-role user gets diverse matches
 *   - Regression: 1-role user behaves same as pre-refactor
 *   - Regression: 0-role user returns score=0 with empty allScores
 */
import { describe, it, expect } from "vitest";
import {
  scoreTargetRoleMatch,
  scoreOpportunityAgainstProfile,
  type UserProfile,
} from "@/services/scoring/profileScorer";
import type { OpportunityResult } from "@/services/opportunityTypes";
import { dedupeByUrlKeepHighestScore } from "../forYouCurator";
import { generateJobReasoning, type ScoredOpportunity } from "../explanations";

function makeJob(over: Partial<OpportunityResult> & { matchedRole?: string } = {}): OpportunityResult & { matchedRole?: string } {
  return {
    title:       "CISO",
    company:     "Acme",
    location:    "Remote",
    type:        "",
    description: "",
    url:         "https://acme.com/1",
    matchReason: "",
    ...over,
  };
}
function makeProfile(over: Partial<UserProfile> = {}): UserProfile {
  return {
    skills:          ["python", "aws"],
    targetRoles:     ["Director of Security", "CISO", "BISO"],
    targetSeniority: "director",
    currentTitle:    "Senior Security Engineer",
    yearsExperience: 9,
    summary:         "Security leader",
    keywords:        [],
    ...over,
  };
}

describe("scoreTargetRoleMatch — allScores + bestMatch (Task 3)", () => {
  it("populates allScores with one entry per targetRole", () => {
    const r = scoreTargetRoleMatch(makeJob({ title: "CISO" }), makeProfile());
    expect(Object.keys(r.allScores).sort()).toEqual(["BISO", "CISO", "Director of Security"]);
  });
  it("CISO title scores CISO highest among the 3 target roles", () => {
    const r = scoreTargetRoleMatch(makeJob({ title: "CISO" }), makeProfile());
    expect(r.bestMatch).toBe("CISO");
    expect(r.allScores.CISO).toBeGreaterThan(r.allScores.BISO);
    expect(r.allScores.CISO).toBeGreaterThan(r.allScores["Director of Security"]);
  });
  it("Director of Security title scores Director-of-Security highest", () => {
    const r = scoreTargetRoleMatch(makeJob({ title: "Director of Security" }), makeProfile());
    expect(r.bestMatch).toBe("Director of Security");
  });
  it("matchedRole hint (Task 1 tag) boosts that role in allScores", () => {
    // Job has no direct title overlap with BISO, but the query origin
    // tagged it as matched via BISO — the scorer should trust that.
    const job = makeJob({ title: "Security Officer" }); (job as OpportunityResult & { matchedRole?: string }).matchedRole = "BISO";
    const r = scoreTargetRoleMatch(job, makeProfile());
    expect(r.bestMatch).toBe("BISO");
    // score is at least the +15 hint boost
    expect(r.allScores.BISO).toBeGreaterThanOrEqual(15);
  });
});

describe("scoreTargetRoleMatch — regression (single + zero role)", () => {
  it("single-role user: bestMatch equals that role", () => {
    const r = scoreTargetRoleMatch(makeJob({ title: "CISO" }), makeProfile({ targetRoles: ["CISO"] }));
    expect(r.bestMatch).toBe("CISO");
    expect(Object.keys(r.allScores)).toEqual(["CISO"]);
  });
  it("zero-role user: score=0 + bestMatch='' + empty allScores", () => {
    const r = scoreTargetRoleMatch(makeJob(), makeProfile({ targetRoles: [] }));
    expect(r.score).toBe(0);
    expect(r.bestMatch).toBe("");
    expect(r.allScores).toEqual({});
  });
});

describe("dedupeByUrlKeepHighestScore (Task 4)", () => {
  it("returns the row with the highest fit_score on URL collision", () => {
    const rows = [
      { url: "https://a/1", fit_score: 42, tag: "adjacent" },
      { url: "https://a/1", fit_score: 85, tag: "exact" },
      { url: "https://a/2", fit_score: 55, tag: "adjacent" },
    ];
    const out = dedupeByUrlKeepHighestScore(rows);
    expect(out).toHaveLength(2);
    const collision = out.find(o => o.url === "https://a/1");
    expect(collision?.fit_score).toBe(85);
    expect(collision?.tag).toBe("exact");
  });
  it("drops rows with empty url", () => {
    const rows = [
      { url: "https://a/1", fit_score: 50 },
      { url: undefined,     fit_score: 90 },
    ];
    const out = dedupeByUrlKeepHighestScore(rows);
    expect(out).toHaveLength(1);
    expect(out[0].url).toBe("https://a/1");
  });
});

describe("generateJobReasoning (Task 5) — names the matched target role", () => {
  function scored(sigOver: Partial<import("@/services/scoring/profileScorer").ProfileFitScore["signals"]>): ScoredOpportunity {
    return {
      ...makeJob(),
      fit_score: 80,
      profileFitScore: {
        total: 80,
        breakdown: { skillsMatch: 60, seniorityMatch: 80, targetRoleMatch: 100, experienceMatch: 60, keywordDensity: 40 },
        signals: {
          matchedSkills:      ["python", "aws"],
          missingSkills:      [],
          senioritySignal:    "match",
          targetRoleSignal:   "exact",
          targetRoleBestMatch: "CISO",
          ...sigOver,
        },
      },
    };
  }
  it("exact match → 'Exact match for <role>'", () => {
    const r = generateJobReasoning(scored({}), makeProfile());
    expect(r).toContain("Exact match for CISO");
  });
  it("adjacent match → 'Adjacent to <role>' (not 'your target')", () => {
    const r = generateJobReasoning(scored({ targetRoleSignal: "adjacent", targetRoleBestMatch: "BISO" }), makeProfile());
    expect(r).toContain("Adjacent to BISO");
    expect(r).not.toContain("your target");
  });
  it("stretch → 'Stretch role for <role>'", () => {
    const r = generateJobReasoning(scored({ targetRoleSignal: "stretch", targetRoleBestMatch: "Director of Security" }), makeProfile());
    expect(r).toContain("Stretch role for Director of Security");
  });
});

describe("regression — 5-role user gets diverse matches through composite scorer", () => {
  it("scoreOpportunityAgainstProfile honours matchedRole hint end-to-end", () => {
    const profile = makeProfile({ targetRoles: [
      "Director of Security", "CISO", "BISO", "Chief Security Officer", "Chief Information Security Officer"
    ]});
    // Simulate a job returned by queryJobsForRole("BISO", ...)
    const job = makeJob({
      title: "Business Information Security Officer",
      matchedRole: "BISO",
    });
    const r = scoreOpportunityAgainstProfile(job, profile);
    expect(r.signals.targetRoleBestMatch).toBe("BISO");
    expect(r.total).toBeGreaterThan(50);
  });
});
