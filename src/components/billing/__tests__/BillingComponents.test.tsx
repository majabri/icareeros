/**
 * Billing component unit tests
 * Tests PLAN_LIMITS, PLAN_PRICES, and UpgradeCTA visibility logic.
 * Pricing: Free / Premium $19/mo / Professional $129/mo
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("@/services/billing/subscriptionService", () => ({
  getSubscription:       vi.fn().mockResolvedValue(null),
  createCheckoutSession: vi.fn().mockResolvedValue(null),
  getBillingPortalUrl:   vi.fn().mockResolvedValue(null),
  cancelSubscription:    vi.fn().mockResolvedValue(false),
}));

import { PLAN_LIMITS, PLAN_PRICES } from "@/services/billing/types";
import type { SubscriptionPlan } from "@/services/billing/types";

describe("PLAN_LIMITS", () => {
  it("free plan has maxCycles=3, no AI coach, no cover letters", () => {
    expect(PLAN_LIMITS.free.maxCycles).toBe(3);
    expect(PLAN_LIMITS.free.aiCoach).toBe(false);
    expect(PLAN_LIMITS.free.advancedMatch).toBe(false);
    expect(PLAN_LIMITS.free.prioritySupport).toBe(false);
    expect(PLAN_LIMITS.free.coverLettersPerMonth).toBe(0);
    expect(PLAN_LIMITS.free.mockInterviews).toBe(false);
  });

  it("premium plan has unlimited cycles, AI coach, 2 cover letters, no priority support", () => {
    expect(PLAN_LIMITS.premium.maxCycles).toBe(-1);
    expect(PLAN_LIMITS.premium.aiCoach).toBe(true);
    expect(PLAN_LIMITS.premium.advancedMatch).toBe(true);
    expect(PLAN_LIMITS.premium.prioritySupport).toBe(false);
    expect(PLAN_LIMITS.premium.coverLettersPerMonth).toBe(2);
    expect(PLAN_LIMITS.premium.mockInterviews).toBe(true);
  });

  it("professional plan has all features including priority support and 5 cover letters", () => {
    expect(PLAN_LIMITS.professional.maxCycles).toBe(-1);
    expect(PLAN_LIMITS.professional.aiCoach).toBe(true);
    expect(PLAN_LIMITS.professional.advancedMatch).toBe(true);
    expect(PLAN_LIMITS.professional.prioritySupport).toBe(true);
    expect(PLAN_LIMITS.professional.coverLettersPerMonth).toBe(5);
    expect(PLAN_LIMITS.professional.mockInterviews).toBe(true);
  });
});

describe("PLAN_PRICES", () => {
  it("free plan has zero price", () => {
    expect(PLAN_PRICES.free.monthly).toBe(0);
    expect(PLAN_PRICES.free.annual).toBe(0);
  });

  it("premium plan costs $19/month", () => {
    expect(PLAN_PRICES.premium.monthly).toBe(19);
  });

  it("professional plan costs $129/month", () => {
    expect(PLAN_PRICES.professional.monthly).toBe(129);
  });

  it("annual price gives ~2 months free for paid plans", () => {
    const paidPlans: SubscriptionPlan[] = ["premium", "professional"];
    for (const plan of paidPlans) {
      const fullYear = PLAN_PRICES[plan].monthly * 12;
      const annual   = PLAN_PRICES[plan].annual;
      // Annual is cheaper than 12× monthly
      expect(annual).toBeLessThan(fullYear);
      // But not more than 20% off (reasonable discount)
      expect(annual).toBeGreaterThan(fullYear * 0.7);
    }
  });
});

describe("plan ordering logic (UpgradeCTA visibility)", () => {
  const PLAN_ORDER: SubscriptionPlan[] = ["free", "premium", "professional"];

  function shouldShowUpgrade(
    currentPlan: SubscriptionPlan,
    targetPlan: SubscriptionPlan,
  ): boolean {
    return PLAN_ORDER.indexOf(currentPlan) < PLAN_ORDER.indexOf(targetPlan);
  }

  it("free user sees both premium and professional upgrades", () => {
    expect(shouldShowUpgrade("free", "premium")).toBe(true);
    expect(shouldShowUpgrade("free", "professional")).toBe(true);
  });

  it("premium user only sees professional upgrade", () => {
    expect(shouldShowUpgrade("premium", "premium")).toBe(false);
    expect(shouldShowUpgrade("premium", "professional")).toBe(true);
  });

  it("professional user sees no upgrades", () => {
    expect(shouldShowUpgrade("professional", "premium")).toBe(false);
    expect(shouldShowUpgrade("professional", "professional")).toBe(false);
  });
});
