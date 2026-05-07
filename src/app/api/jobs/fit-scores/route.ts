import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient as createServiceRoleClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createTracedClient } from "@/lib/observability/langfuse";
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
    // Cap at 15 to keep response size within max_tokens budget — see comment
    // at the messages.create call below.
    opportunityIds = (body.opportunity_ids as string[]).slice(0, 15);
    cycleId = body.cycle_id as string | undefined;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // ── Load user profile context ───────────────────────────────────────────────
  // Priority order:
  //   1. career_profiles      — the user's actual resume (skills, experience, education, certs)
  //   2. career_os_stages     — Evaluate-stage AI notes (rich but only present after evaluate)
  //   3. user_profiles        — basic preferences (fallback)
  let userContext = "";

  // 1. PRIMARY — read the user's actual resume content
  const { data: career } = await supabase
    .from("career_profiles")
    .select("headline, summary, skills, work_experience, education, certifications, target_skills")
    .eq("user_id", user.id)
    .maybeSingle();

  if (career) {
    const skills        = (career.skills as string[] | null) ?? [];
    const targetSkills  = (career.target_skills as string[] | null) ?? [];
    const workExp       = (career.work_experience as Array<{
      title?: string; company?: string; startDate?: string; endDate?: string; description?: string;
    }> | null) ?? [];
    const education     = (career.education as Array<{
      degree?: string; institution?: string; year?: string;
    }> | null) ?? [];
    const certs         = (career.certifications as Array<{
      name?: string; issuer?: string;
    }> | null) ?? [];

    // Compact each work entry — title, company, dates, first 200 chars of description
    const workSummary = workExp.slice(0, 5).map(w => {
      const dates = [w.startDate, w.endDate].filter(Boolean).join(" — ") || "";
      const head  = `${w.title ?? "?"} at ${w.company ?? "?"}${dates ? ` (${dates})` : ""}`;
      const desc  = w.description ? ` — ${(w.description as string).replace(/\s+/g, " ").slice(0, 200)}` : "";
      return `• ${head}${desc}`;
    }).join("\n");

    const eduSummary = education.slice(0, 4).map(e =>
      `• ${e.degree ?? "?"}, ${e.institution ?? "?"}${e.year ? ` (${e.year})` : ""}`
    ).join("\n");

    const certSummary = certs.slice(0, 6).map(c =>
      `• ${c.name ?? "?"}${c.issuer ? ` — ${c.issuer}` : ""}`
    ).join("\n");

    userContext = [
      career.headline ? `HEADLINE: ${career.headline}`        : null,
      career.summary  ? `SUMMARY: ${(career.summary as string).slice(0, 600)}` : null,
      skills.length   ? `SKILLS (${skills.length}): ${skills.slice(0, 40).join(", ")}` : null,
      targetSkills.length ? `TARGET SKILLS (acquiring): ${targetSkills.join(", ")}` : null,
      workSummary     ? `WORK EXPERIENCE:\n${workSummary}`   : null,
      eduSummary      ? `EDUCATION:\n${eduSummary}`          : null,
      certSummary     ? `CERTIFICATIONS:\n${certSummary}`    : null,
    ].filter(Boolean).join("\n\n");
  }

  // 2. SECONDARY — append Evaluate-stage AI notes if present (extra signal)
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
      const stageNotes = [
        `Career level: ${n.careerLevel ?? "unknown"}`,
        `Market fit score: ${n.marketFitScore ?? "N/A"}/100`,
        `Skills: ${Array.isArray(n.skills) ? (n.skills as string[]).join(", ") : "none listed"}`,
        `Skill gaps: ${Array.isArray(n.gaps) ? (n.gaps as string[]).join(", ") : "none listed"}`,
        `AI summary: ${n.summary ?? ""}`,
      ].join("\n");
      // Append Evaluate notes to whatever resume context we already have
      userContext = userContext
        ? `${userContext}\n\nEVALUATE-STAGE NOTES:\n${stageNotes}`
        : stageNotes;
    }
  }

  // Fallback: user_profiles table (only when career_profiles is empty too)
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
  // RLS NOTE: opportunities only has policies for service_role. Reading
  // through the user-session client returns 0 rows silently, which would
  // cause the early-return {scores:{}} path. Same shape as PR #126 for
  // /api/jobs/{agent,search} upserts. Phase 6 Item 3.
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const oppsClient = serviceKey
    ? createServiceRoleClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        serviceKey,
        { auth: { persistSession: false } },
      )
    : supabase; // fallback — will return 0 rows but matches prior behaviour
  const { data: opps, error: oppsErr } = await oppsClient
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

Return ONLY a valid JSON object mapping each opportunity's actual UUID
(the value after "id:" in each OPPORTUNITY block above) to its score object.
DO NOT use placeholders like "uuid-1" — use the exact UUID strings from the input.

Example with real UUIDs:
{
  "0043b853-7c80-437e-b406-f406fad078df": { "fit_score": 82, "match_summary": "...", "strengths": ["..."], "skill_gaps": [] },
  "6a97f7fb-cc14-473c-911a-4eb967b06482": { "fit_score": 45, "match_summary": "...", "strengths": ["..."], "skill_gaps": ["..."] }
}`;

  const userMessage = `CANDIDATE PROFILE:\n${userContext}\n\nOPPORTUNITIES TO SCORE:\n${opportunitiesText}\n\nReturn the JSON score map now.`;

  // ── Call Claude Haiku ───────────────────────────────────────────────────────
  const anthropic = createTracedClient(user.id, "jobs/fit-scores");

  let raw: string;
  try {
    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      // Each score object is ~80-130 tokens of JSON. 1024 was too small for
      // 20 jobs and Claude's output got truncated mid-JSON, parse failed,
      // route returned {scores:{}} for full batches even though small batches
      // worked. 4096 fits ~30 jobs comfortably; we cap input at 15 above so
      // there's headroom. Phase 6 Item 3 (post-PR-#129).
      max_tokens: 4096,
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

    // Validate and sanitise each score entry.
    // Phase 6 Item 3 — accept three key shapes from Claude:
    //   1. real UUIDs (preferred, what the prompt asks for)
    //   2. "uuid-N" / "OPPORTUNITY N" / "N" / "opp-N" placeholders that
    //      we map back to the input UUID by 1-based index.
    // The map below keys remap-target → input UUID for fallback lookups.
    const idByIndex = new Map<string, string>();
    opportunityIds.forEach((id, i) => {
      const idx = String(i + 1);
      idByIndex.set(idx, id);
      idByIndex.set(`uuid-${idx}`, id);
      idByIndex.set(`opp-${idx}`, id);
      idByIndex.set(`OPPORTUNITY ${idx}`, id);
      idByIndex.set(`OPP_${idx}`, id);
    });
    const validIdSet = new Set(opportunityIds);

    for (const [id, val] of Object.entries(parsed)) {
      if (typeof val !== "object" || val === null) continue;
      const v = val as Record<string, unknown>;
      const finalId = validIdSet.has(id) ? id : idByIndex.get(id);
      if (!finalId) continue; // unmappable key — skip, log only at scale
      scores[finalId] = {
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

  // Cache fit scores for 6h — profile rarely changes that fast.
  // Do NOT cache empty score maps — they would lock the user into a
  // permanent "No score" state if Claude ever returned mismatched keys.
  // Phase 6 Item 3 — was a cache lockup that masked the real fix.
  if (Object.keys(scores).length > 0) {
    await cache.set(cacheKey, scores, 6 * 60 * 60);
  }
  return NextResponse.json({ scores });
}
