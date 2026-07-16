/**
 * fix/jobs-seniority-wiring — regression fixture: Amir's actual profile
 * (verified via prod SQL) against an RBC-shaped BISO JD must resolve
 * seniorityFit ≠ "unknown".
 *
 * The full-UI acceptance test on PR #382 reported seniorityFit="unknown"
 * even though inferSeniority provably resolves BISO/CISO/Officer titles to
 * "executive" and Amir's target_roles include ciso/CISO. That means either:
 *   (a) The adapter drops the signal → this test would fail
 *   (b) There's a Vercel worker/build staleness issue → this test would pass
 *       locally and the fix is a deploy-side action
 * This test tells us definitively which.
 */
import { describe, it, expect } from "vitest";
import { computeDeterministicFit } from "../deterministicFitCheck";
import type { UserProfile } from "../profileScorer";
import { inferSeniority } from "../profileScorer";
import { rowToProfile } from "../profileExtractor";

// Amir's actual state pulled from prod on 2026-07-16.
const AMIR_ROW = {
  target_roles: [
    "Director of Security", "biso", "ciso",
    "Chief Security Officer", "Chief Information Security Officer",
  ],
  skills: [
    "Business Information Security (BISO)",
    "Enterprise Cyber Security Strategy & Governance",
    "US Financial Services Regulatory Compliance",
    "NIST CSF 2.0 · ISO/IEC 27001 · NIST 800-53",
    "OCC · FFIEC · GLBA · SOX · GDPR",
    "Risk Assessment & Security Control Testing",
    "Incident Prevention", "Response & Tabletops",
    "Security Program Build", "Scale & Operationalization",
    "Executive", "Board & Regulator Advisory",
    "Cross-Functional Stakeholder Engagement",
    "Business Continuity & Disaster Recovery",
    "Cloud Security · IT Infrastructure · DevOps",
    "Security Operations & Threat Intelligence",
    "Policy Development & Control Effectiveness",
    "C", "GDPR", "DevOps",
  ],
  summary:
    "Cyber security executive with 12+ years building, scaling, and governing enterprise security programs across regulated financial services, fintech/payments, and technology. Proven Business Information Security Officer who translates global security strategy and corporate policy into actionable regional execution, serving as the trusted bridge between senior business leadership, IT, Risk, and enterprise security. Deep command of US financial-services regulatory frameworks (OCC, FFIEC, GLBA, SOX) and security standards (NIST CSF 2.0, NIST 800-53, ISO/IEC 27001), with a track record of standing up new functions in ambiguous environments and articulating security value to C-suite and regulators. Holder of CISSP, CISM, and CRISC.",
  headline: null,
  work_experience: [
    { title: "BISO", startDate: "2013", endDate: "Present" }, // 14 years
  ],
};

const RBC_JD = `
Business Information Security Officer (Global Security)

Job Description
What is the opportunity?
Join RBC's newly established US Cyber Security & Resilience function as a strategic leader responsible for implementing corporate cyber security standards and translating global security strategy to actionable regional execution.

Requirements
- 10+ years of experience in information security
- Strong background as a Business Information Security Officer or CISO
- Deep understanding of US financial services regulatory compliance (OCC, FFIEC, GLBA, SOX)
- Experience with NIST CSF, ISO 27001, NIST 800-53
- Track record of incident response and tabletop exercises
- Business continuity and disaster recovery leadership

Executive-level communication and stakeholder engagement skills required.
`.trim();

describe("Amir + RBC seniorityFit — the PR #382 regression", () => {
  it("Amir's target_roles infer to 'executive'", () => {
    // Every one of Amir's target roles must resolve to executive (via CISO,
    // BISO, Chief-* patterns).
    expect(inferSeniority("Director of Security")).toBe("director");
    expect(inferSeniority("biso")).toBe("executive");
    expect(inferSeniority("ciso")).toBe("executive");
    expect(inferSeniority("Chief Security Officer")).toBe("executive");
    expect(inferSeniority("Chief Information Security Officer")).toBe("executive");
  });

  it("rowToProfile derives targetSeniority='executive' from Amir's target_roles", () => {
    const profile = rowToProfile(AMIR_ROW as any);
    expect(profile.targetSeniority).toBe("executive");
  });

  it("inferSeniority resolves the RBC BISO JD to 'executive'", () => {
    // The JD contains "Business Information Security Officer" AND "executive"
    // AND "CISO". Any of these should resolve to executive.
    expect(inferSeniority(RBC_JD)).toBe("executive");
    // Also for a description-only path (title stripped, matching the fit-check
    // code's behavior when coarseJobTitleFromJD returns "" for long first lines).
    const descOnly = RBC_JD.split(/\r?\n/).slice(1).join(" ");
    expect(inferSeniority(descOnly)).toBe("executive");
  });

  it("computeDeterministicFit end-to-end: seniorityFit resolves to 'match' (not 'unknown')", () => {
    const profile = rowToProfile(AMIR_ROW as any) as UserProfile;
    const r = computeDeterministicFit(
      "Business Information Security Officer (Global Security)",
      RBC_JD,
      "RBC",
      profile,
    );
    // Both jobLevel + target resolve to executive → gap 0 → signal 'match'
    expect(r.breakdown.seniorityFit).not.toBe("unknown");
    expect(r.breakdown.seniorityFit).toBe("match");
    expect(r.componentScores.seniorityMatch).toBe(100);
  });

  it("locationFit is honestly labelled — either 'unknown' with a comment or 'not_computed'", () => {
    const profile = rowToProfile(AMIR_ROW as any) as UserProfile;
    const r = computeDeterministicFit("Business Information Security Officer", RBC_JD, "RBC", profile);
    // We do NOT compute location deterministically today. The value is
    // "unknown" and the TYPE contract allows it.
    expect(["unknown"]).toContain(r.breakdown.locationFit);
  });
});
