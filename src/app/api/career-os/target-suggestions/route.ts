/**
 * POST /api/career-os/target-suggestions
 *
 * Generates suggestions for the Target Skills page (/mycareer/target-skills):
 *   - skills the user should learn next
 *   - education programs to consider
 *   - certifications to pursue
 *
 * Inputs come from the user's career_profile (headline, summary, current skills,
 * work experience). The user clicks ✓ on suggestions to confirm them as targets.
 *
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

    // Load the user's career profile for context
    const { data: profile } = await supabase
      .from("career_profiles")
      .select("headline, summary, skills, work_experience, education, certifications, target_skills, target_education, target_certifications")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!profile) {
      return NextResponse.json({ error: "No career profile yet — fill out /mycareer/profile first" }, { status: 400 });
    }

    // Build a compact context for the model
    const currentSkills = (profile.skills as string[] | null) ?? [];
    const targetSkills  = (profile.target_skills as string[] | null) ?? [];
    const workExp = (profile.work_experience as Array<{ title?: string; company?: string; description?: string }> | null) ?? [];
    const recentRoles = workExp.slice(0, 3).map(w =>
      `${w.title ?? "?"} at ${w.company ?? "?"}`
    ).join("; ");

    const userBlock = [
      profile.headline ? `Headline: ${profile.headline}` : null,
      profile.summary  ? `Summary: ${(profile.summary as string).slice(0, 600)}` : null,
      `Current skills (${currentSkills.length}): ${currentSkills.slice(0, 25).join(", ") || "—"}`,
      `Recent roles: ${recentRoles || "—"}`,
      targetSkills.length > 0 ? `Already-confirmed target skills: ${targetSkills.join(", ")}` : null,
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
                description: "5-8 skills the user should learn next, ordered by impact.",
                items: {
                  type: "object",
                  properties: {
                    name:   { type: "string", description: "Skill name (e.g. 'Kubernetes', 'System Design')" },
                    reason: { type: "string", description: "One sentence on why this skill matters for them" },
                  },
                  required: ["name", "reason"],
                },
              },
              education: {
                type: "array",
                description: "2-3 education programs (degree or program) to consider, only if relevant given their level.",
                items: {
                  type: "object",
                  properties: {
                    degree:      { type: "string", description: "Program type, e.g. 'MBA', 'M.S. Computer Science'" },
                    institution: { type: "string", description: "Suggested institution or program type (e.g. 'Top-tier MBA program')" },
                    reason:      { type: "string", description: "One sentence on why" },
                  },
                  required: ["degree", "institution", "reason"],
                },
              },
              certifications: {
                type: "array",
                description: "3-5 certifications to pursue, ordered by relevance.",
                items: {
                  type: "object",
                  properties: {
                    name:   { type: "string", description: "Certification name, e.g. 'AWS Solutions Architect Associate'" },
                    issuer: { type: "string", description: "Issuing org, e.g. 'Amazon Web Services'" },
                    reason: { type: "string", description: "One sentence on why" },
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

Rules:
- Suggestions must be specific to THIS user's headline, summary, current skills, and recent roles.
- Do NOT repeat skills they already have or have already targeted.
- Skills: prefer concrete, in-demand skills (technologies, frameworks, methodologies) over vague ones ("communication", "leadership").
- Education: only suggest if their career level / role would benefit from a degree program. Be conservative — for senior ICs, often empty array is correct.
- Certifications: prefer industry-recognized credentials with clear ROI.
- Each suggestion needs a one-sentence reason grounded in the user's data.`,
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
