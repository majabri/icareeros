/**
 * POST /api/career-os/target-suggestions
 *
 * Generates suggestions for the Target Skills page (/mycareer/target-skills):
 *   - skills the user should learn next
 *   - education programs to consider
 *   - certifications to pursue
 *
 * Inputs come from THREE sources for tighter targeting:
 *   - career_profiles      → headline, summary, current skills, recent roles
 *   - user_profiles        → target_roles (from /mycareer/preferences)
 *   - career_os_cycles     → goal of the user's currently-active cycle
 *
 * The user clicks ✓ on suggestions to confirm them as targets.
 * Server-side only — ANTHROPIC_API_KEY never reaches the client.
 */

import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createTracedClient } from "@/lib/observability/langfuse";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TargetSuggestions {
  skills: Array<{ name: string; reason: string }>;
  education: Array<{ degree: string; institution: string; reason: string }>;
  certifications: Array<{ name: string; issuer: string; reason: string }>;
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
        setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST() {
  try {
    const supabase = await makeSupabaseServer();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── Source 1: career_profiles (current skills, work history) ─────────────
    const { data: cp } = await supabase
      .from("career_profiles")
      .select("headline, summary, skills, work_experience, target_skills, target_education, target_certifications")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!cp) {
      return NextResponse.json(
        { error: "No career profile yet — fill out /mycareer/profile first" },
        { status: 400 }
      );
    }

    // ── Source 2: user_profiles.target_roles (from /mycareer/preferences) ────
    const { data: up } = await supabase
      .from("user_profiles")
      .select("target_roles, current_position, career_levels")
      .eq("user_id", user.id)
      .maybeSingle();

    // ── Source 3: career_os_cycles.goal (current active cycle) ───────────────
    const { data: activeCycle } = await supabase
      .from("career_os_cycles")
      .select("goal, current_stage, cycle_number")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("cycle_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Build compact context block
    const currentSkills = (cp.skills as string[] | null) ?? [];
    const targetSkills  = (cp.target_skills as string[] | null) ?? [];
    const targetRoles   = (up?.target_roles as string[] | null) ?? [];
    const careerLevels  = (up?.career_levels as string[] | null) ?? [];
    const workExp = (cp.work_experience as Array<{ title?: string; company?: string }> | null) ?? [];
    const recentRoles = workExp.slice(0, 3).map(w =>
      `${w.title ?? "?"} at ${w.company ?? "?"}`
    ).join("; ");

    const userBlock = [
      cp.headline ? `Headline: ${cp.headline}` : null,
      up?.current_position ? `Current position: ${up.current_position}` : null,
      cp.summary  ? `Summary: ${(cp.summary as string).slice(0, 600)}` : null,
      `Current skills (${currentSkills.length}): ${currentSkills.slice(0, 25).join(", ") || "—"}`,
      `Recent roles: ${recentRoles || "—"}`,
      targetRoles.length > 0   ? `Target roles (where they want to go): ${targetRoles.join(", ")}` : null,
      careerLevels.length > 0  ? `Target career levels: ${careerLevels.join(", ")}` : null,
      activeCycle?.goal        ? `Current career-cycle goal: ${activeCycle.goal}` : null,
      activeCycle?.cycle_number ? `Cycle #${activeCycle.cycle_number}, currently in stage: ${activeCycle.current_stage}` : null,
      targetSkills.length > 0  ? `Already-confirmed target skills: ${targetSkills.join(", ")}` : null,
    ].filter(Boolean).join("\n");

    const anthropic = createTracedClient(user.id, "career-os/target-suggestions");

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      tool_choice: { type: "tool", name: "suggest_targets" },
      tools: [
        {
          name: "suggest_targets",
          description: "Suggest aspirational career targets — skills, education programs, and certifications — that this user should consider acquiring next.",
          input_schema: {
            type: "object",
            properties: {
              skills: {
                type: "array",
                description: "5-8 skills the user should learn next, ordered by impact for their target roles.",
                items: {
                  type: "object",
                  properties: {
                    name:   { type: "string" },
                    reason: { type: "string", description: "One sentence — must reference their target role or cycle goal where possible" },
                  },
                  required: ["name", "reason"],
                },
              },
              education: {
                type: "array",
                description: "0-3 education programs (degree or program) to consider, only if relevant given their target level. Be conservative.",
                items: {
                  type: "object",
                  properties: {
                    degree:      { type: "string" },
                    institution: { type: "string" },
                    reason:      { type: "string" },
                  },
                  required: ["degree", "institution", "reason"],
                },
              },
              certifications: {
                type: "array",
                description: "3-5 certifications to pursue, ordered by relevance to their target roles.",
                items: {
                  type: "object",
                  properties: {
                    name:   { type: "string" },
                    issuer: { type: "string" },
                    reason: { type: "string" },
                  },
                  required: ["name", "issuer", "reason"],
                },
              },
            },
            required: ["skills", "education", "certifications"],
          },
        },
      ],
      system: `You suggest aspirational targets — skills, education, and certifications — for a job-seeker inside iCareerOS.

PRIORITIZATION:
- Suggestions must align FIRST with the user's target roles and career-cycle goal (if provided).
- If target roles are present, build the bridge from current skills → target role.
- Don't repeat skills they already have or have already targeted.

QUALITY:
- Skills: prefer concrete, in-demand skills (technologies, frameworks, methodologies) over vague ones ("communication", "leadership").
- Education: only suggest if their target level genuinely requires it. For senior ICs targeting senior IC roles, often empty array is correct.
- Certifications: prefer industry-recognized credentials with clear ROI for their target role.
- Each suggestion needs a one-sentence reason that names a target role or cycle goal where possible.`,
      messages: [
        {
          role: "user",
          content: `Suggest target skills, education, and certifications for this user:\n\n${userBlock}\n\nReturn 5-8 skills, 0-3 education entries, 3-5 certifications.`,
        },
      ],
    });

    // Extract tool_use block
    const toolBlock = response.content.find(b => b.type === "tool_use");
    if (!toolBlock || toolBlock.type !== "tool_use") {
      return NextResponse.json({ error: "No suggestions returned" }, { status: 500 });
    }

    const suggestions = toolBlock.input as TargetSuggestions;

    return NextResponse.json(suggestions);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to generate suggestions";
    console.error("[target-suggestions] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
