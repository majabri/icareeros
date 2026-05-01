/**
 * POST /api/resume/rewrite
 *
 * Takes existing resume text (and optional target role / JD) and returns an
 * AI-enhanced version with improvement notes.
 *
 * Body: { resumeText: string; targetRole?: string; jobDescription?: string }
 * Response: RewriteResult
 *
 * ANTHROPIC_API_KEY is server-side only.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createTracedClient } from "@/lib/observability/langfuse";
import { checkPlanLimit } from "@/lib/billing/checkPlanLimit";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RewriteResult {
  rewrittenText: string;
  improvements: string[];
  wordCount: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

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
        setAll(
          cookiesToSet: Array<{
            name: string;
            value: string;
            options: CookieOptions;
          }>
        ) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );
}

// ── Handler ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    // 1. Auth check
    const supabase = await makeSupabaseServer();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── Plan limit check ──────────────────────────────────────────────────────
    const limitBlock = await checkPlanLimit(supabase, user.id, "aiCoach");
    if (limitBlock) return limitBlock;

    // 2. Parse body
    const body = (await req.json().catch(() => ({}))) as {
      resumeText?: string;
      targetRole?: string;
      jobDescription?: string;
    };

    const { resumeText, targetRole, jobDescription } = body;

    if (!resumeText || resumeText.trim().length < 20) {
      return NextResponse.json(
        { error: "resumeText is required and must have meaningful content" },
        { status: 400 }
      );
    }

    // 3. Build context for Claude
    const targetContext = targetRole
      ? `Target role: ${targetRole}`
      : "General optimization (no specific role specified)";

    const jdSection = jobDescription
      ? `\n\nJob description to tailor for:\n${jobDescription.slice(0, 2000)}`
      : "";

    const systemPrompt = `You are an expert resume writer with 15 years of experience helping candidates land top-tier jobs. 

Your task: rewrite the provided resume to be more impactful, ATS-friendly, and compelling.

Rules:
1. Keep all factual information accurate — do NOT fabricate companies, roles, dates, or achievements
2. Strengthen bullet points with specific action verbs and quantifiable results where plausible
3. Optimize for ATS: use industry-standard keywords, clear section headers
4. Improve clarity and conciseness — cut filler words
5. Return ONLY valid JSON in this exact format (no markdown):
{
  "rewrittenText": "The complete rewritten resume as plain text with clear section headers and line breaks",
  "improvements": ["Specific improvement 1", "Specific improvement 2", ...up to 8 items],
  "wordCount": <number>
}`;

    const userMessage = `${targetContext}${jdSection}

Original resume:
${resumeText}`;

    // 4. Call Claude Sonnet
    const anthropic = createTracedClient(user.id, "resume/rewrite");

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    const raw = message.content[0];
    if (raw.type !== "text") {
      throw new Error("Unexpected response type from Claude");
    }

    const jsonStr = raw.text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/, "")
      .trim();

    let result: RewriteResult;
    try {
      result = JSON.parse(jsonStr) as RewriteResult;
    } catch {
      throw new Error("Claude returned non-JSON: " + raw.text.slice(0, 200));
    }

    if (!result.rewrittenText || !Array.isArray(result.improvements)) {
      throw new Error("Missing required fields in Claude response");
    }

    // Ensure wordCount is a number
    result.wordCount =
      typeof result.wordCount === "number"
        ? result.wordCount
        : result.rewrittenText.split(/\s+/).length;

    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal server error";
    console.error("[resume/rewrite] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
