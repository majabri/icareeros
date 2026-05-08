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

// ── Plan feature lists (per-tier) ────────────────────────────────────────────
//
// Source of truth: docs/AGENT_DESIGN_PRICING_PROPOSAL_20260506_v1.2.md, Section 3.
// Rendered by <PlanCard /> on /settings/billing as checkmark lists. Grouped by
// agent so the cards read top-to-bottom in the same order as the Career OS ring.

export type FeatureGroup =
  | "Evaluate"
  | "Advise"
  | "Learn"
  | "Act"
  | "Coach"
  | "Achieve"
  | "Master / Dashboard";

export interface PlanFeature {
  group: FeatureGroup;
  text:  string;
  /**
   * Optional — when set, rendered as a faded "Coming Soon" pill instead of a
   * green checkmark. Used for the Pro tier's Human Coach line.
   */
  comingSoon?: boolean;
}

export const PLAN_FEATURES: Record<SubscriptionPlan, ReadonlyArray<PlanFeature>> = {
  free: [
    { group: "Evaluate",            text: "1 resume evaluation per month" },
    { group: "Evaluate",            text: "Basic resume feedback (grammar, spelling, formatting)" },
    { group: "Evaluate",            text: "Career level classification" },
    { group: "Advise",              text: "1 current-role validation + next-role recommendation per month" },
    { group: "Advise",              text: "1 career path shown" },
    { group: "Learn",               text: "3 skill maintenance recommendations" },
    { group: "Act",                 text: "5 job matches per month" },
    { group: "Act",                 text: "1 cover letter per month" },
    { group: "Coach",               text: "2 on-demand coaching briefs per month" },
    { group: "Achieve",             text: "Milestone list" },
    { group: "Master / Dashboard",  text: "Six-stage Career OS progress ring" },
    { group: "Master / Dashboard",  text: "Stage-aware nudges in-app" },
  ],

  starter: [
    { group: "Evaluate",            text: "3 resume evaluations per month" },
    { group: "Evaluate",            text: "Full grammar / spelling / wording polish" },
    { group: "Evaluate",            text: "LinkedIn gap analysis (headline, about, skills)" },
    { group: "Evaluate",            text: "Basic market fit score" },
    { group: "Advise",              text: "3 advise runs per month" },
    { group: "Advise",              text: "2 career path options" },
    { group: "Advise",              text: "Basic gap-to-target analysis" },
    { group: "Learn",               text: "10 skill maintenance recommendations" },
    { group: "Learn",               text: "5 target-skill gap recommendations" },
    { group: "Learn",               text: "Course links (Coursera / edX / LinkedIn Learning)" },
    { group: "Act",                 text: "Unlimited job matches" },
    { group: "Act",                 text: "Job targeting (next-role matches with gap %)" },
    { group: "Act",                 text: "5 cover letters per month" },
    { group: "Act",                 text: "3 outreach messages per month (LinkedIn DM / email)" },
    { group: "Act",                 text: "Application pipeline tracking" },
    { group: "Act",                 text: "Interview prep library" },
    { group: "Coach",               text: "5 on-demand coaching briefs per month" },
    { group: "Coach",               text: "5 interactive AI chat sessions per month (Mode B)" },
    { group: "Achieve",             text: "Milestone list + Career XP + streaks" },
    { group: "Master / Dashboard",  text: "Weekly proactive nudges (email)" },
  ],

  standard: [
    { group: "Evaluate",            text: "Unlimited resume evaluations" },
    { group: "Evaluate",            text: "Full LinkedIn optimization (not just gap analysis)" },
    { group: "Evaluate",            text: "Full market fit score" },
    { group: "Advise",              text: "Unlimited advise runs" },
    { group: "Advise",              text: "3 career path options + reasoning shown" },
    { group: "Advise",              text: "Full gap-to-target analysis" },
    { group: "Learn",               text: "Unlimited skill recommendations (current + target)" },
    { group: "Learn",               text: "Course links + time estimates + priority ranking" },
    { group: "Act",                 text: "Unlimited cover letters" },
    { group: "Act",                 text: "Resume tailoring per job" },
    { group: "Act",                 text: "Unlimited outreach drafting" },
    { group: "Act",                 text: "Unlimited mock interviews + standard feedback" },
    { group: "Act",                 text: "Salary intelligence per role / company" },
    { group: "Coach",               text: "Unlimited on-demand coaching briefs" },
    { group: "Coach",               text: "Unlimited interactive AI chat (Mode B)" },
    { group: "Achieve",             text: "Milestone list + Career XP + streaks" },
    { group: "Achieve",             text: "Cycle history + year-over-year growth report" },
    { group: "Master / Dashboard",  text: "Weekly proactive nudges + event triggers (email)" },
  ],

  pro: [
    { group: "Evaluate",            text: "Unlimited resume evaluations" },
    { group: "Evaluate",            text: "LinkedIn optimization + comparative market benchmarking" },
    { group: "Evaluate",            text: "Career level classification with market comparison" },
    { group: "Advise",              text: "Unlimited advise + salary intelligence + market demand signals" },
    { group: "Advise",              text: "3 career path options with full reasoning" },
    { group: "Learn",               text: "Unlimited skill recommendations" },
    { group: "Learn",               text: "Certification roadmap + learning schedule" },
    { group: "Learn",               text: "Market demand signals per skill" },
    { group: "Act",                 text: "Unlimited cover letters + resume tailoring" },
    { group: "Act",                 text: "Unlimited outreach drafting" },
    { group: "Act",                 text: "Unlimited mock interviews with deep feedback" },
    { group: "Act",                 text: "Salary intelligence + negotiation toolkit" },
    { group: "Act",                 text: "Advanced positioning + Interview Week triggers" },
    { group: "Coach",               text: "Unlimited on-demand coaching briefs" },
    { group: "Coach",               text: "Unlimited interactive AI chat (priority)" },
    { group: "Coach",               text: "Human Coach (Mode C)", comingSoon: true },
    { group: "Achieve",             text: "Milestone list + Career XP + streaks + cycle history" },
    { group: "Achieve",             text: "Year-over-year growth report" },
    { group: "Achieve",             text: "Shareable LinkedIn achievement cards" },
    { group: "Master / Dashboard",  text: "Daily proactive nudges + event triggers (email)" },
  ],
};

// Display order for grouped rendering inside <PlanCard />
export const FEATURE_GROUP_ORDER: ReadonlyArray<FeatureGroup> = [
  "Evaluate", "Advise", "Learn", "Act", "Coach", "Achieve", "Master / Dashboard",
];
