/**
 * POST /api/career-os/evaluate
 *
 * Server-side endpoint for the Evaluate stage.
 * Reads the authenticated user's profile from `user_profiles`,
 * calls Claude API to generate an EvaluationResult, and returns it.
 *
 * Kept server-side so ANTHROPIC_API_KEY is never exposed to the browser.
 */

import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createTracedClient } from "@/lib/observability/langfuse";
import type { EvaluationResult } from "@/services/ai/evaluateService";

// ── Helpers ──────────────────────────────────────────────────────────────────

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

// ── System prompt ─────────────────────────────────────────────────────────────

const EVALUATE_SYSTEM = `You are a senior career advisor inside iCareerOS — an AI-powered Career Operating System.

Your task: analyse a user's career profile and return a structured JSON evaluation.

Return ONLY valid JSON — no prose, no markdown fences — matching this exact shape:
{
  "skills": ["skill1", "skill2"],
  "gaps": ["gap1", "gap2"],
  "marketFitScore": 72,
  "careerLevel": "mid",
  "recommendedNextStage": "advise",
  "summary": "One-paragraph plain text summary."
}

Rules:
- skills: list of verified skills from the profile (max 15)
- gaps: list of skills/attributes the user is missing for their target roles (max 8)
- marketFitScore: integer 0-100 estimating how well the user's current profile matches their target roles
- careerLevel: one of "entry", "mid", "senior", "staff", "executive"
- recommendedNextStage: always "advise"
- summary: 2-3 sentence plain English summary of the user's career situation and recommended direction
Be specific and actionable. Do not hallucinate skills the user did not mention.`;

// ── LinkedIn gap analysis (Phase 4 Item 2a) ─────────────────────────────────

const LINKEDIN_SYSTEM = `You are a LinkedIn profile reviewer.

Given a candidate's career data (headline, summary, skills, work experience, target skills), produce specific recommendations for their LinkedIn profile.

Return ONLY valid JSON — no prose, no markdown — matching this exact shape:
{
  "headlineSuggestion": "Optimized 6-12 word LinkedIn headline (specific role + key value prop)",
  "aboutGaps": ["gap1", "gap2", "gap3"],
  "skillsToAdd": ["skill1", "skill2", "skill3", "skill4", "skill5"],
  "strengthScore": 7
}

Rules:
- headlineSuggestion: ONE specific headline rewrite, 6-12 words. Lead with a role title; include a value prop.
- aboutGaps: 2-4 specific gaps in the user's About section. Reference concrete things missing (quantified outcomes, target roles, leadership scope, etc.). Generic advice ("be more specific") is forbidden.
- skillsToAdd: 3-5 specific skills the user should add to their LinkedIn Skills section. Pull from target roles, work experience, or target skills — must be concrete (e.g. "Postgres", "Stakeholder management"), not vague ("communication").
- strengthScore: integer 1-10 honestly assessing current LinkedIn profile strength based on the data provided. Default 5 when data is sparse.
Be specific. Reference what the user actually has, not what a generic LinkedIn profile would have.`;

import type { SubscriptionPlan } from "@/services/billing/types";

async function resolveEffectivePlan(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
): Promise<SubscriptionPlan> {
  const { data } = await supabase
    .from("user_subscriptions")
    .select("plan, status")
    .eq("user_id", userId)
    .maybeSingle();
  const rawPlan = data?.plan;
  const plan: SubscriptionPlan =
    rawPlan && ["free", "premium", "professional"].includes(rawPlan)
      ? (rawPlan as SubscriptionPlan)
      : "free";
  const activeStatuses = ["active", "trialing"];
  return data?.status && activeStatuses.includes(data.status) ? plan : "free";
}

interface LinkedInProfileSnapshot {
  headline:         string;
  summary:          string;
  skills:           string[];
  target_skills:    string[];
  work_experience:  unknown[];   // jsonb passthrough — only the LLM cares about shape
  linkedin_url:     string | null;
}

async function loadCareerProfileForLinkedIn(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
): Promise<LinkedInProfileSnapshot | null> {
  const { data } = await supabase
    .from("career_profiles")
    .select("headline, summary, skills, target_skills, work_experience, linkedin_url")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return null;
  return {
    headline:        (data.headline ?? "").trim(),
    summary:         (data.summary ?? "").trim(),
    skills:          Array.isArray(data.skills)        ? data.skills        : [],
    target_skills:   Array.isArray(data.target_skills) ? data.target_skills : [],
    work_experience: Array.isArray(data.work_experience) ? data.work_experience : [],
    linkedin_url:    data.linkedin_url ?? null,
  };
}

function hasSufficientLinkedInData(p: LinkedInProfileSnapshot | null): boolean {
  if (!p) return false;
  // Run analysis when the user has at least a headline OR summary AND >= 3 skills.
  return (p.headline.length > 0 || p.summary.length > 0) && p.skills.length >= 3;
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    // 1. Auth
    const supabase = await makeSupabaseServer();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Read body (cycleId is optional metadata)
    const body = await req.json().catch(() => ({})) as { cycle_id?: string };
    const cycleId: string | undefined = body?.cycle_id;

    // 3. Load user profile
    const { data: profile, error: profileErr } = await supabase
      .from("user_profiles")
      .select("full_name, current_position, target_roles, skills, experience_level, location, open_to_remote")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profileErr) {
      return NextResponse.json({ error: profileErr.message }, { status: 500 });
    }

    if (!profile) {
      return NextResponse.json(
        { error: "No profile found — save your profile before running Evaluate." },
        { status: 422 }
      );
    }

    // 4. Build user message
    const skills = (profile.skills as string[] | null) ?? [];
    const targetRoles = (profile.target_roles as string[] | null) ?? [];

    const profileText = [
      "Name: " + (profile.full_name || "(not set)"),
      "Current position: " + (profile.current_position || "(not set)"),
      "Experience level: " + (profile.experience_level || "(not set)"),
      "Location: " + (profile.location || "(not set)"),
      "Open to remote: " + (profile.open_to_remote ? "yes" : "no"),
      "Skills: " + (skills.length > 0 ? skills.join(", ") : "(none listed)"),
      "Target roles: " + (targetRoles.length > 0 ? targetRoles.join(", ") : "(none listed)"),
    ].join("\n");

    const userMessage = "Evaluate this career profile:\n\n" + profileText;

    // 5. Call Claude API
    const anthropic = createTracedClient(user.id, "career-os/evaluate");

    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: EVALUATE_SYSTEM,
      messages: [{ role: "user", content: userMessage }],
    });

    // 6. Parse response
    const raw = message.content[0];
    if (raw.type !== "text") {
      throw new Error("Unexpected response type from Claude");
    }

    let result: EvaluationResult;
    try {
      result = JSON.parse(raw.text) as EvaluationResult;
    } catch {
      throw new Error("Claude returned non-JSON: " + raw.text.slice(0, 200));
    }

    // Validate required fields
    if (
      !Array.isArray(result.skills) ||
      !Array.isArray(result.gaps) ||
      typeof result.marketFitScore !== "number" ||
      !result.careerLevel ||
      !result.summary
    ) {
      throw new Error("Claude response missing required fields");
    }

    result.recommendedNextStage = result.recommendedNextStage ?? "advise";

    // ── 7a. LinkedIn gap analysis (Phase 4 Item 2a) ────────────────────────
    // Pull from career_profiles (the canonical career-identity source per
    // CLAUDE.md table-level separation). Skip when data is too thin to
    // produce a useful analysis — never invent a profile from nothing.
    const liProfile = await loadCareerProfileForLinkedIn(supabase, user.id);
    if (hasSufficientLinkedInData(liProfile)) {
      const plan = await resolveEffectivePlan(supabase, user.id);
      if (plan === "free") {
        result.linkedinAnalysis = {
          gated:          true,
          plan:           "free",
          upgradeMessage: "Upgrade to Starter to unlock LinkedIn profile gap analysis.",
        };
      } else {
        try {
          const liUserMessage = [
            "Headline: "         + (liProfile!.headline || "(none)"),
            "Summary: "          + (liProfile!.summary  || "(none)"),
            "Skills: "           + (liProfile!.skills.slice(0, 20).join(", ") || "(none)"),
            "Target skills: "    + (liProfile!.target_skills.slice(0, 10).join(", ") || "(none)"),
            "Work experience: "  + JSON.stringify(liProfile!.work_experience).slice(0, 1500),
            "LinkedIn URL: "     + (liProfile!.linkedin_url ?? "(not provided)"),
            "",
            "Generate the LinkedIn gap analysis.",
          ].join("\n");

          const liMessage = await anthropic.messages.create({
            model:      "claude-haiku-4-5-20251001",
            max_tokens: 700,
            system:     LINKEDIN_SYSTEM,
            messages:   [{ role: "user", content: liUserMessage }],
          });

          const liRaw = liMessage.content[0];
          if (liRaw.type === "text") {
            const parsed = JSON.parse(liRaw.text);
            if (parsed && typeof parsed === "object"
                && typeof parsed.headlineSuggestion === "string"
                && Array.isArray(parsed.aboutGaps)
                && Array.isArray(parsed.skillsToAdd)
                && typeof parsed.strengthScore === "number") {
              result.linkedinAnalysis = {
                headlineSuggestion: parsed.headlineSuggestion,
                aboutGaps:          parsed.aboutGaps.slice(0, 5),
                skillsToAdd:        parsed.skillsToAdd.slice(0, 8),
                strengthScore:      Math.max(1, Math.min(10, Math.round(parsed.strengthScore))),
              };
            }
          }
        } catch (e) {
          // Best-effort — never poison the main evaluation if the LinkedIn
          // sub-analysis fails.
          console.warn("[evaluate] LinkedIn analysis failed (non-fatal):", e instanceof Error ? e.message : e);
        }
      }
    }

    // 7. Log evaluation event (best-effort, non-blocking)
    if (cycleId) {
      void supabase
        .from("career_os_event_log")
        .insert({
          user_id: user.id,
          cycle_id: cycleId,
          event_type: "ai_call",
          event_data: {
            function: "evaluate-career-profile",
            status: "completed",
            skillCount: result.skills.length,
            gapCount: result.gaps.length,
            marketFitScore: result.marketFitScore,
          },
        });
    }

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("[evaluate] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
