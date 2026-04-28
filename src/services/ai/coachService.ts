/**
 * iCareerOS — Coach Service (Stage 5 of Career OS)
 * Provides interview preparation, resume insights, and accountability coaching.
 *
 * Calls: POST /api/career-os/coach (server-side Next.js route → Claude Sonnet)
 * ANTHROPIC_API_KEY stays server-side; this module only calls the local API route.
 */

import { eventLogger } from "@/orchestrator/eventLogger";

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
  interviewPrep: InterviewPrepResult;
  resumeInsights: ResumeInsights;
  actionItems: string[];
  nextCheckInDays: number;
  summary: string;
  // Legacy field kept for backwards compatibility
  focus?: CoachingFocus;
}

export async function runCoachingSession(
  userId: string,
  cycleId: string,
): Promise<CoachResult> {
  await eventLogger.logAiCall(userId, cycleId, "generate-coaching-session", "started");

  const res = await fetch("/api/career-os/coach", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cycle_id: cycleId }),
    credentials: "include",
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    await eventLogger.logAiCall(userId, cycleId, "generate-coaching-session", "failed", {
      error: err.error,
      status: res.status,
    });
    throw new Error("runCoachingSession failed: " + (err.error ?? res.statusText));
  }

  const result = (await res.json()) as CoachResult;

  await eventLogger.logAiCall(userId, cycleId, "generate-coaching-session", "completed", {
    readinessScore: result.interviewPrep.estimatedReadinessScore,
    resumeScore: result.resumeInsights.score,
    actionItemCount: result.actionItems.length,
  });

  return result;
}
