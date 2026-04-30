/**
 * POST /api/career-os/advise
 *
 * Server-side endpoint for the Advise stage.
 * Loads the authenticated user's completed Evaluate notes from career_os_stages,
 * calls Claude Sonnet to generate career path recommendations, and returns an AdviceResult.
 *
 * Kept server-side so ANTHROPIC_API_KEY is never exposed to the browser.
 */

import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import Anthropic from "@anthropic-ai/sdk";
import type { AdviceResult } from "@/services/ai/adviseService";
import type { EvaluationResult } from "@/services/ai/evaluateService";
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

const ADVISE_SYSTEM = `You are a senior career strategist inside iCareerOS — an AI-powered Career Operating System.

Your task: given a user's career evaluation results, generate structured career path recommendations.

Return ONLY valid JSON — no prose, no markdown fences — matching this exact shape:
{
  "recommendedPaths": [
    {
      "title": "Senior Product Manager",
      "matchScore": 82,
      "requiredSkills": ["Product strategy", "Stakeholder management", "Data analysis"],
      "gapSkills": ["SQL", "A/B testing"],
      "estimatedWeeks": 16
    }
  ],
  "nextActions": [
    "Complete a SQL fundamentals course on Coursera",
    "Apply to 3 PM roles at Series B startups this week",
    "Request a mock interview with a PM at your target company"
  ],
  "timelineWeeks": 16,
  "summary": "Two-to-three sentence plain English career strategy summary."
}

Rules:
- recommendedPaths: 2-4 realistic career paths ordered by matchScore descending
- matchScore: integer 0-100 (how well their current profile fits this path)
- requiredSkills: top 3-5 skills this path demands
- gapSkills: skills from requiredSkills the user currently lacks (based on evaluation gaps)
- estimatedWeeks: realistic weeks to be job-ready for this path
- nextActions: 3-5 specific, immediately actionable steps ordered by priority
- timelineWeeks: estimated weeks to land a role on the top recommended path
- summary: 2-3 sentences covering their best path and key steps to get there
Be specific, realistic, and encouraging. Base all recommendations on the evaluation data provided.`;

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

    // 3. Load completed Evaluate notes for this cycle
    const { data: stageRow, error: stageErr } = await supabase
      .from("career_os_stages")
      .select("notes")
      .eq("user_id", user.id)
      .eq("cycle_id", cycleId)
      .eq("stage", "evaluate")
      .eq("status", "completed")
      .maybeSingle();

    if (stageErr) {
      return NextResponse.json({ error: stageErr.message }, { status: 500 });
    }

    if (!stageRow?.notes) {
      return NextResponse.json(
        { error: "Evaluate stage must be completed before running Advise." },
        { status: 422 }
      );
    }

    const evaluation = stageRow.notes as unknown as EvaluationResult;

    // 4. Build user message
    const userMessage = [
      "Career Evaluation Results:",
      "",
      "Career level: " + evaluation.careerLevel,
      "Market fit score: " + evaluation.marketFitScore + "/100",
      "Verified skills: " + (evaluation.skills?.join(", ") || "(none)"),
      "Skill gaps: " + (evaluation.gaps?.join(", ") || "(none)"),
      "Evaluation summary: " + (evaluation.summary || "(none)"),
      "",
      "Based on this evaluation, generate personalised career path recommendations.",
    ].join("\n");

    // 5. Call Claude Sonnet
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY!,
    });

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system: ADVISE_SYSTEM,
      messages: [{ role: "user", content: userMessage }],
    });

    // 6. Parse response
    const raw = message.content[0];
    if (raw.type !== "text") {
      throw new Error("Unexpected response type from Claude");
    }

    let result: AdviceResult;
    try {
      result = JSON.parse(raw.text) as AdviceResult;
    } catch {
      throw new Error("Claude returned non-JSON: " + raw.text.slice(0, 200));
    }

    // Validate required fields
    if (
      !Array.isArray(result.recommendedPaths) ||
      !Array.isArray(result.nextActions) ||
      typeof result.timelineWeeks !== "number" ||
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
          function: "generate-advice",
          status: "completed",
          pathCount: result.recommendedPaths.length,
          timelineWeeks: result.timelineWeeks,
          actionCount: result.nextActions.length,
        },
      });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("[advise] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
