/**
 * iCareerOS — Learn Service (Stage 3 of Career OS)
 * Generates personalised learning recommendations: courses, certifications, resources.
 *
 * Calls: learning-insights edge fn via supabase.functions.invoke()
 */

import { createClient } from "@/lib/supabase";
import { eventLogger } from "@/orchestrator/eventLogger";
import type { EvaluationResult } from "./evaluateService";
import type { AdviceResult } from "./adviseService";

export interface LearningResource {
  title: string;
  type: "course" | "certification" | "book" | "video" | "article" | "mentorship";
  provider: string;
  url?: string;
  estimatedHours: number;
  skillsCovered: string[];
  priorityScore: number; // 0–100
}

export interface LearnResult {
  resources: LearningResource[];
  topSkillGaps: string[];
  weeklyHoursNeeded: number;
  estimatedCompletionWeeks: number;
  summary: string;
}

export async function generateLearningPlan(
  userId: string,
  cycleId: string,
  evaluation: EvaluationResult,
  advice: AdviceResult,
): Promise<LearnResult> {
  const supabase = createClient();

  await eventLogger.logAiCall(userId, cycleId, "learning-insights", "started");

  const { data, error } = await supabase.functions.invoke("learning-insights", {
    body: {
      user_id: userId,
      cycle_id: cycleId,
      skill_gaps: evaluation.gaps,
      career_level: evaluation.careerLevel,
      recommended_paths: advice.recommendedPaths.map((p) => p.title),
      timeline_weeks: advice.timelineWeeks,
    },
  });

  if (error) {
    await eventLogger.logAiCall(userId, cycleId, "learning-insights", "failed", {
      error: error.message,
    });
    throw new Error(`generateLearningPlan failed: ${error.message}`);
  }

  const resources: LearningResource[] = (data?.resources ?? []).map((r: Record<string, unknown>) => ({
    title: String(r.title ?? ""),
    type: (r.type as LearningResource["type"]) ?? "course",
    provider: String(r.provider ?? ""),
    url: r.url ? String(r.url) : undefined,
    estimatedHours: Number(r.estimated_hours ?? 0),
    skillsCovered: Array.isArray(r.skills_covered) ? (r.skills_covered as string[]) : [],
    priorityScore: Number(r.priority_score ?? 50),
  }));

  const result: LearnResult = {
    resources,
    topSkillGaps: data?.top_skill_gaps ?? evaluation.gaps.slice(0, 5),
    weeklyHoursNeeded: data?.weekly_hours_needed ?? 5,
    estimatedCompletionWeeks: data?.estimated_completion_weeks ?? advice.timelineWeeks,
    summary: data?.summary ?? "",
  };

  await eventLogger.logAiCall(userId, cycleId, "learning-insights", "completed", {
    resourceCount: result.resources.length,
    weeklyHoursNeeded: result.weeklyHoursNeeded,
  });

  return result;
}
