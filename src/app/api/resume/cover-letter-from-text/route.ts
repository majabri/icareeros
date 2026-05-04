/**
 * POST /api/resume/cover-letter-from-text
 *
 * Lightweight cover letter generator. Unlike /api/cover-letter, this does NOT
 * require an opportunity row in the DB — takes raw resume + JD text and
 * returns a cover letter. Used from the Resume Advisor page where the user
 * may not have saved the job yet.
 */

import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createTracedClient } from "@/lib/observability/langfuse";

async function makeSupabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
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
}

const SYSTEM = `You are an expert career coach inside iCareerOS. Write a tailored, professional cover letter from the candidate's resume and the target job description. Return ONLY valid JSON, no markdown fences:
{
  "subject": "Application for [Role] at [Company]",
  "body": "Dear Hiring Manager,\\n\\n[opening, skills/experience, company-specific, closing]\\n\\nSincerely,\\n[Your Name]",
  "word_count": <approx>,
  "tips": ["3 specific personalisation tips"]
}
Rules: 250-350 words. Reference the actual job requirements and concrete achievements from the resume. No fluff.`;

export async function POST(req: Request) {
  try {
    const supabase = await makeSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as { resumeText?: string; jobDescription?: string };
    if (!body.resumeText?.trim()) return NextResponse.json({ error: "resumeText required" }, { status: 400 });
    if (!body.jobDescription?.trim()) return NextResponse.json({ error: "jobDescription required" }, { status: 400 });

    const anthropic = createTracedClient(user.id, "cover-letter-from-text");
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1536,
      system: SYSTEM,
      messages: [{
        role: "user",
        content: [
          "Write a cover letter for this application.",
          "",
          "RESUME:",
          body.resumeText.slice(0, 6000),
          "",
          "JOB DESCRIPTION:",
          body.jobDescription.slice(0, 4000),
        ].join("\n"),
      }],
    });

    const raw = message.content[0];
    if (raw.type !== "text") throw new Error("Unexpected response from Claude");

    let result;
    try { result = JSON.parse(raw.text); }
    catch { throw new Error("Claude returned non-JSON: " + raw.text.slice(0, 200)); }

    if (!result.subject || !result.body) throw new Error("Cover letter missing required fields");
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Internal error" }, { status: 500 });
  }
}
