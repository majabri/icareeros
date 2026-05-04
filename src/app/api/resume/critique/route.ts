/**
 * POST /api/resume/critique
 *
 * Combined resume critique:
 *   1. SELF: ATS-readability, weak verbs, missing metrics, formatting issues
 *   2. MARKET: vs the user's target roles (from career_profiles.target_skills/headline)
 *
 * Used to answer "why am I not getting interviews?" — actionable feedback
 * the user can apply to their resume to improve response rate.
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

const SYSTEM = `You are a senior recruiter and resume coach inside iCareerOS, with 15+ years of experience reviewing resumes for tech and corporate roles.

Your job: critique the candidate's resume from a PROFESSIONAL recruiter's lens, focused on why the resume might NOT be generating interviews. Be honest and specific — vague feedback is useless.

Two lenses:
  1. SELF — issues with the resume on its own (ATS-friendliness, structure, language quality, metrics, formatting)
  2. MARKET — issues with positioning vs the candidate's stated target roles (signal mismatch, level mismatch, missing keywords)

Return ONLY valid JSON, no markdown fences, exact shape:
{
  "overall_grade": "A" | "B" | "C" | "D" | "F",
  "interview_likelihood": "high" | "medium" | "low" | "very_low",
  "summary": "One paragraph (3-4 sentences) explaining the top reason this resume might not be getting interviews.",
  "self_critique": [
    { "severity": "critical"|"major"|"minor", "issue": "<short title>", "detail": "<why it matters + specific example from the resume>", "fix": "<concrete actionable fix>" }
  ],
  "market_critique": [
    { "severity": "critical"|"major"|"minor", "issue": "<short title>", "detail": "<why this hurts vs target roles>", "fix": "<concrete actionable fix>" }
  ],
  "top_three_actions": [
    "<the 3 highest-ROI changes the candidate should make today, ranked>"
  ]
}

Rules:
- 3-7 items per critique array. Be ruthless about ATS issues, weak verbs ("responsible for", "helped"), missing quantitative impact, generic phrasing.
- For market critique, reference the candidate's stated target roles/headline.
- Always end with top_three_actions — the actually-do-this-now list.
- If the resume is already excellent, say so honestly with grade A and interview_likelihood high.`;

export async function POST(req: Request) {
  try {
    const supabase = await makeSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as { resumeText?: string };
    if (!body.resumeText?.trim() || body.resumeText.length < 100) {
      return NextResponse.json({ error: "resumeText (>=100 chars) required" }, { status: 400 });
    }

    // Pull target context from career_profiles
    const { data: profile } = await supabase
      .from("career_profiles")
      .select("headline, target_skills, target_education, target_certifications")
      .eq("user_id", user.id)
      .maybeSingle();

    const targetContext = profile
      ? [
          "TARGET CONTEXT:",
          "  Headline: " + (profile.headline || "(none)"),
          "  Target skills: " + ((profile.target_skills as string[] | null)?.join(", ") || "(none specified)"),
          "  Target education: " + JSON.stringify(profile.target_education ?? []),
          "  Target certifications: " + JSON.stringify(profile.target_certifications ?? []),
        ].join("\n")
      : "TARGET CONTEXT: (none specified — the candidate hasn't filled in target roles)";

    const anthropic = createTracedClient(user.id, "resume-critique");
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 3000,
      system: SYSTEM,
      messages: [{
        role: "user",
        content: [
          "Critique this resume from a recruiter's perspective. The candidate isn't getting interviews — tell them why and how to fix it.",
          "",
          targetContext,
          "",
          "RESUME:",
          body.resumeText.slice(0, 8000),
        ].join("\n"),
      }],
    });

    const raw = message.content[0];
    if (raw.type !== "text") throw new Error("Unexpected response from Claude");

    let result;
    try { result = JSON.parse(raw.text); }
    catch { throw new Error("Claude returned non-JSON: " + raw.text.slice(0, 200)); }

    if (!result.overall_grade || !result.summary) throw new Error("Critique missing required fields");
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Internal error" }, { status: 500 });
  }
}
