/**
 * iCareerOS — Advise Service (Stage 2 of Career OS)
 * Generates AI career advice based on evaluation results.
 *
 * Calls: career-path-analysis edge fn (SSE streaming)
 * Full implementation: Week 3
 */

import { eventLogger } from "@/orchestrator/eventLogger";
import type { EvaluationResult } from "./evaluateService";

export interface AdviceResult {
  recommendedPaths: CareerPath[];
  nextActions: string[];
  timelineWeeks: number;
  summary: string;
}

export interface CareerPath {
  title: string;
  matchScore: number;   // 0–100
  requiredSkills: string[];
  gapSkills: string[];
  estimatedWeeks: number;
}

export async function generateAdvice(
  userId: string,
  cycleId: string,
  evaluation: EvaluationResult,
): Promise<AdviceResult> {
  await eventLogger.logAiCall(userId, cycleId, "career-path-analysis", "started");

  // SSE streaming — uses raw fetch per edge function invocation rule
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  try {
    const resp = await fetch(`${supabaseUrl}/functions/v1/career-path-analysis`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${anonKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        user_id: userId,
        cycle_id: cycleId,
        skills: evaluation.skills,
        gaps: evaluation.gaps,
        career_level: evaluation.careerLevel,
      }),
    });

    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    // Collect SSE chunks
    const reader = resp.body?.getReader();
    const decoder = new TextDecoder();
    let raw = "";
    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      raw += decoder.decode(value, { stream: true });
    }

    const parsed = JSON.parse(raw.replace(/^data: /gm, "").trim());

    const result: AdviceResult = {
      recommendedPaths: parsed?.paths ?? [],
      nextActions: parsed?.next_actions ?? [],
      timelineWeeks: parsed?.timeline_weeks ?? 12,
      summary: parsed?.summary ?? "",
    };

    await eventLogger.logAiCall(userId, cycleId, "career-path-analysis", "completed", {
      pathCount: result.recommendedPaths.length,
    });

    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await eventLogger.logAiCall(userId, cycleId, "career-path-analysis", "failed", {
      error: message,
    });
    throw new Error(`generateAdvice failed: ${message}`);
  }
}
