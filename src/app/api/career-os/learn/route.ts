/**
 * POST /api/career-os/learn
 *
 * Server-side endpoint for the Learn stage.
 * Loads the authenticated user's completed Evaluate + Advise notes from career_os_stages,
 * calls Claude Sonnet to generate a personalised learning plan, and returns a LearnResult.
 *
 * Kept server-side so ANTHROPIC_API_KEY is never exposed to the browser.
 */

import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import Anthropic from "@anthropic-ai/sdk";
import type { LearnResult } from "@/services/ai/learnService";
import type { EvaluationResult } from "@/services/ai/evaluateService";
import type { AdviceResult } from "@/services/ai/adviseService";

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

const LEARN_SYSTEM = `You are a senior learning strategist inside iCareerOS — an AI-powered Career Operating System.

Your task: given a user's career evaluation and career path recommendations, generate a personalised, actionable learning plan.

Return ONLY valid JSON — no prose, no markdown fences — matching this exact shape:
{
  "resources": [
    {
      "title": "SQL for Data Analysis",
      "type": "course",
      "provider": "Coursera",
      "url": "https://www.coursera.org/learn/sql-for-data-science",
      "estimatedHours": 20,
      "skillsCovered": ["SQL", "Data querying", "Aggregations"],
      "priorityScore": 95
    }
  ],
  "topSkillGaps": ["SQL", "A/B testing", "System design"],
  "weeklyHoursNeeded": 8,
  "estimatedCompletionWeeks": 12,
  "summary": "Two-to-three sentence plain English summary of the learning plan."
}

Rules:
- resources: 4-6 learning resources, ordered by priorityScore descending
- type: one of "course" | "certification" | "book" | "video" | "article" | "mentorship"
- provider: the platform or publisher (e.g. Coursera, Udemy, O'Reilly, YouTube, LinkedIn Learning)
- url: a plausible, real URL if known — otherwise omit the field
- estimatedHours: realistic hours to complete the resource
- skillsCovered: 2-4 skills this resource directly builds
- priorityScore: integer 0-100 (how critical this resource is for the user's target path)
- topSkillGaps: top 3-5 skill gaps from the evaluation that these resources address
- weeklyHoursNeeded: realistic weekly study hours to hit the estimatedCompletionWeeks target (integer)
- estimatedCompletionWeeks: weeks to be job-ready given the recommended learning plan (integer)
- summary: 2-3 sentences covering what to learn, why, and the expected timeline
Be specific, realistic, and encouraging. Base all recommendations on the evaluation and advice data provided.`;

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    // 1. Auth
    const supabase = await makeSupabaseServer();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Parse body
    const body = await req.json().catch(() => ({})) as { cycle_id?: string };
    const cycleId: string | undefined = body?.cycle_id;

    if (!cycleId) {
      return NextResponse.json({ error: "cycle_id is required" }, { status: 400 });
    }

    // 3. Load completed Evaluate + Advise notes for this cycle
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
        { error: "Evaluate stage must be completed before running Learn." },
        { status: 422 }
      );
    }
    if (!adviseRow?.notes) {
      return NextResponse.json(
        { error: "Advise stage must be completed before running Learn." },
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
      "Career Evaluation Results:",
      "  Career level: " + evaluation.careerLevel,
      "  Market fit score: " + evaluation.marketFitScore + "/100",
      "  Verified skills: " + (evaluation.skills?.join(", ") || "(none)"),
      "  Skill gaps: " + (evaluation.gaps?.join(", ") || "(none)"),
      "",
      "Career Path Recommendations:",
      topPaths,
      "  Recommended timeline: " + advice.timelineWeeks + " weeks",
      "  Key next actions: " + advice.nextActions.slice(0, 3).join("; "),
      "",
      "Based on these results, generate a personalised learning plan that closes the skill gaps and prepares the user for their top recommended career path.",
    ].join("\n");

    // 5. Call Claude Sonnet
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY!,
    });

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system: LEARN_SYSTEM,
      messages: [{ role: "user", content: userMessage }],
    });

    // 6. Parse response
    const raw = message.content[0];
    if (raw.type !== "text") {
      throw new Error("Unexpected response type from Claude");
    }

    let result: LearnResult;
    try {
      result = JSON.parse(raw.text) as LearnResult;
    } catch {
      throw new Error("Claude returned non-JSON: " + raw.text.slice(0, 200));
    }

    // Validate required fields
    if (
      !Array.isArray(result.resources) ||
      !Array.isArray(result.topSkillGaps) ||
      typeof result.weeklyHoursNeeded !== "number" ||
      typeof result.estimatedCompletionWeeks !== "number" ||
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
          function: "generate-learning-plan",
          status: "completed",
          resourceCount: result.resources.length,
          weeklyHoursNeeded: result.weeklyHoursNeeded,
          estimatedCompletionWeeks: result.estimatedCompletionWeeks,
        },
      });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("[learn] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
