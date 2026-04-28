/**
 * iCareerOS — Achieve Service (Stage 6 of Career OS)
 * Records career milestones and triggers the cycle completion notification.
 *
 * Calls: generate-notifications edge fn via supabase.functions.invoke()
 * Also writes directly to career_goals table to mark achieved milestones.
 */

import { createClient } from "@/lib/supabase";
import { eventLogger } from "@/orchestrator/eventLogger";

export type MilestoneType =
  | "job_offer_received"
  | "interview_passed"
  | "promotion_received"
  | "salary_increase"
  | "certification_earned"
  | "skill_acquired"
  | "role_transition"
  | "goal_completed";

export interface AchieveResult {
  milestoneRecorded: boolean;
  milestoneType: MilestoneType;
  notificationSent: boolean;
  cycleReadyToComplete: boolean;
  summary: string;
  achievedAt: string; // ISO timestamp
}

export async function recordAchievement(
  userId: string,
  cycleId: string,
  milestoneType: MilestoneType,
  details?: Record<string, unknown>,
): Promise<AchieveResult> {
  const supabase = createClient();
  const achievedAt = new Date().toISOString();

  await eventLogger.logAiCall(userId, cycleId, "record-achievement", "started", {
    milestoneType,
  });

  // ── Mark matching career_goals as achieved ─────────────────────
  await supabase
    .from("career_goals")
    .update({ status: "achieved", achieved_at: achievedAt })
    .eq("user_id", userId)
    .eq("cycle_id", cycleId)
    .eq("status", "active");

  // ── Send achievement notification ──────────────────────────────
  const { data: notifData, error: notifError } = await supabase.functions.invoke(
    "generate-notifications",
    {
      body: {
        user_id: userId,
        cycle_id: cycleId,
        type: "achievement",
        milestone_type: milestoneType,
        details: details ?? {},
        achieved_at: achievedAt,
      },
    },
  );

  if (notifError) {
    // Non-fatal: notification failure should not block cycle completion
    await eventLogger.logAiCall(userId, cycleId, "generate-notifications", "failed", {
      error: notifError.message,
    });
    console.warn("[achieveService] notification failed (non-fatal):", notifError.message);
  } else {
    await eventLogger.logAiCall(userId, cycleId, "generate-notifications", "completed", {
      notificationId: notifData?.notification_id,
    });
  }

  const result: AchieveResult = {
    milestoneRecorded: true,
    milestoneType,
    notificationSent: !notifError,
    cycleReadyToComplete: true,
    achievedAt,
    summary: `Milestone "${milestoneType}" recorded at ${achievedAt}. Cycle ready to complete and loop back to Evaluate.`,
  };

  await eventLogger.logAiCall(userId, cycleId, "record-achievement", "completed", {
    milestoneType,
    notificationSent: result.notificationSent,
  });

  return result;
}
