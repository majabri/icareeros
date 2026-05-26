import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createTracedClient } from "@/lib/observability/langfuse";

/**
 * POST /api/resume/linkedin-advice
 *
 * Combined Resume + LinkedIn advisory pass. Given a candidate's resume text
 * and a target job (description or job title), returns:
 *   - resume gaps vs the target role
 *   - specific bullet-level resume rewrite suggestions
 *   - LinkedIn headline recommendation
 *   - LinkedIn About section recommendation
 *   - top 5 LinkedIn skills to add
 *
 * Powers the "Resume & LinkedIn Advisor" surface (the rebranded
 * /evaluate/job-fit page).
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export interface LinkedInAdviceResult {
  resumeGaps:       string[];
  bulletRewrites:   Array<{ original: string; revised: string; rationale: string }>;
  linkedinHeadline: string;
  linkedinAbout:    string;
  linkedinTopSkills: string[];
}

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    },
  );

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let resumeText: string;
  let targetRole: string;

  try {
    const body = (await req.json()) as { resumeText?: string; targetRole?: string };
    resumeText = (body.resumeText ?? "").trim();
    targetRole = (body.targetRole ?? "").trim();
    if (!resumeText) return NextResponse.json({ error: "resumeText is required" }, { status: 400 });
    if (!targetRole) return NextResponse.json({ error: "targetRole is required" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const anthropic = createTracedClient(user.id, "resume/linkedin-advice");

  const prompt = `You are an expert career coach. Produce targeted recommendations to help the candidate improve BOTH their resume and their LinkedIn profile for the role described below.

<resume>
${resumeText}
</resume>

<target_role>
${targetRole}
</target_role>

Respond ONLY with valid JSON in this exact format (no markdown, no commentary):
{
  "resumeGaps": ["<gap 1>", "<gap 2>", "<gap 3>"],
  "bulletRewrites": [
    { "original": "<an actual bullet from the resume>", "revised": "<stronger ATS-optimised version>", "rationale": "<one sentence why>" }
  ],
  "linkedinHeadline": "<a single LinkedIn headline (under 220 chars) tailored to the target role>",
  "linkedinAbout": "<3–5 paragraph LinkedIn About section in first person, sounds human, weaves in target-role keywords>",
  "linkedinTopSkills": ["<skill 1>", "<skill 2>", "<skill 3>", "<skill 4>", "<skill 5>"]
}

Guidelines:
- resumeGaps: 3–5 concrete missing themes, skills, or quantifications relative to the target role
- bulletRewrites: 3–6 entries. ALWAYS quote an actual bullet from the candidate's resume in "original". Make "revised" a verb-led, quantified, ATS-friendly bullet. "rationale" is one sentence.
- linkedinHeadline: punchy, target-role-aligned. Under 220 characters. No emoji.
- linkedinAbout: write it as the candidate would in first person. 3–5 short paragraphs. Surfaces strengths + target-role keywords naturally; no buzzword soup.
- linkedinTopSkills: exactly 5 specific skills (not generic categories) most likely to attract recruiters for the target role.`;

  const msg = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2048,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = (msg.content[0] as { type: string; text: string }).text;
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return NextResponse.json({ error: "AI response parse failed" }, { status: 500 });
  }

  try {
    const result: LinkedInAdviceResult = JSON.parse(jsonMatch[0]);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Failed to parse AI response" }, { status: 500 });
  }
}
