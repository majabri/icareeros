/**
 * POST /api/outreach
 *
 * Server-side endpoint for the Outreach Generator.
 * Given an opportunity id (and optionally a cycle_id for career context),
 * calls Claude Sonnet to generate a personalised outreach message the user
 * can send via LinkedIn or email to someone at the target company.
 *
 * Kept server-side so ANTHROPIC_API_KEY is never exposed to the browser.
 */

import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createTracedClient } from "@/lib/observability/langfuse";
import type { OutreachResult } from "@/services/ai/outreachService";
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

const OUTREACH_SYSTEM = `You are an expert career coach specialising in professional networking inside iCareerOS — an AI-powered Career Operating System.

Your task: write a short, personalised outreach message a job seeker can send to a hiring manager, recruiter, or employee at a target company. Generate TWO versions — one for LinkedIn (≤300 characters for connection note) and one for email.

Return ONLY valid JSON — no prose, no markdown fences — matching this exact shape:
{
  "linkedin": {
    "subject": "Connection request",
    "message": "Hi [Name], I came across the [Role] opening at [Company] and your work on [specific thing] stood out. I'd love to connect and learn more about the team. [Your name]"
  },
  "email": {
    "subject": "Interest in [Role] at [Company]",
    "message": "Hi [Name],\\n\\nI noticed the [Role] position at [Company] and wanted to reach out directly. [1-2 sentences connecting their background to the role]. [1 sentence on why this company specifically]. I'd welcome a brief 15-minute call if you have availability.\\n\\nBest,\\n[Your name]"
  },
  "tips": [
    "Personalise [Name] with the actual hiring manager or a relevant employee you find on LinkedIn",
    "Reference a specific company blog post, product, or recent milestone to stand out",
    "Send Monday–Thursday 9–11am recipient's timezone for highest open rates"
  ]
}

Rules:
- LinkedIn message: ≤300 characters (connection request note limit), punchy, no buzzwords
- Email subject: ≤60 characters, specific to the role and company
- Email body: 3-4 short paragraphs, professional but warm, no generic filler
- tips: 3 specific, immediately actionable tips (not generic advice)
- Use [Name], [Your name] as placeholders — do NOT invent names
- Be concrete — reference the actual role title and company name from the context provided
- If career profile context is available, weave in 1-2 relevant skills or achievements`;

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
    const limitBlock = await checkPlanLimit(supabase, user.id, "coverLetters");
    if (limitBlock) return limitBlock;

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
      ? opp.description.slice(0, 400) + (opp.description.length > 400 ? "…" : "")
      : "No description available.";

    const profileContext = evaluation
      ? [
          "",
          "Candidate career profile (use to personalise the message):",
          "  Level: " + evaluation.careerLevel,
          "  Skills: " + (evaluation.skills?.slice(0, 5).join(", ") || "(none)"),
          "  Summary: " + (evaluation.summary || "(none)"),
        ].join("\n")
      : "";

    const userMessage = [
      "Generate a personalised outreach message for this opportunity:",
      "",
      "Role: " + opp.title,
      "Company: " + opp.company,
      "Location: " + (opp.location || "Not specified"),
      "Job description excerpt:",
      descriptionSnippet,
      profileContext,
    ].join("\n");

    // 6. Call Claude Sonnet
    const anthropic = createTracedClient(user.id, "outreach");

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: OUTREACH_SYSTEM,
      messages: [{ role: "user", content: userMessage }],
    });

    // 7. Parse response
    const raw = message.content[0];
    if (raw.type !== "text") {
      throw new Error("Unexpected response type from Claude");
    }

    let result: OutreachResult;
    try {
      result = JSON.parse(raw.text) as OutreachResult;
    } catch {
      throw new Error("Claude returned non-JSON: " + raw.text.slice(0, 200));
    }

    // Validate required fields
    if (
      !result.linkedin?.message ||
      !result.email?.subject ||
      !result.email?.message ||
      !Array.isArray(result.tips)
    ) {
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
          function: "generate-outreach",
          status: "completed",
          opportunity_id,
          company: opp.company,
          role: opp.title,
        },
      });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("[outreach] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
