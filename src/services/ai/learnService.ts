/**
 * iCareerOS — Learn Service (Stage 3 of Career OS)
 * Generates personalised learning recommendations: courses, certifications, resources.
 *
 * Calls: POST /api/career-os/learn (server-side Next.js route → Claude Sonnet)
 * ANTHROPIC_API_KEY stays server-side; this module only calls the local API route.
 */

import { eventLogger } from "@/orchestrator/eventLogger";

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
): Promise<LearnResult> {
  await eventLogger.logAiCall(userId, cycleId, "generate-learning-plan", "started");

  const res = await fetch("/api/career-os/learn", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cycle_id: cycleId }),
    credentials: "include",
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    await eventLogger.logAiCall(userId, cycleId, "generate-learning-plan", "failed", {
      error: err.error,
      status: res.status,
    });
    throw new Error("generateLearningPlan failed: " + (err.error ?? res.statusText));
  }

  const result = (await res.json()) as LearnResult;

  await eventLogger.logAiCall(userId, cycleId, "generate-learning-plan", "completed", {
    resourceCount: result.resources.length,
    weeklyHoursNeeded: result.weeklyHoursNeeded,
    estimatedCompletionWeeks: result.estimatedCompletionWeeks,
  });

  return result;
}
