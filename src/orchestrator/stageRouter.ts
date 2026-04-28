/**
 * iCareerOS — Stage Router
 * Routes each Career OS stage to the appropriate AI service.
 * Previous stage results are loaded server-side inside each API route for
 * security and consistency (client cannot tamper with prior stage data).
 */

import { createClient } from "@/lib/supabase";
import type { CareerOsStage } from "./careerOsOrchestrator";
import {
  evaluateCareerProfile,
  generateAdvice,
  generateLearningPlan,
  triggerAction,
  runCoachingSession,
  recordAchievement,
} from "@/services/ai";

export interface RouteResult {
  success: boolean;
  meta?: Record<string, unknown>;
  error?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Load the notes (stored result) from a completed stage.
 * Returns null if the stage hasn't completed or has no notes.
 */
async function loadStageNotes<T>(
  userId: string,
  cycleId: string,
  stage: CareerOsStage,
): Promise<T | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("career_os_stages")
    .select("notes")
    .eq("user_id", userId)
    .eq("cycle_id", cycleId)
    .eq("stage", stage)
    .eq("status", "completed")
    .maybeSingle();

  return (data?.notes as T) ?? null;
}

/**
 * Persist a stage result to career_os_stages.notes for downstream stages.
 */
async function saveStageNotes(
  userId: string,
  cycleId: string,
  stage: CareerOsStage,
  notes: Record<string, unknown>,
): Promise<void> {
  const supabase = createClient();
  await supabase
    .from("career_os_stages")
    .update({ notes })
    .eq("user_id", userId)
    .eq("cycle_id", cycleId)
    .eq("stage", stage);
}

// ── Stage handlers ─────────────────────────────────────────────────────────

async function routeEvaluate(userId: string, cycleId: string): Promise<RouteResult> {
  const result = await evaluateCareerProfile(userId, cycleId);
  await saveStageNotes(userId, cycleId, "evaluate", result as unknown as Record<string, unknown>);
  return {
    success: true,
    meta: {
      skillCount: result.skills.length,
      gapCount: result.gaps.length,
      marketFitScore: result.marketFitScore,
      careerLevel: result.careerLevel,
    },
  };
}

async function routeAdvise(userId: string, cycleId: string): Promise<RouteResult> {
  // Evaluate notes are fetched server-side inside /api/career-os/advise.
  // If evaluate hasn't completed the route returns 422 and this throws.
  const result = await generateAdvice(userId, cycleId);
  await saveStageNotes(userId, cycleId, "advise", result as unknown as Record<string, unknown>);
  return {
    success: true,
    meta: {
      pathCount: result.recommendedPaths.length,
      timelineWeeks: result.timelineWeeks,
      actionCount: result.nextActions.length,
    },
  };
}

async function routeLearn(userId: string, cycleId: string): Promise<RouteResult> {
  // Evaluate + Advise notes are fetched server-side inside /api/career-os/learn.
  // If either stage hasn't completed the route returns 422 and this throws.
  const result = await generateLearningPlan(userId, cycleId);
  await saveStageNotes(userId, cycleId, "learn", result as unknown as Record<string, unknown>);
  return {
    success: true,
    meta: {
      resourceCount: result.resources.length,
      weeklyHoursNeeded: result.weeklyHoursNeeded,
      estimatedWeeks: result.estimatedCompletionWeeks,
    },
  };
}

async function routeAct(userId: string, cycleId: string): Promise<RouteResult> {
  // Evaluate, Advise, and Learn notes are fetched server-side inside /api/career-os/act.
  // If any prerequisite stage hasn't completed the route returns 422 and this throws.
  const result = await triggerAction(userId, cycleId);
  await saveStageNotes(userId, cycleId, "act", result as unknown as Record<string, unknown>);
  return {
    success: true,
    meta: {
      queryCount: result.jobSearchQueries.length,
      networkingTargetCount: result.networkingTargets.length,
      weeklyApplicationTarget: result.weeklyApplicationTarget,
    },
  };
}

async function routeCoach(userId: string, cycleId: string): Promise<RouteResult> {
  // Evaluate + Advise notes are fetched server-side inside /api/career-os/coach.
  // If either stage hasn't completed the route returns 422 and this throws.
  const result = await runCoachingSession(userId, cycleId);
  await saveStageNotes(userId, cycleId, "coach", result as unknown as Record<string, unknown>);
  return {
    success: true,
    meta: {
      interviewReadiness: result.interviewPrep.estimatedReadinessScore,
      resumeScore: result.resumeInsights.score,
      actionItemCount: result.actionItems.length,
    },
  };
}

async function routeAchieve(userId: string, cycleId: string): Promise<RouteResult> {
  // Default milestone: cycle completion. Callers can override by calling achieveService directly.
  const result = await recordAchievement(userId, cycleId, "goal_completed");
  await saveStageNotes(userId, cycleId, "achieve", result as unknown as Record<string, unknown>);
  return {
    success: true,
    meta: {
      milestoneType: result.milestoneType,
      notificationSent: result.notificationSent,
      cycleReadyToComplete: result.cycleReadyToComplete,
      achievedAt: result.achievedAt,
    },
  };
}

// ── Router ─────────────────────────────────────────────────────────────────

const handlers: Record<CareerOsStage, (u: string, c: string) => Promise<RouteResult>> = {
  evaluate: routeEvaluate,
  advise:   routeAdvise,
  learn:    routeLearn,
  act:      routeAct,
  coach:    routeCoach,
  achieve:  routeAchieve,
};

export const stageRouter = {
  async route(userId: string, cycleId: string, stage: CareerOsStage): Promise<RouteResult> {
    const handler = handlers[stage];
    if (!handler) {
      return { success: false, error: `Unknown stage: ${stage}` };
    }
    try {
      return await handler(userId, cycleId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  },
};
