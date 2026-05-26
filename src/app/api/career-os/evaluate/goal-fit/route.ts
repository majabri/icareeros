/**
 * POST /api/career-os/evaluate/goal-fit
 *
 * Evaluate the authenticated user's profile against their stated CAREER GOAL
 * (target roles in user_profiles.target_roles). Companion to /api/career-os/
 * evaluate (which produces a generic profile analysis) and POST /api/resume/
 * fit-check (which compares against a specific JD).
 *
 * Distinction from sibling endpoints:
 *   - /evaluate           — profile-only, general market read (no target)
 *   - /evaluate/goal-fit  — profile vs each target_role, strategic gap analysis  ← THIS
 *   - /resume/fit-check   — profile vs a specific pasted/imported JD
 *
 * Used by the /evaluate/goal page. ANTHROPIC_API_KEY stays server-side.
 *
 * Filed 2026-05-26 alongside the /fit-check + /resumeadvisor consolidation.
 */

import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { withCrossSubdomainCookie } from "@/lib/supabase-cookie-options";
import type { CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
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

const SYSTEM_PROMPT = `You are a senior career advisor inside iCareerOS — an AI-powered Career Operating System.

Your task: compare a user's current career profile against their TARGET role(s), and return a structured JSON gap analysis per target role.

Return ONLY valid JSON — no prose, no markdown fences — matching this exact shape:
{
  "overall_summary": "One paragraph plain text summarising readiness across all target roles.",
  "target_roles": [
    {
      "title": "<verbatim target role title>",
      "fitScore": 64,
      "readinessLevel": "early" | "developing" | "ready" | "competitive",
      "strengths": ["skill or experience matching this target", ...],
      "gaps": ["concrete skill or experience missing for this target", ...],
      "next3Actions": ["one-sentence concrete next step", ...],
      "suggestedLearning": ["course/cert/skill the user should add to Target Skills", ...]
    }
  ]
}

Rules:
- One target_roles entry per role the user listed.
- fitScore is 0-100, where 100 = ready to apply confidently to senior versions of this role today.
- readinessLevel mapping: <30 early, 30-59 developing, 60-79 ready, >=80 competitive.
- strengths: 3-6 items pulled from real profile evidence (skills, work experience verbs/scope, education).
- gaps: 3-6 items, CONCRETE and ACTIONABLE — "lacks 5 years of B2B SaaS PM experience" beats "needs more experience".
- next3Actions: 3 items max, each one sentence, each starts with a verb.
- suggestedLearning: items the user could realistically Add To Target Skills (single phrases like "SQL window functions" or "PMP certification").
- Never invent skills or experience the user didn't list.
- If the user has zero target_roles set, return {"overall_summary": "No target role set — visit /mycareer/preferences to set one.", "target_roles": []}.`;

export async function POST() {
  const supabase = await makeSupabaseServer();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Read target_roles from user_profiles (the preferences storage).
  const { data: prefs, error: prefsErr } = await supabase
    .from("user_profiles")
    .select("target_roles, headline")
    .eq("user_id", user.id)
    .maybeSingle();
  if (prefsErr) {
    return NextResponse.json({ error: prefsErr.message }, { status: 500 });
  }
  const targetRoles: string[] = Array.isArray(prefs?.target_roles)
    ? (prefs!.target_roles as string[]).filter(s => typeof s === "string" && s.trim() !== "")
    : [];

  // Read career identity from career_profiles (the canonical career-side table).
  const { data: profile, error: profileErr } = await supabase
    .from("career_profiles")
    .select("full_name, headline, summary, skills, work_experience, education, certifications")
    .eq("user_id", user.id)
    .maybeSingle();
  if (profileErr) {
    return NextResponse.json({ error: profileErr.message }, { status: 500 });
  }

  const userPayload = {
    target_roles: targetRoles,
    profile: {
      headline:        profile?.headline ?? prefs?.headline ?? "",
      summary:         profile?.summary ?? "",
      skills:          profile?.skills ?? [],
      work_experience: profile?.work_experience ?? [],
      education:       profile?.education ?? [],
      certifications:  profile?.certifications ?? [],
    },
  };

  // Empty-target short-circuit — don't burn Claude tokens when the user hasn't
  // told us what they're aiming at.
  if (targetRoles.length === 0) {
    return NextResponse.json({
      overall_summary: "No target role set yet. Visit /mycareer/preferences and add a target role to get a gap analysis.",
      target_roles: [],
      empty: true,
    });
  }

  const anthropic = createTracedClient(user.id, "career-os/evaluate/goal-fit");
  const response = await anthropic.messages.create({
    model:       "claude-haiku-4-5",
    max_tokens:  2048,
    temperature: 0.4,
    system:      SYSTEM_PROMPT,
    messages: [
      {
        role:    "user",
        content: `Compare this career profile against these target role(s) and return the gap analysis JSON.\n\n${JSON.stringify(userPayload, null, 2)}`,
      },
    ],
  });

  const textBlock = response.content.find((b: { type: string }) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    return NextResponse.json({ error: "AI returned no text" }, { status: 502 });
  }
  const raw  = (textBlock as { type: "text"; text: string }).text;
  const json = stripJsonFences(raw);

  try {
    const parsed = JSON.parse(json);
    return NextResponse.json(parsed);
  } catch (e) {
    return NextResponse.json(
      { error: "AI returned invalid JSON", raw, parseError: (e as Error).message },
      { status: 502 },
    );
  }
}
