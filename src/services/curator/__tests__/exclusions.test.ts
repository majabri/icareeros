/**
 * feat/jobs-for-you-curator Task 8 — exclusions builder tests.
 */
import { describe, it, expect, vi } from "vitest";
import { buildExclusions, seniorityIndex } from "../exclusions";
import type { UserProfile } from "@/services/scoring/profileScorer";
import type { SkillsFingerprint } from "../skillsFingerprint";

function mockSupabase(negativeCompanies: string[] = []) {
  return {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                eq() {
                  return {
                    limit() {
                      return Promise.resolve({
                        data: negativeCompanies.map(c => ({ company: c, signal: "negative" })),
                      });
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  } as unknown as import("@supabase/supabase-js").SupabaseClient;
}

function fp(kw: string[]): SkillsFingerprint {
  return { coreSkills: [], inferredSkills: [], industryKeywords: [], recentTechStack: [], allKeywords: kw };
}

const cyberProfile: UserProfile = {
  skills: [], targetRoles: ["Director of Security"], targetSeniority: "director",
  currentTitle: "", yearsExperience: 9, summary: "", keywords: [],
};

describe("buildExclusions", () => {
  it("cyber security profile excludes physical security roles", async () => {
    const exc = await buildExclusions("u1", cyberProfile, fp(["cyber", "siem", "threat intelligence"]), mockSupabase());
    expect(exc.excludeTitleKeywords).toEqual(
      expect.arrayContaining(["physical security", "security guard"])
    );
  });

  it("user-dismissed companies are excluded", async () => {
    const exc = await buildExclusions("u1", cyberProfile, fp([]), mockSupabase(["BadCorp", "OldGig Inc"]));
    expect(exc.excludeCompanies).toEqual(expect.arrayContaining(["BadCorp", "OldGig Inc"]));
  });

  it("technical profile excludes pure sales roles", async () => {
    const exc = await buildExclusions("u1", cyberProfile, fp(["engineering", "sre"]), mockSupabase());
    expect(exc.excludeTitleKeywords).toEqual(
      expect.arrayContaining(["sales development representative", "account executive"])
    );
  });

  it("seniority bounds are ±1 around the target", async () => {
    const exc = await buildExclusions("u1", cyberProfile, fp([]), mockSupabase());
    // director is index 7 in SENIORITY_ORDER → 6..8 (principal..vp)
    expect(exc.minSeniorityLevel).toBe(seniorityIndex("director") - 1);
    expect(exc.maxSeniorityLevel).toBe(seniorityIndex("director") + 1);
  });
});
