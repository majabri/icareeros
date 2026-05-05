/**
 * POST /api/career-os/target-suggestions
 *
 * Researches the user's TARGET JOB TITLES and returns the standard skills,
 * education, and certifications expected for those roles.
 *
 * Input order of authority:
 *   1. user_profiles.target_roles (from /mycareer/preferences) — PRIMARY
 *   2. career_os_cycles.goal of the active cycle — SECONDARY
 *   3. career_profiles.headline + summary + current skills + recent roles — CONTEXT
 *
 * Each suggestion carries a source_role string identifying WHICH target job
 * title it was researched against, so the UI can show the user what role
 * drove the recommendation.
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
  target_roles_used: string[];
  skills:         Array<{ name: string;        source_role: string; reason: string }>;
  education:      Array<{ degree: string;      institution: string; source_role: string; reason: string }>;
  certifications: Array<{ name: string;        issuer: string;      source_role: string; reason: string }>;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

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
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const supabase = await makeSupabaseServer();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Optional: caller can include in-memory dismissed lists so the AI sees them
    // before they have been persisted to the DB. Merge with DB-stored on read.
    const body = await req.json().catch(() => ({})) as {
      dismissedSkills?: string[];
      dismissedEducation?: Array<{ degree: string; institution: string }>;
      dismissedCertifications?: Array<{ name: string; issuer: string }>;
    };

    // ── Load all three sources in parallel ────────────────────────────────────
    const [cpRes, upRes, cycleRes] = await Promise.all([
      supabase
        .from("career_profiles")
        .select("headline, summary, skills, work_experience, target_skills, target_education, target_certifications, dismissed_target_skills, dismissed_target_education, dismissed_target_certifications")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("user_profiles")
        .select("target_roles, current_position, career_levels")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("career_os_cycles")
        .select("goal, current_stage, cycle_number")
        .eq("user_id", user.id)
        .eq("status", "active")
        .order("cycle_number", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const cp = cpRes.data;
    const up = upRes.data;
    const activeCycle = cycleRes.data;

    if (!cp) {
      return NextResponse.json(
        { error: "No career profile yet — fill out /mycareer/profile first" },
        { status: 400 }
      );
    }

    // ── Determine target roles (the PRIMARY input) ────────────────────────────
    const targetRoles = (up?.target_roles as string[] | null)?.filter(r => r && r.trim()) ?? [];

    // If no target roles AND no cycle goal, we can still infer from headline/current_position
    // but the suggestions will be much weaker. Surface that to the client.
    const cycleGoal = (activeCycle?.goal ?? "").trim();
    const inferredFromHeadline = !targetRoles.length && !cycleGoal;

    // ── Build context block ──────────────────────────────────────────────────
    const currentSkills      = (cp.skills as string[] | null) ?? [];
    const alreadyTargeted    = (cp.target_skills as string[] | null) ?? [];
    // Blocklist = DB-stored ∪ caller-provided (the page may have in-flight
    // dismissals that haven't been Saved yet).
    const dbDismissedSkills    = (cp.dismissed_target_skills as string[] | null) ?? [];
    const dbDismissedEducation = (cp.dismissed_target_education as Array<{ degree: string; institution: string }> | null) ?? [];
    const dbDismissedCerts     = (cp.dismissed_target_certifications as Array<{ name: string; issuer: string }> | null) ?? [];

    const dismissedSkills = Array.from(new Set([
      ...dbDismissedSkills,
      ...(body.dismissedSkills ?? []),
    ].map(s => s.trim()).filter(Boolean)));

    const dedupedEdu = new Map<string, { degree: string; institution: string }>();
    for (const e of [...dbDismissedEducation, ...(body.dismissedEducation ?? [])]) {
      const key = `${e.degree}::${e.institution}`.toLowerCase();
      if (!dedupedEdu.has(key)) dedupedEdu.set(key, e);
    }
    const dismissedEducation = Array.from(dedupedEdu.values());

    const dedupedCerts = new Map<string, { name: string; issuer: string }>();
    for (const c of [...dbDismissedCerts, ...(body.dismissedCertifications ?? [])]) {
      const key = `${c.name}::${c.issuer}`.toLowerCase();
      if (!dedupedCerts.has(key)) dedupedCerts.set(key, c);
    }
    const dismissedCertifications = Array.from(dedupedCerts.values());
    const workExp            = (cp.work_experience as Array<{ title?: string; company?: string }> | null) ?? [];
    const recentRoles        = workExp.slice(0, 3).map(w =>
      `${w.title ?? "?"} at ${w.company ?? "?"}`
    ).join("; ");

    const userBlock = [
      `=== TARGET (what to research) ===`,
      targetRoles.length > 0
        ? `Target job titles: ${targetRoles.join(" | ")}`
        : `Target job titles: NOT SET — infer from headline/current position`,
      cycleGoal
        ? `Current career-cycle goal: ${cycleGoal}`
        : null,
      ``,
      `=== USER CONTEXT (for tailoring depth/level) ===`,
      cp.headline           ? `Headline: ${cp.headline}` : null,
      up?.current_position  ? `Current position: ${up.current_position}` : null,
      (up?.career_levels as string[] | null)?.length
                            ? `Target career levels: ${(up?.career_levels as string[]).join(", ")}` : null,
      cp.summary            ? `Summary: ${(cp.summary as string).slice(0, 600)}` : null,
      `Current skills (${currentSkills.length}): ${currentSkills.slice(0, 30).join(", ") || "—"}`,
      `Recent roles: ${recentRoles || "—"}`,
      ``,
      `=== ALREADY CONFIRMED — DO NOT REPEAT ===`,
      alreadyTargeted.length > 0
        ? `Already-confirmed target skills: ${alreadyTargeted.join(", ")}`
        : `(none yet)`,
      ``,
      `=== USER HAS DISMISSED THESE — DO NOT EVER SUGGEST AGAIN ===`,
      dismissedSkills.length > 0
        ? `Dismissed skills: ${dismissedSkills.join(", ")}`
        : null,
      dismissedEducation.length > 0
        ? `Dismissed education: ${dismissedEducation.map(e => `${e.degree} at ${e.institution}`).join("; ")}`
        : null,
      dismissedCertifications.length > 0
        ? `Dismissed certifications: ${dismissedCertifications.map(c => `${c.name} by ${c.issuer}`).join("; ")}`
        : null,
      (dismissedSkills.length === 0 && dismissedEducation.length === 0 && dismissedCertifications.length === 0)
        ? `(no dismissed items yet)`
        : null,
    ].filter(Boolean).join("\n");

    const anthropic = createTracedClient(user.id, "career-os/target-suggestions");

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      tool_choice: { type: "tool", name: "research_targets" },
      tools: [
        {
          name: "research_targets",
          description: "Research the user's target job titles and return the standard skills, education programs, and certifications typically expected for those roles.",
          input_schema: {
            type: "object",
            properties: {
              target_roles_used: {
                type: "array",
                description: "The exact list of target job titles you researched. Echo back what you used so the client can verify.",
                items: { type: "string" },
              },
              skills: {
                type: "array",
                description: "5-10 skills standard for the target job titles, ordered by impact. Each suggestion must name which target role it's for via source_role.",
                items: {
                  type: "object",
                  properties: {
                    name:        { type: "string", description: "Skill name (e.g. 'Kubernetes', 'GAAP Financial Reporting')" },
                    source_role: { type: "string", description: "The target job title this skill is for. Must match one entry in target_roles_used." },
                    reason:      { type: "string", description: "One sentence on why this skill is standard for that role" },
                  },
                  required: ["name", "source_role", "reason"],
                },
              },
              education: {
                type: "array",
                description: "0-3 education programs (degrees / programs) standard for the target job titles. Be conservative — only suggest if the role typically requires advanced education. For senior ICs targeting senior IC roles, often empty array is correct.",
                items: {
                  type: "object",
                  properties: {
                    degree:      { type: "string" },
                    institution: { type: "string", description: "Institution type or named program (e.g. 'Top-30 MBA program', 'Cornell ILR')" },
                    source_role: { type: "string" },
                    reason:      { type: "string" },
                  },
                  required: ["degree", "institution", "source_role", "reason"],
                },
              },
              certifications: {
                type: "array",
                description: "3-6 industry-recognized certifications standard for the target job titles, ordered by relevance.",
                items: {
                  type: "object",
                  properties: {
                    name:        { type: "string" },
                    issuer:      { type: "string" },
                    source_role: { type: "string" },
                    reason:      { type: "string" },
                  },
                  required: ["name", "issuer", "source_role", "reason"],
                },
              },
            },
            required: ["target_roles_used", "skills", "education", "certifications"],
          },
        },
      ],
      system: `You are a career-research assistant inside iCareerOS. Your job: given a user's TARGET JOB TITLES, research and return the skills, education, and certifications that are STANDARD INDUSTRY EXPECTATIONS for those roles.

Treat the target roles as the PRIMARY INPUT. For each target role:
- What skills do hiring managers typically require? (technologies, frameworks, methodologies, domain knowledge)
- What education credentials are typically required or strongly preferred?
- What industry-recognized certifications carry weight?

Use the user's context (current skills, recent roles, level) to TAILOR DEPTH — don't suggest beginner skills to a senior person, don't suggest "leadership" to an IC unless they're targeting management.

RULES
- Every suggestion MUST set source_role to one of the target_roles_used entries.
- target_roles_used echoes back the exact list of target titles you researched (deduplicated, trimmed).
- Skills section: prefer concrete, in-demand skills over vague soft skills.
- Education: only suggest if the target role typically requires/prefers advanced education. Senior IC → senior IC almost always needs no degree program.
- Certifications: prefer industry-recognized credentials with clear ROI for the target role.
- Each reason should reference the target role concretely (e.g. "VP of Product roles increasingly require...", "CPA-track accountants typically need...").
- Never repeat skills the user already has or already confirmed as targets.

If target job titles are NOT set, infer them from the user's headline + current_position + career_levels and call them out in target_roles_used.`,
      messages: [
        {
          role: "user",
          content: `Research target skills, education, and certifications for this user:\n\n${userBlock}\n\nReturn 5-10 skills, 0-3 education entries, 3-6 certifications. Each item must reference its source_role.`,
        },
      ],
    });

    const toolBlock = response.content.find(b => b.type === "tool_use");
    if (!toolBlock || toolBlock.type !== "tool_use") {
      return NextResponse.json({ error: "No suggestions returned" }, { status: 500 });
    }

    const result = toolBlock.input as TargetSuggestions;

    return NextResponse.json({
      ...result,
      _meta: {
        had_target_roles: targetRoles.length > 0,
        had_cycle_goal:   cycleGoal.length > 0,
        inferred:         inferredFromHeadline,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to generate suggestions";
    console.error("[target-suggestions] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
