/**
 * Billing component unit tests
 *
 * Phase 5 — 4-tier model (free / starter / standard / pro).
 * Pricing per COWORK-BRIEF-phase5-v1.md:
 *   Starter  $9.99/mo  ($6.49/mo  annual)
 *   Standard $18.99/mo ($12.34/mo annual)
 *   Pro      $29.99/mo ($19.49/mo annual)
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("@/services/billing/subscriptionService", () => ({
  getSubscription:       vi.fn().mockResolvedValue(null),
  createCheckoutSession: vi.fn().mockResolvedValue(null),
  getBillingPortalUrl:   vi.fn().mockResolvedValue(null),
  cancelSubscription:    vi.fn().mockResolvedValue(false),
  getFoundingStatus:     vi.fn().mockResolvedValue({ available: false, seatsRemaining: 0 }),
  canAccessFeature:      vi.fn().mockResolvedValue(true),
  getCurrentPlan:        vi.fn().mockResolvedValue("free"),
  isOnPaidPlan:          vi.fn().mockResolvedValue(false),
}));

import {
  PLAN_LIMITS,
  PLAN_PRICES,
  PLAN_ORDER,
  ADDON_PRICES,
  isPaidPlan,
  isUpgrade,
} from "@/services/billing/types";
import type { SubscriptionPlan } from "@/services/billing/types";

describe("PLAN_LIMITS — 4-tier model", () => {
  it("free: 3 cycles, no AI coach, 0 cover letters, 0 coach sessions, 2 briefs", () => {
    expect(PLAN_LIMITS.free.maxCycles).toBe(3);
    expect(PLAN_LIMITS.free.aiCoach).toBe(false);
    expect(PLAN_LIMITS.free.advancedMatch).toBe(false);
    expect(PLAN_LIMITS.free.prioritySupport).toBe(false);
    expect(PLAN_LIMITS.free.coverLettersPerMonth).toBe(0);
    expect(PLAN_LIMITS.free.mockInterviews).toBe(false);
    expect(PLAN_LIMITS.free.coachSessionsPerMonth).toBe(0);
    expect(PLAN_LIMITS.free.coachBriefsPerMonth).toBe(2);
  });

  it("starter: unlimited cycles, AI coach, 2 cover letters, 5 coach sessions, 5 briefs", () => {
    expect(PLAN_LIMITS.starter.maxCycles).toBe(-1);
    expect(PLAN_LIMITS.starter.aiCoach).toBe(true);
    expect(PLAN_LIMITS.starter.coverLettersPerMonth).toBe(2);
    expect(PLAN_LIMITS.starter.coachSessionsPerMonth).toBe(5);
    expect(PLAN_LIMITS.starter.coachBriefsPerMonth).toBe(5);
    expect(PLAN_LIMITS.starter.prioritySupport).toBe(false);
  });

  it("standard: unlimited cycles, AI coach, 5 cover letters, 10 coach sessions, 10 briefs", () => {
    expect(PLAN_LIMITS.standard.maxCycles).toBe(-1);
    expect(PLAN_LIMITS.standard.aiCoach).toBe(true);
    expect(PLAN_LIMITS.standard.coverLettersPerMonth).toBe(5);
    expect(PLAN_LIMITS.standard.coachSessionsPerMonth).toBe(10);
    expect(PLAN_LIMITS.standard.coachBriefsPerMonth).toBe(10);
    expect(PLAN_LIMITS.standard.prioritySupport).toBe(false);
  });

  it("pro: unlimited everything, priority support", () => {
    expect(PLAN_LIMITS.pro.maxCycles).toBe(-1);
    expect(PLAN_LIMITS.pro.aiCoach).toBe(true);
    expect(PLAN_LIMITS.pro.coverLettersPerMonth).toBe(-1);
    expect(PLAN_LIMITS.pro.coachSessionsPerMonth).toBe(-1);
    expect(PLAN_LIMITS.pro.coachBriefsPerMonth).toBe(-1);
    expect(PLAN_LIMITS.pro.prioritySupport).toBe(true);
  });
});

describe("PLAN_PRICES — locked Phase 5 numbers", () => {
  it("free is zero", () => {
    expect(PLAN_PRICES.free.monthly).toBe(0);
    expect(PLAN_PRICES.free.annualPerMonth).toBe(0);
    expect(PLAN_PRICES.free.annualTotal).toBe(0);
  });

  it("starter: $9.99/mo, $6.49/mo annual, $77.88 annual total", () => {
    expect(PLAN_PRICES.starter.monthly).toBe(9.99);
    expect(PLAN_PRICES.starter.annualPerMonth).toBe(6.49);
    expect(PLAN_PRICES.starter.annualTotal).toBe(77.88);
  });

  it("standard: $18.99/mo, $12.34/mo annual, $148.08 annual total", () => {
    expect(PLAN_PRICES.standard.monthly).toBe(18.99);
    expect(PLAN_PRICES.standard.annualPerMonth).toBe(12.34);
    expect(PLAN_PRICES.standard.annualTotal).toBe(148.08);
  });

  it("pro: $29.99/mo, $19.49/mo annual, $233.88 annual total", () => {
    expect(PLAN_PRICES.pro.monthly).toBe(29.99);
    expect(PLAN_PRICES.pro.annualPerMonth).toBe(19.49);
    expect(PLAN_PRICES.pro.annualTotal).toBe(233.88);
  });

  it("annual gives ~35% off for every paid tier", () => {
    const paid: Exclude<SubscriptionPlan, "free">[] = ["starter", "standard", "pro"];
    for (const p of paid) {
      const fullYear = PLAN_PRICES[p].monthly * 12;
      expect(PLAN_PRICES[p].annualTotal).toBeLessThan(fullYear);
      // Roughly 35% off — annualTotal ≈ 0.65 × fullYear, allow a 5% band
      expect(PLAN_PRICES[p].annualTotal / fullYear).toBeGreaterThan(0.6);
      expect(PLAN_PRICES[p].annualTotal / fullYear).toBeLessThan(0.7);
    }
  });
});

describe("ADDON_PRICES — one-time SKUs", () => {
  it("Sprint = $29 one-time", () => {
    expect(ADDON_PRICES.sprint.amount).toBe(29);
  });
  it("Interview Week = $19 one-time", () => {
    expect(ADDON_PRICES.interview_week.amount).toBe(19);
  });
  it("Negotiation Pack = $19 one-time", () => {
    expect(ADDON_PRICES.negotiation_pack.amount).toBe(19);
  });
  it("Founding Lifetime = $89 one-time", () => {
    expect(ADDON_PRICES.founding_lifetime.amount).toBe(89);
  });
});

describe("PLAN_ORDER + isUpgrade + isPaidPlan", () => {
  it("PLAN_ORDER has all four tiers in price order", () => {
    expect(PLAN_ORDER).toEqual(["free", "starter", "standard", "pro"]);
  });

  it("isPaidPlan is false only for free", () => {
    expect(isPaidPlan("free")).toBe(false);
    expect(isPaidPlan("starter")).toBe(true);
    expect(isPaidPlan("standard")).toBe(true);
    expect(isPaidPlan("pro")).toBe(true);
  });

  it("isUpgrade respects tier ordering", () => {
    expect(isUpgrade("free", "starter")).toBe(true);
    expect(isUpgrade("free", "pro")).toBe(true);
    expect(isUpgrade("starter", "standard")).toBe(true);
    expect(isUpgrade("standard", "pro")).toBe(true);
    expect(isUpgrade("pro", "starter")).toBe(false);
    expect(isUpgrade("pro", "pro")).toBe(false);
    expect(isUpgrade("starter", "starter")).toBe(false);
  });
});

describe("UpgradeCTA visibility logic", () => {
  function shouldShowUpgrade(
    currentPlan: SubscriptionPlan,
    targetPlan: SubscriptionPlan,
  ): boolean {
    return PLAN_ORDER.indexOf(currentPlan) < PLAN_ORDER.indexOf(targetPlan);
  }

  it("free user sees all three paid upgrades", () => {
    expect(shouldShowUpgrade("free", "starter")).toBe(true);
    expect(shouldShowUpgrade("free", "standard")).toBe(true);
    expect(shouldShowUpgrade("free", "pro")).toBe(true);
  });

  it("starter user sees standard and pro", () => {
    expect(shouldShowUpgrade("starter", "starter")).toBe(false);
    expect(shouldShowUpgrade("starter", "standard")).toBe(true);
    expect(shouldShowUpgrade("starter", "pro")).toBe(true);
  });

  it("standard user only sees pro", () => {
    expect(shouldShowUpgrade("standard", "starter")).toBe(false);
    expect(shouldShowUpgrade("standard", "standard")).toBe(false);
    expect(shouldShowUpgrade("standard", "pro")).toBe(true);
  });

  it("pro user sees no upgrades", () => {
    expect(shouldShowUpgrade("pro", "starter")).toBe(false);
    expect(shouldShowUpgrade("pro", "standard")).toBe(false);
    expect(shouldShowUpgrade("pro", "pro")).toBe(false);
  });
});
