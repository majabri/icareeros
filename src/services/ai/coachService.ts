/**
 * iCareerOS — Coach Service (Stage 5 of Career OS)
 * Provides accountability, feedback, and preparation coaching.
 *
 * Calls:
 *   - generate-interview-prep (interview readiness via supabase.functions.invoke)
 *   - rewrite-resume (resume optimisation via supabase.functions.invoke)
 */

import { createClient } from "@/lib/supabase";
import { eventLogger } from "@/orchestrator/eventLogger";
import type { EvaluationResult } from "./evaluateService";
import type { AdviceResult } from "./adviseService";

export type CoachingFocus = "interview_prep" | "resume_polish" | "both";

export interface InterviewPrepResult {
  practiceQuestions: string[];
  keyTalkingPoints: string[];
  weaknessesToAddress: string[];
  estimatedReadinessScore: number; // 0–100
}

export interface ResumeInsights {
  score: number;         // 0–100
  suggestions: string[];
  keywordsAdded: string[];
  sectionsImproved: string[];
}

export interface CoachResult {
  focus: CoachingFocus;
  interviewPrep?: InterviewPrepResult;
  resumeInsights?: ResumeInsights;
  actionItems: string[];
  nextCheckInDays: number;
  summary: string;
}

export async function runCoachingSession(
  userId: string,
  cycleId: string,
  evaluation: EvaluationResult,
  advice: AdviceResult,
  focus: CoachingFocus = "both",
): Promise<CoachResult> {
  const supabase = createClient();
  const result: Partial<CoachResult> = { focus, actionItems: [], nextCheckInDays: 7 };

  // ── Interview prep ──────────────────────────────────────────────
  if (focus === "interview_prep" || focus === "both") {
    await eventLogger.logAiCall(userId, cycleId, "generate-interview-prep", "started");
    const { data: prepData, error: prepError } = await supabase.functions.invoke(
      "generate-interview-prep",
      {
        body: {
          user_id: userId,
          cycle_id: cycleId,
          career_level: evaluation.careerLevel,
          target_roles: advice.recommendedPaths.map((p) => p.title),
          skills: evaluation.skills,
          gaps: evaluation.gaps,
        },
      },
    );

    if (prepError) {
      await eventLogger.logAiCall(userId, cycleId, "generate-interview-prep", "failed", {
        error: prepError.message,
      });
      throw new Error(`runCoachingSession (interview prep) failed: ${prepError.message}`);
    }

    result.interviewPrep = {
      practiceQuestions: prepData?.practice_questions ?? [],
      keyTalkingPoints: prepData?.key_talking_points ?? [],
      weaknessesToAddress: prepData?.weaknesses ?? [],
      estimatedReadinessScore: prepData?.readiness_score ?? 50,
    };

    await eventLogger.logAiCall(userId, cycleId, "generate-interview-prep", "completed", {
      questionCount: result.interviewPrep.practiceQuestions.length,
      readinessScore: result.interviewPrep.estimatedReadinessScore,
    });
  }

  // ── Resume polish ───────────────────────────────────────────────
  if (focus === "resume_polish" || focus === "both") {
    await eventLogger.logAiCall(userId, cycleId, "rewrite-resume", "started");
    const { data: resumeData, error: resumeError } = await supabase.functions.invoke(
      "rewrite-resume",
      {
        body: {
          user_id: userId,
          cycle_id: cycleId,
          target_roles: advice.recommendedPaths.map((p) => p.title),
          mode: "optimize",
        },
      },
    );

    if (resumeError) {
      await eventLogger.logAiCall(userId, cycleId, "rewrite-resume", "failed", {
        error: resumeError.message,
      });
      throw new Error(`runCoachingSession (resume) failed: ${resumeError.message}`);
    }

    result.resumeInsights = {
      score: resumeData?.score ?? 0,
      suggestions: resumeData?.suggestions ?? [],
      keywordsAdded: resumeData?.keywords_added ?? [],
      sectionsImproved: resumeData?.sections_improved ?? [],
    };

    await eventLogger.logAiCall(userId, cycleId, "rewrite-resume", "completed", {
      resumeScore: result.resumeInsights.score,
      suggestionCount: result.resumeInsights.suggestions.length,
    });
  }

  result.actionItems = [
    ...(result.interviewPrep?.weaknessesToAddress.slice(0, 2) ?? []),
    ...(result.resumeInsights?.suggestions.slice(0, 2) ?? []),
  ];
  result.summary = `Coaching complete. Focus: ${focus}. ${result.actionItems.length} action items generated.`;

  return result as CoachResult;
}
