/**
 * POST /api/career-os/evaluate/assessment
 *
 * Skills inventory assessment — Phase 4 Item 2b.
 *
 * Body: { cycle_id, responses: Array<{ skill, confidence: 1-5 }> }  (10 entries)
 *
 * Synthesizes a Claude Haiku 4.5 report from the user's confidence ratings,
 * stores both raw responses and the synthesized report in the Evaluate
 * stage row's `notes.assessment`, and returns the report to the caller.
 *
 * Storage: career_os_stages.notes.assessment — no migration. Once notes
 * has the assessment block, the strict completion rule from Phase 1 kicks
 * in and the Evaluate stage shows as `completed` on the dashboard.
 */

import { NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createTracedClient } from "@/lib/observability/langfuse";
import type {
  SkillsAssessmentResponse,
  SkillsAssessmentReport,
  SkillsAssessmentNotes,
} from "@/services/ai/evaluateService";

const REQUIRED_RESPONSE_COUNT = 10;

interface PostBody {
  cycle_id?: string;
  responses?: SkillsAssessmentResponse[];
}

async function makeSupabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
          try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); }
          catch { /* server component */ }
        },
      },
    },
  );
}

const ASSESSMENT_SYSTEM = `You are a senior career coach synthesizing a skills self-assessment.

Given a user's 10 skill confidence ratings (1-5 each), produce a structured report.

Return ONLY valid JSON — no prose, no markdown — matching this exact shape:
{
  "strongSkills":     ["skill1", "skill2"],
  "developingSkills": ["skill3", "skill4"],
  "gapSkills":        ["skill5"],
  "narrative":        "Two-paragraph plain-text synthesis (150-200 words)."
}

Rules:
- strongSkills:     skills the user rated 4-5 (verbatim names from input)
- developingSkills: skills the user rated 2-3 (verbatim names from input)
- gapSkills:        skills the user rated 1 (verbatim names from input)
- narrative:        150-200 words. Plain prose. Acknowledge their strengths
                    concretely, frame the developing skills as "near-term
                    growth", and call out the gaps with one specific
                    suggestion each. Do not invent skills not in the input.`;

function isValidResponses(responses: unknown): responses is SkillsAssessmentResponse[] {
  if (!Array.isArray(responses)) return false;
  if (responses.length !== REQUIRED_RESPONSE_COUNT) return false;
  for (const r of responses) {
    if (!r || typeof r !== "object") return false;
    const skill = (r as { skill?: unknown }).skill;
    const confidence = (r as { confidence?: unknown }).confidence;
    if (typeof skill !== "string" || skill.trim().length === 0) return false;
    if (typeof confidence !== "number" || confidence < 1 || confidence > 5 || !Number.isInteger(confidence)) return false;
  }
  return true;
}

export async function POST(req: Request) {
  try {
    const supabase = await makeSupabaseServer();

    // 1. Auth
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Body
    const body = (await req.json().catch(() => ({}))) as PostBody;
    const cycleId = body?.cycle_id;
    const responses = body?.responses;
    if (!cycleId) {
      return NextResponse.json({ error: "cycle_id is required" }, { status: 400 });
    }
    if (!isValidResponses(responses)) {
      return NextResponse.json(
        { error: `responses must be an array of ${REQUIRED_RESPONSE_COUNT} { skill: string, confidence: 1-5 } entries` },
        { status: 400 },
      );
    }

    // 3. Synthesize report via Claude Haiku 4.5
    const userMessage = "Skill ratings:\n" + responses.map(r => `- ${r.skill}: ${r.confidence}/5`).join("\n");
    const anthropic = createTracedClient(user.id, "career-os/evaluate-assessment");
    const message = await anthropic.messages.create({
      model:      "claude-haiku-4-5-20251001",
      max_tokens: 600,
      system:     ASSESSMENT_SYSTEM,
      messages:   [{ role: "user", content: userMessage }],
    });

    const raw = message.content[0];
    if (raw.type !== "text") {
      throw new Error("Unexpected response type from Claude");
    }
    let report: SkillsAssessmentReport;
    try {
      report = JSON.parse(raw.text) as SkillsAssessmentReport;
    } catch {
      throw new Error("Claude returned non-JSON: " + raw.text.slice(0, 200));
    }
    if (
      !Array.isArray(report.strongSkills)
      || !Array.isArray(report.developingSkills)
      || !Array.isArray(report.gapSkills)
      || typeof report.narrative !== "string"
    ) {
      throw new Error("Claude response missing required fields");
    }

    // 4. Merge into Evaluate stage notes (jsonb). Existing notes from the
    //    main Evaluate run (skills, gaps, marketFitScore, etc.) are preserved;
    //    this just adds an `assessment` key alongside.
    const { data: stageRow, error: stageErr } = await supabase
      .from("career_os_stages")
      .select("id, notes")
      .eq("user_id", user.id)
      .eq("cycle_id", cycleId)
      .eq("stage", "evaluate")
      .maybeSingle();

    if (stageErr) {
      return NextResponse.json({ error: stageErr.message }, { status: 500 });
    }
    if (!stageRow) {
      return NextResponse.json({ error: "Evaluate stage row not found for cycle" }, { status: 404 });
    }

    const prevNotes = (stageRow.notes ?? {}) as Record<string, unknown>;
    const assessmentNotes: SkillsAssessmentNotes = {
      responses,
      report,
      completedAt: new Date().toISOString(),
    };
    const merged = { ...prevNotes, assessment: assessmentNotes };

    const { error: updErr } = await supabase
      .from("career_os_stages")
      .update({ notes: merged, last_event_at: new Date().toISOString() })
      .eq("id", stageRow.id)
      .eq("user_id", user.id);

    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }

    return NextResponse.json({ report });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("[evaluate-assessment] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
