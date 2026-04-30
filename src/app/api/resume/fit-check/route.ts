import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import Anthropic from "@anthropic-ai/sdk";

export interface FitCheckResult {
  fitScore: number;
  summary: string;
  strengths: string[];
  gaps: string[];
  missingSkills: string[];
  recommendations: string[];
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
    }
  );

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let resumeText: string;
  let jobDescription: string;

  try {
    const body = await req.json();
    resumeText    = (body.resumeText    ?? "").trim();
    jobDescription = (body.jobDescription ?? "").trim();

    if (!resumeText)    return NextResponse.json({ error: "resumeText is required" },    { status: 400 });
    if (!jobDescription) return NextResponse.json({ error: "jobDescription is required" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

  const prompt = `You are an expert career coach and ATS analyst. Assess how well a candidate's resume fits a job description.

<resume>
${resumeText}
</resume>

<job_description>
${jobDescription}
</job_description>

Provide a detailed fit analysis. Respond ONLY with valid JSON in this exact format:
{
  "fitScore": <integer 0-100>,
  "summary": "<2-3 sentence overall assessment>",
  "strengths": ["<strength 1>", "<strength 2>", "<strength 3>"],
  "gaps": ["<gap 1>", "<gap 2>", "<gap 3>"],
  "missingSkills": ["<skill 1>", "<skill 2>"],
  "recommendations": ["<recommendation 1>", "<recommendation 2>", "<recommendation 3>"]
}

Guidelines:
- fitScore: 80-100 = strong fit, 60-79 = moderate fit, 40-59 = partial fit, below 40 = weak fit
- strengths: 3-5 specific things the candidate has that match the job
- gaps: 2-4 specific things the job requires that the candidate lacks or has weakly
- missingSkills: concrete skills/tools/technologies in the JD not on the resume
- recommendations: 2-4 actionable steps to improve this resume for this specific role`;

  const msg = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = (msg.content[0] as { type: string; text: string }).text;
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return NextResponse.json({ error: "AI response parse failed" }, { status: 500 });
  }

  try {
    const result: FitCheckResult = JSON.parse(jsonMatch[0]);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Failed to parse AI response" }, { status: 500 });
  }
}
