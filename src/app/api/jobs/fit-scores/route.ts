import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import Anthropic from "@anthropic-ai/sdk";
import { cache } from "@/lib/cache";

// ── Types ────────────────────────────────────────────────────────────────────

interface FitScore {
  fit_score: number;         // 0-100
  match_summary: string;
  strengths: string[];
  skill_gaps: string[];
}

interface Opportunity {
  id: string;
  title: string;
  company: string;
  description: string | null;
  job_type: string | null;
  is_remote: boolean | null;
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── Auth ────────────────────────────────────────────────────────────────────
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

  // ── Parse body ──────────────────────────────────────────────────────────────
  let opportunityIds: string[];
  let cycleId: string | undefined;

  try {
    const body = await req.json();
    if (!Array.isArray(body.opportunity_ids) || body.opportunity_ids.length === 0) {
      return NextResponse.json(
        { error: "opportunity_ids must be a non-empty array" },
        { status: 400 }
      );
    }
    // Cap at 20 to keep prompt size reasonable
    opportunityIds = (body.opportunity_ids as string[]).slice(0, 20);
    cycleId = body.cycle_id as string | undefined;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // ── Load user profile context ───────────────────────────────────────────────
  let userContext = "";

  // Prefer evaluate stage notes (richest signal)
  if (cycleId) {
    const { data: stageRow } = await supabase
      .from("career_os_stages")
      .select("notes")
      .eq("user_id", user.id)
      .eq("cycle_id", cycleId)
      .eq("stage", "evaluate")
      .eq("status", "completed")
      .maybeSingle();

    if (stageRow?.notes) {
      const n = stageRow.notes as Record<string, unknown>;
      userContext = [
        `Career level: ${n.careerLevel ?? "unknown"}`,
        `Market fit score: ${n.marketFitScore ?? "N/A"}/100`,
        `Skills: ${Array.isArray(n.skills) ? (n.skills as string[]).join(", ") : "none listed"}`,
        `Skill gaps: ${Array.isArray(n.gaps) ? (n.gaps as string[]).join(", ") : "none listed"}`,
        `AI summary: ${n.summary ?? ""}`,
      ].join("\n");
    }
  }

  // Fallback: user_profiles table
  if (!userContext) {
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("current_position,target_roles,skills,experience_level,location,open_to_remote")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profile) {
      userContext = [
        `Current position: ${profile.current_position ?? "not specified"}`,
        `Target roles: ${Array.isArray(profile.target_roles) ? profile.target_roles.join(", ") : "not specified"}`,
        `Skills: ${Array.isArray(profile.skills) ? profile.skills.join(", ") : "not specified"}`,
        `Experience level: ${profile.experience_level ?? "not specified"}`,
        `Location: ${profile.location ?? "not specified"}`,
        `Open to remote: ${profile.open_to_remote ? "yes" : "no"}`,
      ].join("\n");
    }
  }

  if (!userContext) {
    // No profile at all — return empty scores gracefully
    return NextResponse.json({ scores: {} });
  }

  // ── Fetch opportunity details ───────────────────────────────────────────────
  const { data: opps, error: oppsErr } = await supabase
    .from("opportunities")
    .select("id,title,company,description,job_type,is_remote")
    .in("id", opportunityIds);

  if (oppsErr) {
    return NextResponse.json({ error: oppsErr.message }, { status: 500 });
  }

  if (!opps || opps.length === 0) {
    return NextResponse.json({ scores: {} });
  }

  // ── Cache check (per user+opportunity set, TTL 6h) ──────────────────────────
  const userId = user.id;
  const cacheKey = cache.key("fit", userId, opportunityIds.sort());
  const cachedScores = await cache.get<Record<string, unknown>>(cacheKey);
  if (cachedScores) return NextResponse.json({ scores: cachedScores });

  // ── Build prompt ────────────────────────────────────────────────────────────
  const opportunitiesText = (opps as Opportunity[])
    .map((opp, i) =>
      [
        `OPPORTUNITY ${i + 1} (id: ${opp.id})`,
        `Title: ${opp.title}`,
        `Company: ${opp.company}`,
        `Type: ${opp.job_type ?? "N/A"} | Remote: ${opp.is_remote ? "yes" : "no"}`,
        `Description: ${(opp.description ?? "").slice(0, 300)}`,
      ].join("\n")
    )
    .join("\n\n");

  const systemPrompt = `You are a career matching expert. Score each job opportunity for fit against the candidate's profile.

For each opportunity, return a JSON object with:
- fit_score: integer 0-100 (>=75 = strong match, 50-74 = partial match, <50 = weak match)
- match_summary: one concise sentence (max 20 words) explaining the fit
- strengths: array of 1-3 short strings (what the candidate brings)
- skill_gaps: array of 0-2 short strings (what they may be missing)

Return ONLY a valid JSON object mapping each opportunity ID to its score object.
Example format:
{
  "uuid-1": { "fit_score": 82, "match_summary": "...", "strengths": ["..."], "skill_gaps": [] },
  "uuid-2": { "fit_score": 45, "match_summary": "...", "strengths": ["..."], "skill_gaps": ["..."] }
}`;

  const userMessage = `CANDIDATE PROFILE:\n${userContext}\n\nOPPORTUNITIES TO SCORE:\n${opportunitiesText}\n\nReturn the JSON score map now.`;

  // ── Call Claude Haiku ───────────────────────────────────────────────────────
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let raw: string;
  try {
    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [{ role: "user", content: userMessage }],
      system: systemPrompt,
    });
    raw = msg.content[0]?.type === "text" ? msg.content[0].text : "";
  } catch (err) {
    return NextResponse.json(
      { error: "AI scoring failed: " + (err instanceof Error ? err.message : "unknown") },
      { status: 500 }
    );
  }

  // ── Parse response ──────────────────────────────────────────────────────────
  let scores: Record<string, FitScore> = {};
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found in response");
    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;

    // Validate and sanitise each score entry
    for (const [id, val] of Object.entries(parsed)) {
      if (typeof val !== "object" || val === null) continue;
      const v = val as Record<string, unknown>;
      scores[id] = {
        fit_score: Math.min(100, Math.max(0, Number(v.fit_score ?? 0))),
        match_summary: String(v.match_summary ?? ""),
        strengths: Array.isArray(v.strengths) ? (v.strengths as string[]).slice(0, 3) : [],
        skill_gaps: Array.isArray(v.skill_gaps) ? (v.skill_gaps as string[]).slice(0, 3) : [],
      };
    }
  } catch {
    // Return partial or empty scores rather than 500 — non-blocking feature
    return NextResponse.json({ scores: {} });
  }

  // Cache fit scores for 6h — profile rarely changes that fast
  await cache.set(cacheKey, scores, 6 * 60 * 60);
  return NextResponse.json({ scores });
}
