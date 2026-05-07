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

// ── LinkedIn gap analysis (Phase 4 Item 2a) ─────────────────────────────────

export interface LinkedInAnalysis {
  headlineSuggestion: string;
  aboutGaps:          string[];
  skillsToAdd:        string[];
  strengthScore:      number;  // 1-10
}

export interface LinkedInGated {
  gated:          true;
  plan:           "free";
  upgradeMessage: string;
}

export interface EvaluationResult {
  skills: string[];
  gaps: string[];
  marketFitScore: number;                          // 0-100
  careerLevel: string;
  recommendedNextStage: string;
  summary: string;
  /** Optional — present when the user has enough profile data for analysis. */
  linkedinAnalysis?: LinkedInAnalysis | LinkedInGated;
}

// ── Skills inventory assessment (Phase 4 Item 2b) ────────────────────────────

export interface SkillsAssessmentResponse {
  skill:      string;
  confidence: 1 | 2 | 3 | 4 | 5;
}

export interface SkillsAssessmentReport {
  strongSkills:     string[];   // confidence 4-5
  developingSkills: string[];   // confidence 2-3
  gapSkills:        string[];   // confidence 1
  narrative:        string;     // ~200-word AI synthesis
}

export interface SkillsAssessmentNotes {
  responses:   SkillsAssessmentResponse[];
  report:      SkillsAssessmentReport;
  completedAt: string;
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


// ── Skills assessment submission ────────────────────────────────────────────

export async function submitSkillsAssessment(
  cycleId:   string,
  responses: SkillsAssessmentResponse[],
): Promise<SkillsAssessmentReport> {
  const res = await fetch("/api/career-os/evaluate/assessment", {
    method:      "POST",
    headers:     { "Content-Type": "application/json" },
    credentials: "include",
    body:        JSON.stringify({ cycle_id: cycleId, responses }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error("submitSkillsAssessment failed: " + (err.error ?? res.statusText));
  }
  const body = (await res.json()) as { report: SkillsAssessmentReport };
  return body.report;
}
