/**
 * iCareerOS — Achieve Service (Stage 6 of Career OS)
 * Records career milestones and generates a cycle completion summary.
 *
 * Calls: POST /api/career-os/achieve (server-side Next.js route → Claude Sonnet)
 * ANTHROPIC_API_KEY stays server-side; this module only calls the local API route.
 */

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

export interface NextCycleRecommendation {
  focus: string;
  priority: "high" | "medium" | "low";
}

export interface AchieveResult {
  milestoneType: MilestoneType;
  milestoneRecorded: boolean;
  accomplishments: string[];
  nextCycleRecommendations: NextCycleRecommendation[];
  celebrationMessage: string;
  cycleReadyToComplete: boolean;
  notificationSent: boolean;
  achievedAt: string; // ISO timestamp
  summary: string;
}

export async function recordAchievement(
  userId: string,
  cycleId: string,
): Promise<AchieveResult> {
  await eventLogger.logAiCall(userId, cycleId, "record-achievement", "started");

  const res = await fetch("/api/career-os/achieve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cycle_id: cycleId }),
    credentials: "include",
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    await eventLogger.logAiCall(userId, cycleId, "record-achievement", "failed", {
      error: err.error,
      status: res.status,
    });
    throw new Error("recordAchievement failed: " + (err.error ?? res.statusText));
  }

  const result = (await res.json()) as AchieveResult;

  await eventLogger.logAiCall(userId, cycleId, "record-achievement", "completed", {
    milestoneType: result.milestoneType,
    accomplishmentCount: result.accomplishments.length,
    cycleReadyToComplete: result.cycleReadyToComplete,
  });

  return result;
}
