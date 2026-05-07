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
  maxCycles: number;             // -1 = unlimited
  aiCoach: boolean;
  advancedMatch: boolean;
  prioritySupport: boolean;
  coverLettersPerMonth: number;  // 0 = none
  mockInterviews: boolean;
  coachBriefsPerMonth: number;    // -1 = unlimited; 0 = none. The on-demand
                                  // /api/career-os/coach-brief endpoint counts
                                  // generations against this. Free has 2/mo
                                  // even though aiCoach=false (the structured
                                  // Sonnet coach is gated separately).
  coachSessionsPerMonth: number;  // -1 = unlimited; 0 = no Mode B access.
                                  // The interactive /api/career-os/coach-session
                                  // endpoint counts NEW sessions (not messages)
                                  // against this. Free=0 (renders upgrade gate),
                                  // Premium=5/mo, Professional=unlimited.
                                  // Phase 3 — see COWORK-BRIEF-phase3-v1.md.
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
  premium: {
    maxCycles:           -1,
    aiCoach:             true,
    advancedMatch:       true,
    prioritySupport:     false,
    coverLettersPerMonth: 2,
    mockInterviews:      true,
    coachBriefsPerMonth: 5,
    coachSessionsPerMonth: 5,
  },
  professional: {
    maxCycles:           -1,
    aiCoach:             true,
    advancedMatch:       true,
    prioritySupport:     true,
    coverLettersPerMonth: 5,
    mockInterviews:      true,
    coachBriefsPerMonth: -1,
    coachSessionsPerMonth: -1,
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
