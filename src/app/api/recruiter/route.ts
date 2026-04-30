/**
 * POST /api/recruiter
 * Recruiter assistant — analyse a job description and generate:
 *   1. Ideal candidate profile
 *   2. Top 5 screening questions
 *   3. Must-have vs. nice-to-have skill split
 *   4. Red-flag signals to watch for
 */

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

const SYSTEM_PROMPT = `You are an expert technical recruiter and talent strategist. Your job is to help hiring managers and recruiters efficiently screen and evaluate candidates.

Given a job description, produce a structured analysis in the following JSON format:
{
  "ideal_candidate": "2-3 sentence description of the ideal candidate",
  "must_have_skills": ["skill 1", "skill 2", ...],
  "nice_to_have_skills": ["skill 1", "skill 2", ...],
  "screening_questions": [
    { "question": "...", "what_to_listen_for": "..." },
    ...
  ],
  "red_flags": ["signal 1", "signal 2", ...],
  "compensation_notes": "brief market context for this role if inferable"
}

Keep screening_questions to exactly 5. Be direct and practical — recruiters are busy.`;

export async function POST(req: NextRequest) {
  // Auth check
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cs: Array<{ name: string; value: string; options: CookieOptions }>) {
          cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        },
      },
    }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const jobDescription = (body.job_description as string | undefined)?.trim();
  const companyName = (body.company_name as string | undefined)?.trim() ?? "";

  if (!jobDescription || jobDescription.length < 50) {
    return NextResponse.json({ error: "job_description is required (min 50 chars)" }, { status: 400 });
  }

  const userPrompt = `${companyName ? `Company: ${companyName}\n\n` : ""}Job Description:\n${jobDescription}`;

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    const text = message.content
      .filter(b => b.type === "text")
      .map(b => (b as { type: "text"; text: string }).text)
      .join("");

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "Failed to parse AI response" }, { status: 500 });
    }
    const analysis = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ analysis });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
