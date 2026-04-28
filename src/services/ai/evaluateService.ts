/**
 * iCareerOS — Evaluate Service (Stage 1 of Career OS)
 * Assesses the user's current career profile: skills, gaps, and market fit.
 *
 * Calls: extract-profile-fields edge fn
 * Full implementation: Week 3
 */

import { createClient } from "@/lib/supabase";
import { eventLogger } from "@/orchestrator/eventLogger";

export interface EvaluationResult {
  skills: string[];
  gaps: string[];
  marketFitScore: number;       // 0–100
  careerLevel: string;
  recommendedNextStage: string;
  summary: string;
}

export async function evaluateCareerProfile(
  userId: string,
  cycleId: string,
): Promise<EvaluationResult> {
  const supabase = createClient();

  await eventLogger.logAiCall(userId, cycleId, "extract-profile-fields", "started");

  const { data, error } = await supabase.functions.invoke("extract-profile-fields", {
    body: { user_id: userId, cycle_id: cycleId },
  });

  if (error) {
    await eventLogger.logAiCall(userId, cycleId, "extract-profile-fields", "failed", {
      error: error.message,
    });
    throw new Error(`evaluateCareerProfile failed: ${error.message}`);
  }

  const result: EvaluationResult = {
    skills: data?.skills ?? [],
    gaps: data?.gaps ?? [],
    marketFitScore: data?.market_fit_score ?? 0,
    careerLevel: data?.career_level ?? "unknown",
    recommendedNextStage: "advise",
    summary: data?.summary ?? "",
  };

  await eventLogger.logAiCall(userId, cycleId, "extract-profile-fields", "completed", {
    skillCount: result.skills.length,
    gapCount: result.gaps.length,
    marketFitScore: result.marketFitScore,
  });

  return result;
}
