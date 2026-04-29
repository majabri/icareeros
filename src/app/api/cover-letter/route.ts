/**
 * POST /api/cover-letter
 *
 * Server-side endpoint for the Cover Letter Generator.
 * Given an opportunity id (and optionally a cycle_id for career context),
 * calls Claude Sonnet to generate a tailored cover letter the user can
 * customise and submit with their application.
 *
 * Kept server-side so ANTHROPIC_API_KEY is never exposed to the browser.
 */

import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import Anthropic from "@anthropic-ai/sdk";
import type { CoverLetterResult } from "@/services/ai/coverLetterService";
import type { EvaluationResult } from "@/services/ai/evaluateService";

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

const COVER_LETTER_SYSTEM = `You are an expert career coach and professional writer inside iCareerOS — an AI-powered Career Operating System.

Your task: write a compelling, tailored cover letter for a job application. The letter should be professional, specific to the role and company, and highlight relevant experience without being generic.

Return ONLY valid JSON — no prose, no markdown fences — matching this exact shape:
{
  "subject": "Application for [Role] — [Candidate Name/Your Name]",
  "body": "Dear Hiring Manager,\\n\\n[Opening paragraph — 2-3 sentences connecting the candidate's background to this specific role and company]\\n\\n[Skills/experience paragraph — 2-3 sentences highlighting the most relevant skills and a concrete achievement or two]\\n\\n[Company-specific paragraph — 2-3 sentences showing genuine interest in this company's mission, culture, or recent work]\\n\\n[Closing paragraph — 1-2 sentences with a clear call to action]\\n\\nSincerely,\\n[Your Name]",
  "word_count": 280,
  "tips": [
    "Personalise [Your Name] and address the hiring manager by name if you can find it on LinkedIn",
    "Replace the achievement placeholder with a specific metric from your own experience",
    "Research one recent company milestone (product launch, funding round, press mention) to make the company-specific paragraph more compelling"
  ]
}

Rules:
- Target 250-350 words for the body (optimal cover letter length)
- Opening: name the exact role title and company; show immediate relevance
- Skills paragraph: reference the actual job requirements; use concrete, specific language (no buzzwords)
- Company paragraph: reference something real about the company from the context provided -- avoid generic "I admire your company" filler
- Closing: confident, not desperate; request a conversation, not approval
- Use [Your Name] as placeholder -- never invent a name
- word_count: approximate count of words in the body field
- tips: 3 specific, immediately actionable personalisation tips
- Tone: warm professional -- confident but not arrogant, enthusiastic but not fawning
- If career profile context is provided, incorporate 1-2 specific skills or level-appropriate achievements`;

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
    const body = await req.json().catch(() => ({})) as {
      opportunity_id?: string;
      cycle_id?: string;
    };

    if (!body?.opportunity_id) {
      return NextResponse.json({ error: "opportunity_id is required" }, { status: 400 });
    }

    const { opportunity_id, cycle_id } = body;

    // 3. Load opportunity
    const { data: opp, error: oppErr } = await supabase
      .from("opportunities")
      .select("id, title, company, location, description, url")
      .eq("id", opportunity_id)
      .single();

    if (oppErr || !opp) {
      return NextResponse.json({ error: "Opportunity not found" }, { status: 404 });
    }

    // 4. Optionally load career profile for personalisation (best-effort)
    let evaluation: EvaluationResult | null = null;
    if (cycle_id) {
      const { data: stageRow } = await supabase
        .from("career_os_stages")
        .select("notes")
        .eq("user_id", user.id)
        .eq("cycle_id", cycle_id)
        .eq("stage", "evaluate")
        .eq("status", "completed")
        .maybeSingle();

      if (stageRow?.notes) {
        evaluation = stageRow.notes as unknown as EvaluationResult;
      }
    }

    // 5. Build user message
    const descriptionSnippet = opp.description
      ? opp.description.slice(0, 600) + (opp.description.length > 600 ? "..." : "")
      : "No description available.";

    const profileContext = evaluation
      ? [
          "",
          "Candidate career profile (use to personalise the letter):",
          "  Level: " + evaluation.careerLevel,
          "  Skills: " + (evaluation.skills?.slice(0, 8).join(", ") || "(none)"),
          "  Summary: " + (evaluation.summary || "(none)"),
        ].join("\n")
      : "";

    const userMessage = [
      "Write a tailored cover letter for this job application:",
      "",
      "Role: " + opp.title,
      "Company: " + opp.company,
      "Location: " + (opp.location || "Not specified"),
      "Job description excerpt:",
      descriptionSnippet,
      profileContext,
    ].join("\n");

    // 6. Call Claude Sonnet
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1536,
      system: COVER_LETTER_SYSTEM,
      messages: [{ role: "user", content: userMessage }],
    });

    // 7. Parse response
    const raw = message.content[0];
    if (raw.type !== "text") {
      throw new Error("Unexpected response type from Claude");
    }

    let result: CoverLetterResult;
    try {
      result = JSON.parse(raw.text) as CoverLetterResult;
    } catch {
      throw new Error("Claude returned non-JSON: " + raw.text.slice(0, 200));
    }

    // Validate required fields
    if (!result.subject || !result.body || !Array.isArray(result.tips)) {
      throw new Error("Claude response missing required fields");
    }

    // 8. Log event (best-effort, non-blocking)
    void supabase
      .from("career_os_event_log")
      .insert({
        user_id: user.id,
        cycle_id: cycle_id ?? null,
        event_type: "ai_call",
        event_data: {
          function: "generate-cover-letter",
          status: "completed",
          opportunity_id,
          company: opp.company,
          role: opp.title,
        },
      });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("[cover-letter] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
