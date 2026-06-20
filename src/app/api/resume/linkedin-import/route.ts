/**
 * POST /api/resume/linkedin-import
 *
 * Brief B3 Task 19 — LinkedIn import.
 *
 * Accepts pasted LinkedIn profile text and uses Claude Haiku to extract
 * structured data matching career_profiles. The /careerprofile page then
 * merges the result into the user's profile.
 *
 * NOTE: We do not scrape linkedin.com directly. The realistic UX is
 * paste-based, mirroring the resume importer on /careerprofile.
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
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, withCrossSubdomainCookie(options))
          );
        },
      },
    }
  );
}

const SYSTEM_PROMPT = `You are an expert resume parser inside iCareerOS.

The user has pasted plain-text content copied from their LinkedIn profile. Extract structured data matching the iCareerOS career_profiles shape.

Return ONLY valid JSON, no prose, no markdown fences:
{
  "headline": "string or null",
  "summary": "2-4 sentence professional summary, or null",
  "location": "City, State/Country or null",
  "linkedin_url": "https://www.linkedin.com/in/... or null",
  "skills": ["string", ...],
  "work_experience": [
    { "title": "...", "company": "...", "startDate": "YYYY-MM or YYYY", "endDate": "YYYY-MM or YYYY or Present", "description": "..." }
  ],
  "education": [
    { "degree": "...", "school": "...", "graduationDate": "YYYY or YYYY-MM" }
  ],
  "certifications": [
    { "name": "...", "issuer": "...", "date": "YYYY-MM or YYYY", "license_number": "" }
  ]
}

Rules:
- Strict JSON. No trailing commas. No comments.
- Empty arrays as [], scalars absent as null.
- Do NOT invent data. Only what the user pasted.
- Skills: deduplicate, trim, canonical capitalisation.`;

export async function POST(req: Request) {
  try {
    const supabase = await makeSupabaseServer();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({})) as { text?: string };
    const text = (body.text ?? "").trim();
    if (text.length < 80) {
      return NextResponse.json(
        { error: "Pasted text is too short — paste at least your About + Experience sections." },
        { status: 400 }
      );
    }
    if (text.length > 25000) {
      return NextResponse.json(
        { error: "Pasted text is too long (>25,000 chars). Trim to the most relevant sections." },
        { status: 400 }
      );
    }

    const anthropic = createTracedClient(user.id, "linkedin-import");
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: "Extract structured profile data from this LinkedIn paste:\n\n" + text }],
    });

    const raw = message.content[0];
    if (raw.type !== "text") {
      throw new Error("Unexpected response type from Claude");
    }
    const cleaned = stripJsonFences(raw.text);
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;

    void supabase.from("career_os_event_log").insert({
      user_id: user.id,
      event_type: "ai_call",
      event_data: { function: "linkedin-import", status: "completed", chars: text.length },
    });

    return NextResponse.json(parsed);
  } catch (err) {
    const message = err instanceof Error ? err.message : "LinkedIn import failed";
    console.error("[linkedin-import] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
