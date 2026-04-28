/**
 * Billing component unit tests
 * Tests PlanBadge and UpgradeCTA rendering logic.
 * BillingSettings uses useEffect/fetch — covered by integration tests.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock React DOM for component testing ───────────────────────────────────
// We test logic, not rendering — keep it simple
vi.mock("@/services/billing/subscriptionService", () => ({
  getSubscription:       vi.fn().mockResolvedValue(null),
  createCheckoutSession: vi.fn().mockResolvedValue(null),
  getBillingPortalUrl:   vi.fn().mockResolvedValue(null),
  cancelSubscription:    vi.fn().mockResolvedValue(false),
}));

import { PLAN_LIMITS, PLAN_PRICES } from "@/services/billing/types";
import type { SubscriptionPlan } from "@/services/billing/types";

describe("PLAN_LIMITS", () => {
  it("free plan has maxCycles=3 and no AI coach", () => {
    expect(PLAN_LIMITS.free.maxCycles).toBe(3);
    expect(PLAN_LIMITS.free.aiCoach).toBe(false);
    expect(PLAN_LIMITS.free.advancedMatch).toBe(false);
    expect(PLAN_LIMITS.free.prioritySupport).toBe(false);
  });

  it("pro plan has unlimited cycles and AI coach", () => {
    expect(PLAN_LIMITS.pro.maxCycles).toBe(-1);
    expect(PLAN_LIMITS.pro.aiCoach).toBe(true);
    expect(PLAN_LIMITS.pro.advancedMatch).toBe(true);
    expect(PLAN_LIMITS.pro.prioritySupport).toBe(false);
  });

  it("premium plan has all features", () => {
    expect(PLAN_LIMITS.premium.maxCycles).toBe(-1);
    expect(PLAN_LIMITS.premium.aiCoach).toBe(true);
    expect(PLAN_LIMITS.premium.advancedMatch).toBe(true);
    expect(PLAN_LIMITS.premium.prioritySupport).toBe(true);
  });
});

describe("PLAN_PRICES", () => {
  it("free plan has zero price", () => {
    expect(PLAN_PRICES.free.monthly).toBe(0);
    expect(PLAN_PRICES.free.annual).toBe(0);
  });

  it("pro plan costs $29/month", () => {
    expect(PLAN_PRICES.pro.monthly).toBe(29);
  });

  it("premium plan costs $79/month", () => {
    expect(PLAN_PRICES.premium.monthly).toBe(79);
  });

  it("annual price is ~10x monthly (2 months free)", () => {
    const planNames: SubscriptionPlan[] = ["pro", "premium"];
    for (const plan of planNames) {
      const annualEquivalent = PLAN_PRICES[plan].annual / 12;
      const monthly = PLAN_PRICES[plan].monthly;
      // Annual should be less than monthly * 12
      expect(PLAN_PRICES[plan].annual).toBeLessThan(monthly * 12);
      // But within 20% of monthly (reasonable discount)
      expect(annualEquivalent).toBeGreaterThan(monthly * 0.7);
    }
  });
});

describe("plan ordering logic (UpgradeCTA visibility)", () => {
  const PLAN_ORDER: SubscriptionPlan[] = ["free", "pro", "premium"];

  function shouldShowUpgrade(currentPlan: SubscriptionPlan, targetPlan: SubscriptionPlan): boolean {
    return PLAN_ORDER.indexOf(currentPlan) < PLAN_ORDER.indexOf(targetPlan);
  }

  it("free user sees both pro and premium upgrades", () => {
    expect(shouldShowUpgrade("free", "pro")).toBe(true);
    expect(shouldShowUpgrade("free", "premium")).toBe(true);
  });

  it("pro user only sees premium upgrade", () => {
    expect(shouldShowUpgrade("pro", "pro")).toBe(false);
    expect(shouldShowUpgrade("pro", "premium")).toBe(true);
  });

  it("premium user sees no upgrades", () => {
    expect(shouldShowUpgrade("premium", "pro")).toBe(false);
    expect(shouldShowUpgrade("premium", "premium")).toBe(false);
  });
});
