// ── Subscription types ─────────────────────────────────────────────────────
//
// Phase 5 — Stripe activation. Pricing locked per COWORK-BRIEF-phase5-v1.md.
// Four tiers: free, starter, standard, pro. The DB enum subscription_plan was
// extended in migrations subscription_plan_add_starter / _add_standard, and
// existing 'premium' rows were re-mapped to 'starter' in
// subscription_plan_realignment_data_v1. The legacy 'pro' and 'premium' enum
// labels are kept on the DB side for backwards compatibility but are never
// produced by app code from this point on.

export type SubscriptionPlan = "free" | "starter" | "standard" | "pro";
export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "paused";

export type BillingCycle = "monthly" | "annual";

export interface UserSubscription {
  id: string;
  user_id: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  created_at: string;
  updated_at: string;
}

export interface PlanLimits {
  maxCycles: number;             // -1 = unlimited
  aiCoach: boolean;
  advancedMatch: boolean;
  prioritySupport: boolean;
  coverLettersPerMonth: number;  // 0 = none, -1 = unlimited
  mockInterviews: boolean;
  coachBriefsPerMonth: number;    // -1 = unlimited; 0 = none.
  coachSessionsPerMonth: number;  // -1 = unlimited; 0 = no Mode B access.
}

export const PLAN_LIMITS: Record<SubscriptionPlan, PlanLimits> = {
  free: {
    maxCycles:           3,
    aiCoach:             false,
    advancedMatch:       false,
    prioritySupport:     false,
    coverLettersPerMonth: 0,
    mockInterviews:      false,
    coachBriefsPerMonth: 2,
    coachSessionsPerMonth: 0,
  },
  starter: {
    maxCycles:           -1,
    aiCoach:             true,
    advancedMatch:       true,
    prioritySupport:     false,
    coverLettersPerMonth: 2,
    mockInterviews:      true,
    coachBriefsPerMonth: 5,
    coachSessionsPerMonth: 5,
  },
  standard: {
    maxCycles:           -1,
    aiCoach:             true,
    advancedMatch:       true,
    prioritySupport:     false,
    coverLettersPerMonth: 5,
    mockInterviews:      true,
    coachBriefsPerMonth: 10,
    coachSessionsPerMonth: 10,
  },
  pro: {
    maxCycles:           -1,
    aiCoach:             true,
    advancedMatch:       true,
    prioritySupport:     true,
    coverLettersPerMonth: -1,
    mockInterviews:      true,
    coachBriefsPerMonth: -1,
    coachSessionsPerMonth: -1,
  },
};

// Phase 5 pricing — locked per brief.
export interface PlanPrice {
  monthly: number;
  annualPerMonth: number;
  annualTotal: number;
}

export const PLAN_PRICES: Record<SubscriptionPlan, PlanPrice> = {
  free:     { monthly: 0,      annualPerMonth: 0,     annualTotal: 0       },
  starter:  { monthly: 9.99,   annualPerMonth: 6.49,  annualTotal: 77.88   },
  standard: { monthly: 18.99,  annualPerMonth: 12.34, annualTotal: 148.08  },
  pro:      { monthly: 29.99,  annualPerMonth: 19.49, annualTotal: 233.88  },
};

export type AddonKey =
  | "sprint"
  | "interview_week"
  | "negotiation_pack"
  | "founding_lifetime";

export interface AddonPrice {
  amount: number;
  label: string;
  description: string;
}

export const ADDON_PRICES: Record<AddonKey, AddonPrice> = {
  sprint:            { amount: 29, label: "Career Sprint",      description: "One-time intensive sprint" },
  interview_week:    { amount: 19, label: "Interview Week",     description: "One-time interview prep boost" },
  negotiation_pack:  { amount: 19, label: "Negotiation Pack",   description: "One-time offer negotiation kit" },
  founding_lifetime: { amount: 89, label: "Founding Lifetime",  description: "One-time. Pro for life. Limited seats." },
};

export type FeatureKey =
  | "feature_ai_coach"
  | "feature_advanced_match"
  | "feature_unlimited_cycles"
  | "feature_mock_interviews"
  | "feature_cover_letters";

export function isPaidPlan(plan: SubscriptionPlan): boolean {
  return plan !== "free";
}

export const PLAN_ORDER: SubscriptionPlan[] = ["free", "starter", "standard", "pro"];

export function isUpgrade(from: SubscriptionPlan, to: SubscriptionPlan): boolean {
  return PLAN_ORDER.indexOf(to) > PLAN_ORDER.indexOf(from);
}
