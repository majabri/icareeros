/**
 * POST /api/career-os/act
 *
 * Server-side endpoint for the Act stage.
 * Loads the authenticated user's completed Evaluate, Advise, and Learn notes
 * from career_os_stages, calls Claude Sonnet to generate a concrete action plan,
 * and returns an ActResult.
 *
 * Kept server-side so ANTHROPIC_API_KEY is never exposed to the browser.
 */

import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import Anthropic from "@anthropic-ai/sdk";
import type { ActResult } from "@/services/ai/actService";
import type { EvaluationResult } from "@/services/ai/evaluateService";
import type { AdviceResult } from "@/services/ai/adviseService";
import type { LearnResult } from "@/services/ai/learnService";
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

const ACT_SYSTEM = `You are a senior career execution strategist inside iCareerOS — an AI-powered Career Operating System.

Your task: given a user's career evaluation, recommended paths, and learning plan, generate a concrete, immediately actionable job-search and networking plan.

Return ONLY valid JSON — no prose, no markdown fences — matching this exact shape:
{
  "jobSearchQueries": [
    "Senior Product Manager fintech Series B",
    "Product Manager SQL data-driven startup",
    "Associate Director of Product SaaS remote"
  ],
  "networkingTargets": [
    {
      "role": "Senior Product Manager",
      "company": "Stripe",
      "rationale": "Fintech aligns with your background; referrals 3x interview rate",
      "outreachTip": "Comment on their PM blog posts before connecting on LinkedIn"
    }
  ],
  "applicationPriority": [
    {
      "roleTier": "Stretch",
      "description": "Director-level roles at large tech companies",
      "targetCount": 2,
      "rationale": "Low probability but high upside — apply early while building momentum"
    },
    {
      "roleTier": "Target",
      "description": "Senior PM at Series B–D startups",
      "targetCount": 8,
      "rationale": "Best match for your current profile and learning trajectory"
    },
    {
      "roleTier": "Safety",
      "description": "Mid-level PM roles at established companies",
      "targetCount": 4,
      "rationale": "Ensures pipeline flow and interview practice"
    }
  ],
  "weeklyApplicationTarget": 5,
  "summary": "Two-to-three sentence plain English summary of the action plan."
}

Rules:
- jobSearchQueries: 3-5 specific, ready-to-paste job board search strings ordered by priority
- networkingTargets: 2-3 specific target companies with named roles, a rationale, and an outreach tip
- applicationPriority: exactly 3 tiers — Stretch, Target, Safety — with realistic targetCount and rationale
- weeklyApplicationTarget: integer 3-10 (realistic weekly application cadence)
- summary: 2-3 sentences covering the action plan and expected timeline
Be specific, realistic, and action-oriented. Base all recommendations on the prior stage data provided.`;

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

    // 3. Load completed Evaluate, Advise, and Learn notes for this cycle
    const { data: stageRows, error: stageErr } = await supabase
      .from("career_os_stages")
      .select("stage, notes")
      .eq("user_id", user.id)
      .eq("cycle_id", cycleId)
      .in("stage", ["evaluate", "advise", "learn"])
      .eq("status", "completed");

    if (stageErr) {
      return NextResponse.json({ error: stageErr.message }, { status: 500 });
    }

    const evaluateRow = stageRows?.find((r) => r.stage === "evaluate");
    const adviseRow   = stageRows?.find((r) => r.stage === "advise");
    const learnRow    = stageRows?.find((r) => r.stage === "learn");

    if (!evaluateRow?.notes) {
      return NextResponse.json(
        { error: "Evaluate stage must be completed before running Act." },
        { status: 422 }
      );
    }
    if (!adviseRow?.notes) {
      return NextResponse.json(
        { error: "Advise stage must be completed before running Act." },
        { status: 422 }
      );
    }
    if (!learnRow?.notes) {
      return NextResponse.json(
        { error: "Learn stage must be completed before running Act." },
        { status: 422 }
      );
    }

    const evaluation = evaluateRow.notes as unknown as EvaluationResult;
    const advice     = adviseRow.notes   as unknown as AdviceResult;
    const learning   = learnRow.notes    as unknown as LearnResult;

    // 4. Build user message
    const topPaths = advice.recommendedPaths
      .slice(0, 2)
      .map((p) => `  • ${p.title} (match: ${p.matchScore}/100, gap skills: ${p.gapSkills.join(", ")})`)
      .join("\n");

    const topResources = learning.resources
      .slice(0, 3)
      .map((r) => `  • ${r.title} (${r.provider}, ${r.estimatedHours}h)`)
      .join("\n");

    const userMessage = [
      "Career Evaluation:",
      "  Level: " + evaluation.careerLevel,
      "  Market fit: " + evaluation.marketFitScore + "/100",
      "  Skills: " + (evaluation.skills?.join(", ") || "(none)"),
      "  Gaps: " + (evaluation.gaps?.join(", ") || "(none)"),
      "",
      "Career Path Recommendations:",
      topPaths,
      "  Timeline: " + advice.timelineWeeks + " weeks to role",
      "",
      "Learning Plan:",
      topResources,
      "  Weekly study: " + learning.weeklyHoursNeeded + "h, est. completion: " + learning.estimatedCompletionWeeks + " weeks",
      "  Key skill gaps being closed: " + learning.topSkillGaps.join(", "),
      "",
      "Based on this full Career OS picture, generate a concrete job-search and networking action plan the user can execute this week.",
    ].join("\n");

    // 5. Call Claude Sonnet
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY!,
    });

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system: ACT_SYSTEM,
      messages: [{ role: "user", content: userMessage }],
    });

    // 6. Parse response
    const raw = message.content[0];
    if (raw.type !== "text") {
      throw new Error("Unexpected response type from Claude");
    }

    let result: ActResult;
    try {
      result = JSON.parse(raw.text) as ActResult;
    } catch {
      throw new Error("Claude returned non-JSON: " + raw.text.slice(0, 200));
    }

    // Validate required fields
    if (
      !Array.isArray(result.jobSearchQueries) ||
      !Array.isArray(result.networkingTargets) ||
      !Array.isArray(result.applicationPriority) ||
      typeof result.weeklyApplicationTarget !== "number" ||
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
          function: "generate-action-plan",
          status: "completed",
          queryCount: result.jobSearchQueries.length,
          networkingTargetCount: result.networkingTargets.length,
          weeklyApplicationTarget: result.weeklyApplicationTarget,
        },
      });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("[act] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
