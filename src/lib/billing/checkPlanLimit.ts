/**
 * Server-side plan limit enforcement for API Route Handlers.
 *
 * Usage (after auth check):
 *   const limitBlock = await checkPlanLimit(supabase, user.id, "aiCoach");
 *   if (limitBlock) return limitBlock;
 *
 * Returns null if the feature is allowed, or a 402 NextResponse if blocked.
 *
 * Fails OPEN when:
 *   - monetization_enabled feature flag is false (pre-launch default)
 *   - DB error reading subscription
 *
 * Fails CLOSED only when monetization is explicitly enabled AND the user's
 * effective plan lacks the requested feature.
 */

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PLAN_LIMITS } from "@/services/billing/types";
import type { SubscriptionPlan } from "@/services/billing/types";

export type PlanFeature =
  | "aiCoach"        // career-os/{advise,act,learn,coach,achieve}, resume/rewrite, negotiate
  | "coverLetters"   // cover-letter, outreach
  | "mockInterviews" // interview simulator
  | "advancedMatch"; // jobs/fit-scores

/**
 * Check whether userId's plan allows the requested feature.
 * Pass the already-created server Supabase client from the route handler.
 */
export async function checkPlanLimit(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  userId: string,
  feature: PlanFeature
): Promise<NextResponse | null> {
  try {
    // ── 1. Master switch ────────────────────────────────────────────────────
    // Check feature flag; if monetization is not enabled, allow everything.
    const { data: flagData } = await supabase
      .from("feature_flags")
      .select("enabled")
      .eq("flag_name", "monetization_enabled")
      .maybeSingle();

    if (!flagData?.enabled) return null; // pre-launch: open access

    // ── 2. Resolve effective plan ───────────────────────────────────────────
    const { data: sub, error: subErr } = await supabase
      .from("user_subscriptions")
      .select("plan, status")
      .eq("user_id", userId)
      .maybeSingle();

    if (subErr) {
      // DB error — fail open to avoid blocking real users
      console.warn("[checkPlanLimit] DB error, failing open:", subErr.message);
      return null;
    }

    const rawPlan = sub?.plan;
    const plan: SubscriptionPlan =
      rawPlan && ["free", "starter", "standard", "pro"].includes(rawPlan)
        ? (rawPlan as SubscriptionPlan)
        : "free";

    // Canceled or past_due subscriptions fall back to free limits
    const activeStatuses = ["active", "trialing"];
    const effectivePlan: SubscriptionPlan =
      sub?.status && activeStatuses.includes(sub.status) ? plan : "free";

    const limits = PLAN_LIMITS[effectivePlan];

    // ── 3. Feature gate ─────────────────────────────────────────────────────
    const allowed = ((): boolean => {
      switch (feature) {
        case "aiCoach":        return limits.aiCoach;
        case "coverLetters":   return limits.coverLettersPerMonth !== 0;
        case "mockInterviews": return limits.mockInterviews;
        case "advancedMatch":  return limits.advancedMatch;
        default:               return true;
      }
    })();

    if (!allowed) {
      return NextResponse.json(
        {
          error: "plan_limit_exceeded",
          message:
            "This feature requires a paid plan. Upgrade to continue.",
          feature,
          currentPlan: effectivePlan,
          upgradeUrl: "/settings/billing",
        },
        { status: 402 }
      );
    }

    return null; // allowed
  } catch (err) {
    // Unexpected error — fail open
    console.warn("[checkPlanLimit] Unexpected error, failing open:", err);
    return null;
  }
}
