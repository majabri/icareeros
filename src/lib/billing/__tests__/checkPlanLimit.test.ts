/**
 * Unit tests for checkPlanLimit server middleware.
 * All tests mock the Supabase client — no network required.
 */

import { describe, it, expect, vi } from "vitest";
import { checkPlanLimit } from "../checkPlanLimit";
import type { PlanFeature } from "../checkPlanLimit";

// ── Mock factory ────────────────────────────────────────────────────────────

function makeSupabaseMock(
  flagEnabled: boolean,
  sub: { plan: string; status: string } | null,
  dbError: boolean = false
) {
  const from = vi.fn((table: string) => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue(
        dbError
          ? { data: null, error: { message: "DB error" } }
          : table === "feature_flags"
          ? { data: { enabled: flagEnabled }, error: null }
          : { data: sub, error: null }
      ),
    };
    return chain;
  });
  return { from } as unknown as Parameters<typeof checkPlanLimit>[0];
}

const USER_ID = "user-abc123";

// ── Tests ───────────────────────────────────────────────────────────────────

describe("checkPlanLimit", () => {
  it("allows all features when monetization flag is off", async () => {
    const sb = makeSupabaseMock(false, { plan: "free", status: "active" });
    expect(await checkPlanLimit(sb, USER_ID, "aiCoach")).toBeNull();
  });

  it("allows aiCoach for active premium user", async () => {
    const sb = makeSupabaseMock(true, { plan: "premium", status: "active" });
    expect(await checkPlanLimit(sb, USER_ID, "aiCoach")).toBeNull();
  });

  it("allows aiCoach for active professional user", async () => {
    const sb = makeSupabaseMock(true, { plan: "professional", status: "active" });
    expect(await checkPlanLimit(sb, USER_ID, "aiCoach")).toBeNull();
  });

  it("blocks aiCoach for free user (monetization on)", async () => {
    const sb = makeSupabaseMock(true, { plan: "free", status: "active" });
    const res = await checkPlanLimit(sb, USER_ID, "aiCoach");
    expect(res).not.toBeNull();
    expect(res!.status).toBe(402);
    const json = await res!.json();
    expect(json.error).toBe("plan_limit_exceeded");
    expect(json.upgradeUrl).toBe("/settings/billing");
  });

  it("blocks coverLetters for free user", async () => {
    const sb = makeSupabaseMock(true, { plan: "free", status: "active" });
    const res = await checkPlanLimit(sb, USER_ID, "coverLetters");
    expect(res).not.toBeNull();
    expect(res!.status).toBe(402);
  });

  it("allows coverLetters for premium user", async () => {
    const sb = makeSupabaseMock(true, { plan: "premium", status: "active" });
    expect(await checkPlanLimit(sb, USER_ID, "coverLetters")).toBeNull();
  });

  it("treats canceled subscription as free — blocks aiCoach", async () => {
    const sb = makeSupabaseMock(true, { plan: "premium", status: "canceled" });
    const res = await checkPlanLimit(sb, USER_ID, "aiCoach");
    expect(res).not.toBeNull();
    const json = await res!.json();
    expect(json.currentPlan).toBe("free");
  });

  it("treats past_due subscription as free — blocks aiCoach", async () => {
    const sb = makeSupabaseMock(true, { plan: "premium", status: "past_due" });
    const res = await checkPlanLimit(sb, USER_ID, "aiCoach");
    expect(res).not.toBeNull();
  });

  it("fails open (null) on DB error", async () => {
    const sb = makeSupabaseMock(true, null, true);
    expect(await checkPlanLimit(sb, USER_ID, "aiCoach")).toBeNull();
  });

  it("professional allows all four feature types", async () => {
    const sb = makeSupabaseMock(true, { plan: "professional", status: "active" });
    const features: PlanFeature[] = ["aiCoach", "coverLetters", "mockInterviews", "advancedMatch"];
    for (const f of features) {
      expect(await checkPlanLimit(sb, USER_ID, f)).toBeNull();
    }
  });
});
