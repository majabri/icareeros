/**
 * iCareerOS — Evaluate Service (Stage 1 of Career OS)
 * Assesses the user's current career profile: skills, gaps, and market fit.
 *
 * Delegates to the server-side API route /api/career-os/evaluate,
 * which calls Claude API directly (ANTHROPIC_API_KEY stays server-side).
 *
 * The `extract-profile-fields` Supabase edge function is NOT deployed in the
 * icareeros project (kuneabeiwcxavvyyfjkx), so we use the Next.js API route instead.
 */

import { eventLogger } from "@/orchestrator/eventLogger";

export interface EvaluationResult {
  skills: string[];
  gaps: string[];
  marketFitScore: number;       // 0-100
  careerLevel: string;
  recommendedNextStage: string;
  summary: string;
}

export async function evaluateCareerProfile(
  userId: string,
  cycleId: string,
): Promise<EvaluationResult> {
  await eventLogger.logAiCall(userId, cycleId, "evaluate-career-profile", "started");

  const res = await fetch("/api/career-os/evaluate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, cycle_id: cycleId }),
    credentials: "include",   // send Supabase auth cookie
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    await eventLogger.logAiCall(userId, cycleId, "evaluate-career-profile", "failed", {
      error: err.error ?? "Unknown error",
      status: res.status,
    });
    throw new Error("evaluateCareerProfile failed: " + (err.error ?? res.statusText));
  }

  const result = (await res.json()) as EvaluationResult;

  await eventLogger.logAiCall(userId, cycleId, "evaluate-career-profile", "completed", {
    skillCount: result.skills.length,
    gapCount: result.gaps.length,
    marketFitScore: result.marketFitScore,
  });

  return result;
}
