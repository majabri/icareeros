/**
 * POST /api/career-os/achieve
 *
 * Server-side endpoint for the Achieve stage — the final stage of the Career OS cycle.
 * Loads all prior completed stage notes, calls Claude Sonnet to generate a milestone
 * summary and next-cycle recommendations, marks the cycle ready to complete, and
 * returns an AchieveResult.
 *
 * Kept server-side so ANTHROPIC_API_KEY is never exposed to the browser.
 */

import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import Anthropic from "@anthropic-ai/sdk";
import type { AchieveResult } from "@/services/ai/achieveService";
import type { EvaluationResult } from "@/services/ai/evaluateService";
import type { AdviceResult } from "@/services/ai/adviseService";
import { checkPlanLimit } from "@/lib/billing/checkPlanLimit";

// ── Helpers ───────────────────────────────────────────────────────────────────

async function makeSupabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );
}

// ── System prompt ─────────────────────────────────────────────────────────────

const ACHIEVE_SYSTEM = `You are a senior career success coach inside iCareerOS — an AI-powered Career Operating System.

Your task: the user has completed all five prior Career OS stages (Evaluate → Advise → Learn → Act → Coach). Generate a cycle completion summary celebrating their progress and recommending their next career cycle focus.

Return ONLY valid JSON — no prose, no markdown fences — matching this exact shape:
{
  "milestoneType": "goal_completed",
  "accomplishments": [
    "Completed a full Career OS cycle from evaluation to coaching",
    "Identified and started closing 3 key skill gaps (SQL, A/B testing, system design)",
    "Built a targeted job-search plan with 5 applications per week"
  ],
  "nextCycleRecommendations": [
    {
      "focus": "Track and report on application outcomes to refine targeting",
      "priority": "high"
    },
    {
      "focus": "Complete the SQL course before next cycle's Evaluate stage",
      "priority": "high"
    },
    {
      "focus": "Expand networking to 5 warm contacts at target companies",
      "priority": "medium"
    }
  ],
  "celebrationMessage": "You've completed your first full Career OS cycle — a huge step. You now have clarity on your path, a learning plan underway, and an active job search. Keep the momentum going.",
  "cycleReadyToComplete": true,
  "summary": "Two-to-three sentence plain English summary of what the user achieved and what to focus on next."
}

Rules:
- milestoneType: always "goal_completed" for a full-cycle completion
- accomplishments: 3-5 specific things the user achieved this cycle (derive from their stage notes)
- nextCycleRecommendations: 2-4 concrete focus areas for the next cycle, each with "high" | "medium" | "low" priority
- celebrationMessage: 2-3 warm, specific sentences acknowledging their work and encouraging continuation
- cycleReadyToComplete: always true — this endpoint is only called when all stages are done
- summary: 2-3 sentences covering the cycle outcome and top next-cycle priority
Be warm, specific, and forward-looking. Derive accomplishments directly from the stage data provided.`;

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    // 1. Auth
    const supabase = await makeSupabaseServer();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── Plan limit check ──────────────────────────────────────────────────────
    const limitBlock = await checkPlanLimit(supabase, user.id, "aiCoach");
    if (limitBlock) return limitBlock;

    // 2. Parse body
    const body = await req.json().catch(() => ({})) as { cycle_id?: string };
    const cycleId: string | undefined = body?.cycle_id;

    if (!cycleId) {
      return NextResponse.json({ error: "cycle_id is required" }, { status: 400 });
    }

    // 3. Load all prior stage notes (evaluate + advise required; others optional but enriching)
    const { data: stageRows, error: stageErr } = await supabase
      .from("career_os_stages")
      .select("stage, notes")
      .eq("user_id", user.id)
      .eq("cycle_id", cycleId)
      .in("stage", ["evaluate", "advise", "learn", "act", "coach"])
      .eq("status", "completed");

    if (stageErr) {
      return NextResponse.json({ error: stageErr.message }, { status: 500 });
    }

    const evaluateRow = stageRows?.find((r) => r.stage === "evaluate");
    const adviseRow   = stageRows?.find((r) => r.stage === "advise");

    if (!evaluateRow?.notes) {
      return NextResponse.json(
        { error: "Evaluate stage must be completed before running Achieve." },
        { status: 422 }
      );
    }
    if (!adviseRow?.notes) {
      return NextResponse.json(
        { error: "Advise stage must be completed before running Achieve." },
        { status: 422 }
      );
    }

    const evaluation = evaluateRow.notes as unknown as EvaluationResult;
    const advice     = adviseRow.notes   as unknown as AdviceResult;

    // Optional enrichment from later stages
    const learnRow = stageRows?.find((r) => r.stage === "learn");
    const actRow   = stageRows?.find((r) => r.stage === "act");
    const coachRow = stageRows?.find((r) => r.stage === "coach");

    const completedStages = ["Evaluate", "Advise",
      ...(learnRow  ? ["Learn"]  : []),
      ...(actRow    ? ["Act"]    : []),
      ...(coachRow  ? ["Coach"]  : []),
    ];

    // 4. Build user message
    const topPaths = advice.recommendedPaths
      .slice(0, 2)
      .map((p) => `  • ${p.title} (match: ${p.matchScore}/100)`)
      .join("\n");

    const learnSummary = learnRow?.notes
      ? `  Learning plan: ${(learnRow.notes as Record<string,unknown>).weeklyHoursNeeded}h/week, ${(learnRow.notes as Record<string,unknown>).estimatedCompletionWeeks} weeks est.`
      : "  Learning: not yet started";

    const actSummary = actRow?.notes
      ? `  Job search: ${(actRow.notes as Record<string,unknown>).weeklyApplicationTarget} applications/week target`
      : "  Job search: not yet started";

    const coachSummary = coachRow?.notes
      ? `  Interview readiness: ${((coachRow.notes as Record<string,unknown>).interviewPrep as Record<string,unknown>)?.estimatedReadinessScore ?? "??"}/100, Resume score: ${((coachRow.notes as Record<string,unknown>).resumeInsights as Record<string,unknown>)?.score ?? "??"}/100`
      : "  Coaching: not yet completed";

    const userMessage = [
      "Completed Career OS stages: " + completedStages.join(", "),
      "",
      "Career Evaluation:",
      "  Level: " + evaluation.careerLevel,
      "  Market fit: " + evaluation.marketFitScore + "/100",
      "  Skills: " + (evaluation.skills?.join(", ") || "(none)"),
      "  Skill gaps: " + (evaluation.gaps?.join(", ") || "(none)"),
      "",
      "Career Paths Recommended:",
      topPaths,
      "  Timeline: " + advice.timelineWeeks + " weeks to role",
      "",
      "Execution Progress:",
      learnSummary,
      actSummary,
      coachSummary,
      "",
      "Generate a cycle completion celebration and next-cycle recommendations for this user.",
    ].join("\n");

    // 5. Call Claude Sonnet
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY!,
    });

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: ACHIEVE_SYSTEM,
      messages: [{ role: "user", content: userMessage }],
    });

    // 6. Parse response
    const raw = message.content[0];
    if (raw.type !== "text") {
      throw new Error("Unexpected response type from Claude");
    }

    let aiResult: Omit<AchieveResult, "milestoneRecorded" | "notificationSent" | "achievedAt">;
    try {
      aiResult = JSON.parse(raw.text) as typeof aiResult;
    } catch {
      throw new Error("Claude returned non-JSON: " + raw.text.slice(0, 200));
    }

    if (!Array.isArray(aiResult.accomplishments) || !aiResult.celebrationMessage || !aiResult.summary) {
      throw new Error("Claude response missing required fields");
    }

    const achievedAt = new Date().toISOString();

    // 7. Mark career_goals as achieved (best-effort, non-blocking)
    void supabase
      .from("career_goals")
      .update({ status: "achieved", achieved_at: achievedAt })
      .eq("user_id", user.id)
      .eq("cycle_id", cycleId)
      .eq("status", "active");

    // 8. Log event (best-effort, non-blocking)
    void supabase
      .from("career_os_event_log")
      .insert({
        user_id: user.id,
        cycle_id: cycleId,
        event_type: "cycle_complete",
        event_data: {
          function: "record-achievement",
          status: "completed",
          milestoneType: aiResult.milestoneType,
          accomplishmentCount: aiResult.accomplishments.length,
          stagesCompleted: completedStages,
        },
      });

    const result: AchieveResult = {
      ...aiResult,
      milestoneRecorded: true,
      notificationSent: false, // email notifications wired in a future sprint
      achievedAt,
    };

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("[achieve] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
