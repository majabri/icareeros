/**
 * POST /api/resume/generate
 *
 * feat/jobs-smart-apply (Feature 1) — Claude-tailored resume generator.
 *
 * Reads the user's career_profiles row, picks the 3-5 most relevant
 * experiences for the target role, rewrites bullets to emphasise keywords
 * from the job description, filters skills to 8-10 most relevant, and
 * returns a structured resume payload plus a "why these experiences"
 * rationale.
 *
 * Auth: 401 for unauthenticated. Never stores generated content server-side
 * — the client persists via /api/resume/versions if the user chooses.
 */

import { NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { withCrossSubdomainCookie } from "@/lib/supabase-cookie-options";
import { createTracedClient } from "@/lib/observability/langfuse";
import { stripJsonFences } from "@/lib/career-os/stripJsonFences";

async function makeSupabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, withCrossSubdomainCookie(options))
          );
        },
      },
    }
  );
}

export interface GenerateResumeBody {
  jobTitle:       string;
  jobDescription: string;
  targetCompany:  string;
}

export interface GeneratedResume {
  name:      string;
  headline:  string;
  summary:   string;
  experience: Array<{
    company: string;
    title:   string;
    dates:   string;
    bullets: string[];
  }>;
  skills:      string[];
  education:   Array<{ institution: string; degree: string; year: string }>;
  targetedFor: string;
  whyTheseProjects: string;
}

const SYSTEM_PROMPT = `You are an expert resume-writer for iCareerOS.

You will be given:
  1. A CANDIDATE PROFILE (name, headline, skills, work_experience, education).
  2. A TARGET JOB (title, company, full job description).

Your task: produce a **tailored resume** that positions the candidate for this specific role.

Steps you MUST follow:
  A. Pick the 3-5 most relevant experience entries from work_experience.
     Skip entries that don't help the story. Preserve the order (most
     recent first) among the picks.
  B. Rewrite each picked entry's bullets to:
       - Emphasise keywords from the job description
       - Lead with impact / metrics where the source data supports it
       - Keep 3-5 bullets per entry, each starting with a strong verb
  C. Filter skills to the top 8-10 most relevant to this JD.
  D. Write a 2-sentence summary calibrated to this exact role.
  E. Explain in whyTheseProjects (2-4 sentences) which experiences you
     chose and why they matter for THIS role.

Return ONLY valid JSON — no prose, no markdown fences — matching:
{
  "name":     "<full name>",
  "headline": "<current headline / role>",
  "summary":  "<2-sentence targeted summary>",
  "experience": [
    { "company": "...", "title": "...", "dates": "...", "bullets": ["...", "..."] }
  ],
  "skills":    ["...", "..."],
  "education": [ { "institution": "...", "degree": "...", "year": "..." } ],
  "targetedFor":      "<job title> at <company>",
  "whyTheseProjects": "<2-4 sentence rationale>"
}

Rules:
- Never invent facts. If a bullet needs data the profile doesn't have, rewrite around what IS in the profile.
- Bullets must be truthful reformulations of the source, not fiction.
- If the profile has fewer than 3 experience entries, use all of them.`;

interface CareerProfileRow {
  full_name?:      string | null;
  headline?:       string | null;
  summary?:        string | null;
  skills?:         string[] | null;
  work_experience?: Array<Record<string, unknown>> | null;
  education?:      Array<Record<string, unknown>> | null;
}

export async function POST(req: Request) {
  try {
    const supabase = await makeSupabaseServer();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as Partial<GenerateResumeBody>;
    const jobTitle       = (body.jobTitle       ?? "").trim();
    const jobDescription = (body.jobDescription ?? "").trim();
    const targetCompany  = (body.targetCompany  ?? "").trim();
    if (!jobTitle || !jobDescription || !targetCompany) {
      return NextResponse.json({ error: "jobTitle, jobDescription, and targetCompany are required" }, { status: 400 });
    }

    const { data: profileRaw } = await supabase
      .from("career_profiles")
      .select("full_name, headline, summary, skills, work_experience, education")
      .eq("user_id", user.id)
      .maybeSingle();
    const profile = (profileRaw ?? {}) as CareerProfileRow;

    if (!profile.work_experience || profile.work_experience.length === 0) {
      return NextResponse.json(
        { error: "Add work experience to your career profile before tailoring a resume." },
        { status: 422 }
      );
    }

    const userMessage = [
      "CANDIDATE PROFILE:",
      JSON.stringify({
        name:        profile.full_name ?? "",
        headline:    profile.headline  ?? "",
        summary:     profile.summary   ?? "",
        skills:      profile.skills    ?? [],
        experience:  profile.work_experience,
        education:   profile.education ?? [],
      }, null, 2),
      "",
      "TARGET JOB:",
      `  Title:   ${jobTitle}`,
      `  Company: ${targetCompany}`,
      `  Description:`,
      jobDescription.slice(0, 8000),
    ].join("\n");

    const anthropic = createTracedClient(user.id, "resume/generate");
    let msg;
    try {
      msg = await anthropic.messages.create({
        model:      "claude-sonnet-4-6",
        max_tokens: 3072,
        temperature: 0,
        system:     SYSTEM_PROMPT,
        messages:  [{ role: "user", content: userMessage }],
      });
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : "Anthropic call failed";
      console.error("[resume/generate] anthropic error:", errMsg);
      return NextResponse.json({ error: `Resume generator error: ${errMsg}` }, { status: 502 });
    }

    const raw = (msg.content[0] as { type: string; text: string }).text;
    const cleaned = stripJsonFences(raw);
    let parsed: GeneratedResume;
    try {
      parsed = JSON.parse(cleaned) as GeneratedResume;
    } catch {
      return NextResponse.json({ error: "AI response was not valid JSON" }, { status: 500 });
    }

    // Defensive defaults so consumers don't crash on partial output
    parsed.name        = parsed.name        ?? profile.full_name ?? "";
    parsed.headline    = parsed.headline    ?? profile.headline  ?? "";
    parsed.summary     = parsed.summary     ?? "";
    parsed.experience  = Array.isArray(parsed.experience) ? parsed.experience : [];
    parsed.skills      = Array.isArray(parsed.skills)     ? parsed.skills     : [];
    parsed.education   = Array.isArray(parsed.education)  ? parsed.education  : [];
    parsed.targetedFor = parsed.targetedFor ?? `${jobTitle} at ${targetCompany}`;
    parsed.whyTheseProjects = parsed.whyTheseProjects ?? "";

    return NextResponse.json(parsed);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    console.error("[resume/generate] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
