// ── Subscription types ─────────────────────────────────────────────────────

export type SubscriptionPlan = "free" | "premium" | "professional";
export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "paused";

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
  maxCycles: number;           // -1 = unlimited
  aiCoach: boolean;
  advancedMatch: boolean;
  prioritySupport: boolean;
  coverLettersPerMonth: number; // 0 = none
  mockInterviews: boolean;
}

export const PLAN_LIMITS: Record<SubscriptionPlan, PlanLimits> = {
  free: {
    maxCycles:           3,
    aiCoach:             false,
    advancedMatch:       false,
    prioritySupport:     false,
    coverLettersPerMonth: 0,
    mockInterviews:      false,
  },
  premium: {
    maxCycles:           -1,
    aiCoach:             true,
    advancedMatch:       true,
    prioritySupport:     false,
    coverLettersPerMonth: 2,
    mockInterviews:      true,
  },
  professional: {
    maxCycles:           -1,
    aiCoach:             true,
    advancedMatch:       true,
    prioritySupport:     true,
    coverLettersPerMonth: 5,
    mockInterviews:      true,
  },
};

export const PLAN_PRICES: Record<SubscriptionPlan, { monthly: number; annual: number }> = {
  free:         { monthly: 0,   annual: 0    },
  premium:      { monthly: 19,  annual: 190  },   // 2 months free
  professional: { monthly: 129, annual: 1290 },   // 2 months free
};

export type FeatureKey =
  | "feature_ai_coach"
  | "feature_advanced_match"
  | "feature_unlimited_cycles"
  | "feature_mock_interviews"
  | "feature_cover_letters";
