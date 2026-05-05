/**
 * POST /api/jobs/agent — AI Job-Matching Agent
 *
 * Two-phase flow:
 *   1. PLAN  — Claude reads the user's resume + preferences and produces
 *              3-5 strategic Adzuna search plans (queries that will, together,
 *              surface the most relevant jobs).
 *   2. RUN   — Server runs every plan against Adzuna in parallel, merges +
 *              dedupes by URL, upserts into the opportunities table so
 *              fit-scoring can later attach UUIDs.
 *
 * The agent solves the empty-target_roles case: when the user hasn't filled
 * out their preferences, Claude infers intent from work history, summary,
 * skills, and headline.
 *
 * Server-side only — ANTHROPIC_API_KEY + ADZUNA_APP_* never reach the client.
 */

import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createTracedClient } from "@/lib/observability/langfuse";
import { searchAdzuna, type AdzunaSearchParams } from "@/services/integrations/adzunaAdapter";
import type { OpportunityResult } from "@/services/opportunityTypes";
import { validateJobs } from "@/services/jobs/jobValidator";
import { attachCompanyApplyUrls } from "@/services/jobs/companyUrlResolver";

interface SearchPlan {
  what:        string;
  where?:      string;
  jobType?:    "full_time" | "part_time" | "contract" | "permanent";
  remote?:     boolean;
  rationale:   string;
}

interface PlanResponse {
  plans: SearchPlan[];
}

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

export async function POST() {
  try {
    const supabase = await makeSupabaseServer();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── Load context in parallel ───────────────────────────────────────────
    const [cpRes, upRes, cycleRes] = await Promise.all([
      supabase
        .from("career_profiles")
        .select("headline, summary, skills, work_experience, target_skills")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("user_profiles")
        .select("target_roles, current_position, career_levels, location_city, location_state, location_country, work_mode, job_type, salary_min, salary_max")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("career_os_cycles")
        .select("goal, current_stage")
        .eq("user_id", user.id)
        .eq("status", "active")
        .order("cycle_number", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const cp = cpRes.data;
    const up = upRes.data;
    const cycle = cycleRes.data;

    if (!cp) {
      return NextResponse.json(
        { error: "No career profile yet. Add one in /mycareer/profile.", opportunities: [], total: 0 },
        { status: 400 }
      );
    }

    // ── Build the resume context block for the planner ────────────────────
    const skills        = (cp.skills as string[] | null) ?? [];
    const targetRoles   = ((up?.target_roles as string[] | null) ?? []).filter(Boolean);
    const workExp       = (cp.work_experience as Array<{
      title?: string; company?: string; description?: string; startDate?: string; endDate?: string;
    }> | null) ?? [];

    const recentWork = workExp.slice(0, 4).map(w => {
      const dates = [w.startDate, w.endDate].filter(Boolean).join(" — ");
      const desc  = w.description ? ` — ${(w.description as string).replace(/\s+/g, " ").slice(0, 150)}` : "";
      return `• ${w.title ?? "?"} at ${w.company ?? "?"}${dates ? ` (${dates})` : ""}${desc}`;
    }).join("\n");

    const city  = (up?.location_city as string | null) ?? "";
    const state = (up?.location_state as string | null) ?? "";
    const userLocation = [city, state].filter(Boolean).join(", ");

    const resumeBlock = [
      cp.headline ? `Headline: ${cp.headline}` : null,
      up?.current_position ? `Current position: ${up.current_position}` : null,
      cp.summary  ? `Summary: ${(cp.summary as string).slice(0, 500)}` : null,
      `Skills (${skills.length}): ${skills.slice(0, 30).join(", ") || "—"}`,
      recentWork ? `Recent work:\n${recentWork}` : null,
      targetRoles.length > 0 ? `User-stated target roles: ${targetRoles.join(", ")}` : `User-stated target roles: NOT SET — infer from work history`,
      cycle?.goal ? `Current career goal: ${cycle.goal}` : null,
      userLocation ? `Preferred location: ${userLocation}` : null,
      (up?.work_mode as string[] | null)?.includes("remote") ? "Open to remote" : null,
    ].filter(Boolean).join("\n");

    // ── Phase 1: Ask Claude to plan ────────────────────────────────────────
    const anthropic = createTracedClient(user.id, "jobs/agent/plan");

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      tool_choice: { type: "tool", name: "plan_searches" },
      tools: [
        {
          name: "plan_searches",
          description: "Plan 3-5 strategic job searches that, together, will surface the most relevant roles for this candidate.",
          input_schema: {
            type: "object",
            properties: {
              plans: {
                type: "array",
                description: "3-5 search plans, ordered by expected relevance.",
                items: {
                  type: "object",
                  properties: {
                    what: {
                      type: "string",
                      description: "The Adzuna 'what' query — a job title or short title+keyword combo (max 60 chars). Title-led for high relevance.",
                    },
                    where: {
                      type: "string",
                      description: "Location filter (City, State or just City). Omit for nationwide. Use the user's preferred location when set.",
                    },
                    jobType: {
                      type: "string",
                      enum: ["full_time", "part_time", "contract", "permanent"],
                      description: "Optional Adzuna contract filter. Only set when the user has a clear preference.",
                    },
                    remote: {
                      type: "boolean",
                      description: "Set true if the user is open to remote AND the role title is one that's commonly remote.",
                    },
                    rationale: {
                      type: "string",
                      description: "One sentence — why this query will surface relevant matches for this candidate.",
                    },
                  },
                  required: ["what", "rationale"],
                },
              },
            },
            required: ["plans"],
          },
        },
      ],
      system: `You are a job-search strategist inside iCareerOS. Given a candidate's resume and preferences, produce 3-5 Adzuna search plans that together will surface the most relevant roles.

PRINCIPLES
- Title-led queries beat keyword soup. Each 'what' should lead with a clean job title.
- Cover the candidate's plausible role variants (e.g., 'Full-Cycle Accountant', 'Senior Accountant', 'Tax Accountant') rather than 5 copies of the same query.
- Match level. Don't suggest VP roles to entry-level candidates and vice versa.
- Use user-stated target_roles when present; otherwise infer titles from recent work history + headline + summary.
- Set 'where' from the user's preferred location when set. Omit for nationwide.
- Only set jobType when the user has a clear preference signal (e.g., they only listed Full-time in preferences).
- Only set remote=true when the user is explicitly open to remote AND the role is one that hires remotely.

QUALITY
- Each rationale should reference something specific from the candidate (current role, a domain, a key skill).
- Don't produce 5 identical queries with minor word changes — diversity wins.
- Don't produce queries the candidate is overqualified or underqualified for.`,
      messages: [
        {
          role: "user",
          content: `Plan strategic job searches for this candidate:\n\n${resumeBlock}\n\nReturn 3-5 Adzuna search plans that, together, maximize relevant matches.`,
        },
      ],
    });

    const toolBlock = response.content.find(b => b.type === "tool_use");
    if (!toolBlock || toolBlock.type !== "tool_use") {
      return NextResponse.json({ error: "Agent failed to produce a plan" }, { status: 500 });
    }
    const planResponse = toolBlock.input as PlanResponse;
    const plans = (planResponse.plans ?? []).slice(0, 5);

    if (plans.length === 0) {
      return NextResponse.json({
        opportunities: [], total: 0, plans, agent: { phase: "no_plans" },
      });
    }

    // ── Phase 2: Run every plan against Adzuna in parallel ────────────────
    const adzunaParamsList: AdzunaSearchParams[] = plans.map(p => ({
      what:    p.what,
      where:   p.where || undefined,
      jobType: p.jobType,
      remote:  p.remote,
      sortBy:  "relevance",
      resultsPerPage: 12,        // 12 × 5 = up to 60 raw, dedupe → ~30-40 unique
      page:    1,
    }));

    const results = await Promise.all(
      adzunaParamsList.map(p => searchAdzuna(p).catch(e => {
        console.warn("[jobs/agent] one plan failed:", e instanceof Error ? e.message : e);
        return { opportunities: [], total: 0, fallback: true };
      }))
    );

    // ── Merge + dedupe by URL (fall back to title+company key) ────────────
    const seen = new Set<string>();
    const merged: OpportunityResult[] = [];
    let aggregateTotal = 0;
    let allFallback = true;
    results.forEach((res) => {
      if (!res.fallback) allFallback = false;
      aggregateTotal += res.total;
      for (const opp of res.opportunities) {
        const key = (opp.url || `${opp.company}::${opp.title}`).toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          merged.push(opp);
        }
      }
    });

    // ── Validate quality + drop bad jobs ─────────────────────────────────
    const validated = validateJobs(merged);
    const cleaned   = validated.kept;

    // ── Resolve direct apply-on-company URLs (when description has one) ──
    const enriched  = attachCompanyApplyUrls(cleaned);

    // ── Upsert into opportunities for fit-scoring ─────────────────────────
    let opportunitiesWithIds: typeof enriched = enriched;
    if (enriched.length > 0) {
      const rows = enriched.map(o => ({
        source:           "adzuna",
        source_id:        o.id?.replace(/^adzuna-/, "") ?? null,
        title:            o.title,
        company:          o.company,
        location:         o.location || null,
        description:      o.description || null,
        url:              o.url || null,
        job_type:         o.type || null,
        is_remote:        o.is_remote ?? false,
        salary_min:       o.salary_min ?? null,
        salary_max:       o.salary_max ?? null,
        salary_currency:  o.salary_currency ?? null,
        posted_at:        o.first_seen_at ?? null,
        is_active:        true,
        is_flagged:       o.is_flagged ?? false,
        flag_reasons:     o.flag_reasons ?? null,
        quality_score:    o.quality_score ?? null,
      }));

      const { data: upserted, error: upsertErr } = await supabase
        .from("opportunities")
        .upsert(rows, { onConflict: "source,source_id", ignoreDuplicates: false })
        .select("id, source, source_id");

      if (upsertErr) {
        console.warn("[jobs/agent] upsert failed:", upsertErr.message);
      } else if (Array.isArray(upserted)) {
        const idMap = new Map<string, string>();
        for (const row of upserted) {
          if (row.source_id) idMap.set(`${row.source}::${row.source_id}`, row.id as string);
        }
        opportunitiesWithIds = enriched.map(o => {
          const sid = o.id?.replace(/^adzuna-/, "") ?? "";
          const dbId = idMap.get(`adzuna::${sid}`);
          return dbId ? { ...o, id: dbId } : o;
        });
      }
    }

    return NextResponse.json({
      opportunities: opportunitiesWithIds,
      total:         opportunitiesWithIds.length,
      planCount:     plans.length,
      // Strip rationale from client payload — only the planner needs it.
      // We keep a shortened summary for transparency without leaking the
      // full keyword strategy.
      agent: {
        plansRun:    plans.length,
        rawTotal:    aggregateTotal,
        beforeFilter: merged.length,
        hidden:      validated.hiddenCount,
        flagged:     validated.flaggedCount,
      },
      sourceFallback: allFallback,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Agent search failed";
    console.error("[jobs/agent] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
