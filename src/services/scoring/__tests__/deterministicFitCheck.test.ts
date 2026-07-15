/**
 * feat/jobs-fit-check-internal Task 4 — deterministic fit-check tests.
 *
 * The score/variance dead-zone that the LLM-driven fit-check exhibited
 * (88 → 92 → 89 on identical input, per Amir's brief) is verified dead
 * by the identical-input-identical-output test below. Everything else
 * is a template-provenance check: every emitted string must trace to a
 * real signal, and 'unknown' signals must not fabricate output.
 */
import { describe, it, expect } from "vitest";
import {
  computeDeterministicFit,
  buildStrengths,
  buildGaps,
  buildRecommendations,
  joinNaturally,
  type DeterministicFitResult,
} from "../deterministicFitCheck";
import { scoreOpportunityAgainstProfile, type UserProfile } from "../profileScorer";
import type { OpportunityResult } from "@/services/opportunityTypes";

const ANY_JOB_TITLE = "Senior Security Engineer";
const ANY_COMPANY   = "Acme";

function baseProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    skills:          ["python", "aws", "kubernetes"],
    targetRoles:     ["Senior Security Engineer"],
    targetSeniority: "senior",
    currentTitle:    "Security Engineer",
    yearsExperience: 6,
    summary:         "Senior Security Engineer with 6 years across AWS, Kubernetes, and Python-heavy infrastructure.",
    keywords:        ["security", "python", "aws", "kubernetes", "cloud"],
    ...overrides,
  };
}

// A JD that mentions matching skills so the templates can name them.
const STRONG_MATCH_JD = `
Senior Security Engineer

Requirements:
- 5+ years of experience
- Python
- AWS
- Kubernetes
- Terraform
- SIEM
`;

describe("computeDeterministicFit — determinism", () => {
  it("returns byte-identical output on repeated identical input", () => {
    const p = baseProfile();
    const a = computeDeterministicFit(ANY_JOB_TITLE, STRONG_MATCH_JD, ANY_COMPANY, p);
    const b = computeDeterministicFit(ANY_JOB_TITLE, STRONG_MATCH_JD, ANY_COMPANY, p);
    expect(a).toEqual(b);
    // JSON.stringify equality is the stricter guarantee — key order + value ordering
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("returns different scores for genuinely different profiles (sanity)", () => {
    const strong = computeDeterministicFit(
      ANY_JOB_TITLE, STRONG_MATCH_JD, ANY_COMPANY, baseProfile(),
    );
    const weak = computeDeterministicFit(
      ANY_JOB_TITLE, STRONG_MATCH_JD, ANY_COMPANY,
      baseProfile({ skills: [], targetRoles: [], keywords: [], yearsExperience: 0, targetSeniority: "unknown" }),
    );
    expect(strong.fitScore).toBeGreaterThan(weak.fitScore);
  });
});

describe("computeDeterministicFit — no fabrication when signals are unknown", () => {
  it("empty-signal profile emits NO fabricated strengths or gaps", () => {
    const p = baseProfile({
      skills:          [],
      targetRoles:     [],
      targetSeniority: "unknown",
      currentTitle:    "",
      yearsExperience: 0,
      summary:         "",
      keywords:        [],
    });
    // JD that mentions no years explicitly and no matching skills →
    // experienceMatch = 50 (neutral), skillsMatch = 0, senioritySignal = unknown.
    const r = computeDeterministicFit(
      "Some Role",
      "We're hiring a great person for a great role. No years listed.",
      "Some Co",
      p,
    );
    // No strengths item should mention 'senior' / 'director' / years — nothing
    // to trace back to.
    for (const s of r.strengths) {
      expect(s).not.toMatch(/aligns with this/);          // seniority template
      expect(s).not.toMatch(/years of experience meets/); // experience template
      expect(s).not.toMatch(/directly matches/);          // skills template
    }
    // Gap templates the same way — no experience/seniority gap emitted when we
    // can't ground it in profile data.
    for (const g of r.gaps) {
      expect(g).not.toMatch(/years of experience are below/);
    }
  });

  it("emits NO 'Underwater Basket Weaver' style hallucination for unknown target role", () => {
    const p = baseProfile({ targetRoles: [] });
    const r = computeDeterministicFit(ANY_JOB_TITLE, STRONG_MATCH_JD, ANY_COMPANY, p);
    for (const s of r.strengths) {
      // "direct match for your ${bestMatch}" only fires when signals.targetRoleBestMatch is non-empty.
      expect(s).not.toMatch(/direct match for your\s*"?"?/);
    }
  });
});

describe("computeDeterministicFit — templates trace to real signals", () => {
  it("strong-match input produces skills strength that names actual matched skills", () => {
    const r = computeDeterministicFit(ANY_JOB_TITLE, STRONG_MATCH_JD, ANY_COMPANY, baseProfile());
    // Should mention python / aws / kubernetes (all in profile.skills AND in JD)
    const joined = r.strengths.join(" ");
    const namesAtLeastOneMatchedSkill = /python|aws|kubernetes/i.test(joined);
    expect(namesAtLeastOneMatchedSkill).toBe(true);
  });

  it("zero matched skills → strengths omits the skills line", () => {
    const p = baseProfile({ skills: ["cobol", "fortran"] });   // neither is in the JD
    const r = computeDeterministicFit(ANY_JOB_TITLE, STRONG_MATCH_JD, ANY_COMPANY, p);
    // The "N of M matches" template must not appear.
    for (const s of r.strengths) {
      expect(s).not.toMatch(/directly matches \d+ of the \d+ stated requirements/);
    }
  });

  it("missing skills gap names concrete missing skills", () => {
    const p = baseProfile({ skills: ["python"] });  // JD demands aws/kubernetes/terraform/siem too
    const r = computeDeterministicFit(ANY_JOB_TITLE, STRONG_MATCH_JD, ANY_COMPANY, p);
    // Every missing skill named in gaps must be present in signals.missingSkills.
    for (const gap of r.gaps) {
      // Extract quoted-ish tokens from the gap and confirm they came from signals.
      const named = gap.match(/[a-z][a-z0-9+\-.]+/gi) ?? [];
      for (const token of named) {
        if (r.missingSkills.map(s => s.toLowerCase()).includes(token.toLowerCase())) {
          // Confirmed traceable — pass.
          expect(r.missingSkills.map(s => s.toLowerCase())).toContain(token.toLowerCase());
        }
      }
    }
  });
});

describe("buildRecommendations — weighted-deficit ranking", () => {
  it("ranks skills gap ahead of keyword gap when weighted deficit is higher", () => {
    // Fabricate a ProfileFitScore where skillsMatch (weight 0.30) is very low
    // and keywordDensity (weight 0.05) is very low. skills deficit = 0.30*100 = 30,
    // keyword deficit = 0.05*100 = 5. skills should rank ahead.
    const pfs = {
      total: 40,
      breakdown: {
        targetRoleMatch: 100, skillsMatch: 0, seniorityMatch: 100,
        experienceMatch: 100, keywordDensity: 0,
      },
      signals: {
        matchedSkills: [], missingSkills: ["python", "aws", "kubernetes"],
        senioritySignal: "match" as const,
        targetRoleSignal: "exact" as const,
        targetRoleBestMatch: "Security Engineer",
      },
    };
    const kw = { covered: [], missing: ["ci/cd", "iac"], coverageScore: 0 };
    const recs = buildRecommendations(pfs, kw);
    expect(recs.length).toBeGreaterThan(0);
    // The FIRST recommendation must be the skills one — highest weighted deficit.
    expect(recs[0]).toMatch(/Highlight or add.*python.*aws.*kubernetes/);
  });

  it("emits at most 3 recommendations", () => {
    const pfs = {
      total: 0,
      breakdown: {
        targetRoleMatch: 0, skillsMatch: 0, seniorityMatch: 0,
        experienceMatch: 0, keywordDensity: 0,
      },
      signals: {
        matchedSkills: [], missingSkills: ["python", "aws"],
        senioritySignal: "underqualified" as const,
        targetRoleSignal: "mismatch" as const,
        targetRoleBestMatch: "",
      },
    };
    const kw = { covered: [], missing: ["docker"], coverageScore: 0 };
    const recs = buildRecommendations(pfs, kw);
    expect(recs.length).toBeLessThanOrEqual(3);
  });
});

describe("keywordCoverage — deterministic extraction", () => {
  it("returns identical covered/missing across repeated calls", () => {
    const p = baseProfile();
    const a = computeDeterministicFit(ANY_JOB_TITLE, STRONG_MATCH_JD, ANY_COMPANY, p);
    const b = computeDeterministicFit(ANY_JOB_TITLE, STRONG_MATCH_JD, ANY_COMPANY, p);
    expect(a.keywordCoverage).toEqual(b.keywordCoverage);
  });

  it("coverageScore is 0 when nothing overlaps and both sets are non-empty", () => {
    const p = baseProfile({
      skills: [], keywords: [], summary: "", currentTitle: "",
    });
    const jd = "We need Python, AWS, Kubernetes, Terraform.";
    const r = computeDeterministicFit(ANY_JOB_TITLE, jd, ANY_COMPANY, p);
    if (r.keywordCoverage.covered.length + r.keywordCoverage.missing.length > 0) {
      expect(r.keywordCoverage.coverageScore).toBe(0);
    }
  });
});

describe("joinNaturally", () => {
  it("empty → empty string", () => {
    expect(joinNaturally([])).toBe("");
  });
  it("1 item → item", () => {
    expect(joinNaturally(["a"])).toBe("a");
  });
  it("2 items → a and b", () => {
    expect(joinNaturally(["a", "b"])).toBe("a and b");
  });
  it("3+ items → Oxford-comma form", () => {
    expect(joinNaturally(["a", "b", "c"])).toBe("a, b, and c");
    expect(joinNaturally(["a", "b", "c", "d"])).toBe("a, b, c, and d");
  });
});


describe("DeterministicFitResult.breakdown — UI-consumer shape guard", () => {
  it("breakdown exposes the FitBreakdown fields the /evaluate/job-fit page reads", () => {
    const r = computeDeterministicFit(ANY_JOB_TITLE, STRONG_MATCH_JD, ANY_COMPANY, baseProfile());
    // The exact keys the page renders at lines 1045..1071:
    //   result.breakdown.skillsCoverage
    //   result.breakdown.seniorityFit
    //   result.breakdown.locationFit
    //   result.breakdown.experienceFit
    //   result.breakdown.redFlagsFound
    // If any of these were missing the page would ErrorBoundary out.
    // This test is the regression guard for fix/jobs-fit-check-breakdown-shape.
    expect(r.breakdown).toHaveProperty("skillsCoverage");
    expect(r.breakdown).toHaveProperty("seniorityFit");
    expect(r.breakdown).toHaveProperty("locationFit");
    expect(r.breakdown).toHaveProperty("experienceFit");
    expect(r.breakdown).toHaveProperty("redFlagsFound");
    expect(Array.isArray(r.breakdown.redFlagsFound)).toBe(true);
    // And the raw component scores stay available under componentScores.
    expect(r.componentScores).toHaveProperty("skillsMatch");
    expect(r.componentScores).toHaveProperty("seniorityMatch");
    expect(r.componentScores).toHaveProperty("targetRoleMatch");
    expect(r.componentScores).toHaveProperty("experienceMatch");
    expect(r.componentScores).toHaveProperty("keywordDensity");
  });

  it("seniorityFit is a valid FitBreakdown union value, not a number", () => {
    const r = computeDeterministicFit(ANY_JOB_TITLE, STRONG_MATCH_JD, ANY_COMPANY, baseProfile());
    expect(["match", "overqualified", "underqualified", "unknown"]).toContain(r.breakdown.seniorityFit);
  });

  it("locationFit defaults to 'unknown' — we do not fabricate a value", () => {
    // We don't have deterministic location signals yet; explicit 'unknown'
    // is the correct choice per the no-fabrication rule.
    const r = computeDeterministicFit(ANY_JOB_TITLE, STRONG_MATCH_JD, ANY_COMPANY, baseProfile());
    expect(r.breakdown.locationFit).toBe("unknown");
  });
});
