/**
 * iCareerOS — Advise Service (Stage 2 of Career OS)
 * Generates AI career advice based on evaluation results.
 *
 * Calls: POST /api/career-os/advise (server-side Next.js route → Claude Sonnet)
 * ANTHROPIC_API_KEY stays server-side; this module only calls the local API route.
 */

import { eventLogger } from "@/orchestrator/eventLogger";

export interface AdviceResult {
  recommendedPaths: CareerPath[];
  nextActions: string[];
  timelineWeeks: number;
  summary: string;
}

export interface CareerPath {
  title: string;
  matchScore: number; // 0-100
  requiredSkills: string[];
  gapSkills: string[];
  estimatedWeeks: number;
}

export async function generateAdvice(
  userId: string,
  cycleId: string,
): Promise<AdviceResult> {
  await eventLogger.logAiCall(userId, cycleId, "generate-advice", "started");

  const res = await fetch("/api/career-os/advise", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cycle_id: cycleId }),
    credentials: "include",
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    await eventLogger.logAiCall(userId, cycleId, "generate-advice", "failed", {
      error: err.error,
      status: res.status,
    });
    throw new Error("generateAdvice failed: " + (err.error ?? res.statusText));
  }

  const result = (await res.json()) as AdviceResult;

  await eventLogger.logAiCall(userId, cycleId, "generate-advice", "completed", {
    pathCount: result.recommendedPaths.length,
    timelineWeeks: result.timelineWeeks,
    actionCount: result.nextActions.length,
  });

  return result;
}
