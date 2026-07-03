/**
 * feat/jobs-for-you-curator Task 8 — curator regression tests.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("@/services/scoring/profileExtractor", () => ({
  extractUserProfile: vi.fn(async () => ({
    skills: [], targetRoles: [], targetSeniority: "unknown",
    currentTitle: "", yearsExperience: 0, summary: "", keywords: [],
  })),
}));

import { curateForYou } from "../forYouCurator";

describe("curateForYou", () => {
  it("returns empty tiers when profile has no target_roles", async () => {
    // Minimal supabase stub — should never be reached because early-return.
    const supabase = {} as unknown as import("@supabase/supabase-js").SupabaseClient;
    const r = await curateForYou("u1", supabase);
    expect(r.strongMatch).toEqual([]);
    expect(r.worthConsidering).toEqual([]);
    expect(r.stretch).toEqual([]);
    expect(r.totalCandidates).toBe(0);
    expect(r.tierExplanations.strongMatch).toBe("");
  });
});
