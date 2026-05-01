/**
 * POST /api/career-os/coach
 *
 * Server-side endpoint for the Coach stage.
 * Loads the authenticated user's completed Evaluate and Advise notes from
 * career_os_stages, calls Claude Sonnet to generate interview prep, resume
 * insights, and actionable coaching feedback, and returns a CoachResult.
 *
 * Kept server-side so ANTHROPIC_API_KEY is never exposed to the browser.
 */

import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createTracedClient } from "@/lib/observability/langfuse";
import type { CoachResult } from "@/services/ai/coachService";
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

const COACH_SYSTEM = `You are a senior career coach inside iCareerOS — an AI-powered Career Operating System.

Your task: given a user's career evaluation and recommended career paths, generate a targeted coaching session covering interview preparation and resume optimisation.

Return ONLY valid JSON — no prose, no markdown fences — matching this exact shape:
{
  "interviewPrep": {
    "practiceQuestions": [
      "Tell me about a time you used data to influence a product decision.",
      "How do you prioritise features when resources are constrained?"
    ],
    "keyTalkingPoints": [
      "Highlight cross-functional collaboration at your last role",
      "Quantify impact: revenue driven, users affected, or latency reduced"
    ],
    "weaknessesToAddress": [
      "Limited experience with SQL — prepare a concrete learning plan story",
      "No formal PM certification — emphasise shipped products instead"
    ],
    "estimatedReadinessScore": 65
  },
  "resumeInsights": {
    "score": 72,
    "suggestions": [
      "Add measurable outcomes to each bullet (e.g. 'increased retention by 18%')",
      "Lead with a two-line summary targeting Senior PM roles"
    ],
    "keywordsAdded": ["product roadmap", "OKR", "stakeholder alignment"],
    "sectionsImproved": ["Summary", "Experience", "Skills"]
  },
  "actionItems": [
    "Practice answering the top 3 interview questions aloud before Friday",
    "Update resume summary section to target Senior PM roles",
    "Complete one SQL exercise on Mode Analytics this week"
  ],
  "nextCheckInDays": 7,
  "summary": "Two-to-three sentence plain English coaching summary."
}

Rules:
- interviewPrep.practiceQuestions: 3-5 role-specific behavioural and technical questions
- interviewPrep.keyTalkingPoints: 2-3 concrete talking-point strategies
- interviewPrep.weaknessesToAddress: 2-3 specific gaps to prepare for, with a narrative strategy
- interviewPrep.estimatedReadinessScore: integer 0-100 (honest current interview readiness)
- resumeInsights.score: integer 0-100 (resume strength for target roles)
- resumeInsights.suggestions: 2-4 high-impact, specific resume improvements
- resumeInsights.keywordsAdded: 3-5 ATS keywords relevant to their target roles
- resumeInsights.sectionsImproved: section names that most need work
- actionItems: 3-5 specific, immediately actionable items ordered by priority
- nextCheckInDays: integer 5-14 (recommended coaching check-in cadence)
- summary: 2-3 sentences covering readiness level, biggest opportunity, and first step
Be specific, encouraging, and honest. Base all coaching on the evaluation and advice data provided.`;

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

    // 3. Load completed Evaluate + Advise notes (Coach depends on these two)
    const { data: stageRows, error: stageErr } = await supabase
      .from("career_os_stages")
      .select("stage, notes")
      .eq("user_id", user.id)
      .eq("cycle_id", cycleId)
      .in("stage", ["evaluate", "advise"])
      .eq("status", "completed");

    if (stageErr) {
      return NextResponse.json({ error: stageErr.message }, { status: 500 });
    }

    const evaluateRow = stageRows?.find((r) => r.stage === "evaluate");
    const adviseRow   = stageRows?.find((r) => r.stage === "advise");

    if (!evaluateRow?.notes) {
      return NextResponse.json(
        { error: "Evaluate stage must be completed before running Coach." },
        { status: 422 }
      );
    }
    if (!adviseRow?.notes) {
      return NextResponse.json(
        { error: "Advise stage must be completed before running Coach." },
        { status: 422 }
      );
    }

    const evaluation = evaluateRow.notes as unknown as EvaluationResult;
    const advice     = adviseRow.notes   as unknown as AdviceResult;

    // 4. Build user message
    const topPaths = advice.recommendedPaths
      .slice(0, 2)
      .map((p) => `  • ${p.title} (match: ${p.matchScore}/100, gap skills: ${p.gapSkills.join(", ")})`)
      .join("\n");

    const userMessage = [
      "Career Evaluation:",
      "  Level: " + evaluation.careerLevel,
      "  Market fit: " + evaluation.marketFitScore + "/100",
      "  Verified skills: " + (evaluation.skills?.join(", ") || "(none)"),
      "  Skill gaps: " + (evaluation.gaps?.join(", ") || "(none)"),
      "  Evaluation summary: " + (evaluation.summary || "(none)"),
      "",
      "Career Path Recommendations:",
      topPaths,
      "  Timeline: " + advice.timelineWeeks + " weeks to role",
      "  Key next actions: " + advice.nextActions.slice(0, 3).join("; "),
      "",
      "Generate a targeted coaching session: interview preparation and resume optimisation tailored to this user's profile and target roles.",
    ].join("\n");

    // 5. Call Claude Sonnet
    const anthropic = createTracedClient(user.id, "career-os/coach");

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system: COACH_SYSTEM,
      messages: [{ role: "user", content: userMessage }],
    });

    // 6. Parse response
    const raw = message.content[0];
    if (raw.type !== "text") {
      throw new Error("Unexpected response type from Claude");
    }

    let result: CoachResult;
    try {
      result = JSON.parse(raw.text) as CoachResult;
    } catch {
      throw new Error("Claude returned non-JSON: " + raw.text.slice(0, 200));
    }

    // Validate required fields
    if (
      !result.interviewPrep ||
      !Array.isArray(result.interviewPrep.practiceQuestions) ||
      !result.resumeInsights ||
      typeof result.resumeInsights.score !== "number" ||
      !Array.isArray(result.actionItems) ||
      !result.summary
    ) {
      throw new Error("Claude response missing required fields");
    }

    // 7. Log event (best-effort, non-blocking)
    void supabase
      .from("career_os_event_log")
      .insert({
        user_id: user.id,
        cycle_id: cycleId,
        event_type: "ai_call",
        event_data: {
          function: "generate-coaching-session",
          status: "completed",
          readinessScore: result.interviewPrep.estimatedReadinessScore,
          resumeScore: result.resumeInsights.score,
          actionItemCount: result.actionItems.length,
        },
      });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("[coach] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
