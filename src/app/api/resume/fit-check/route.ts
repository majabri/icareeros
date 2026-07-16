/**
 * POST /api/resume/fit-check
 *
 * feat/jobs-fit-check-internal Task 2 — Tier A cost migration.
 *
 *   The score + all structured lists (strengths, gaps, missingSkills,
 *   recommendations, keywordCoverage, breakdown) are now computed
 *   DETERMINISTICALLY in-process by `computeDeterministicFit` — zero LLM
 *   calls. The only LLM piece left is a 2-3 sentence holistic narrative
 *   summary. That call is OPTIONAL: if it fails for ANY reason (billing,
 *   timeout, 4xx, 5xx, malformed JSON, whatever) the deterministic body
 *   ships anyway with { summary: null, summarySource: "unavailable" }.
 *
 *   This is a direct fix for the RBC BISO incident where an out-of-credits
 *   Anthropic key surfaced its billing error text to the end user and blocked
 *   the entire fit-check response.
 *
 *   PR history preserved in git — the pre-fix version's ~180-line prompt is
 *   in b827eb6~1.
 *
 * Response shape (unchanged for the UI, plus one new field):
 *   fitScore, breakdown, keywordCoverage, strengths, gaps, missingSkills,
 *   recommendations, semanticScore, summary, summarySource
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createTracedClient } from "@/lib/observability/langfuse";
import { compareTexts, cosineToScore } from "@/lib/embeddings/openai";
import { computeDeterministicFit, type DeterministicFitResult, type KeywordCoverage, type FitBreakdown } from "@/services/scoring/deterministicFitCheck";
import { extractUserProfile } from "@/services/scoring/profileExtractor";
import { inferSeniority, type UserProfile } from "@/services/scoring/profileScorer";

// Re-export for any legacy consumer still importing types from this route.
export type { KeywordCoverage, FitBreakdown };

export interface FitCheckResult extends DeterministicFitResult {
  /** 2026-06-28 — semantic similarity 0-100 from a local TF-IDF model.
   *  Null when either input is empty/whitespace. */
  semanticScore?: number | null;
  /** feat/jobs-fit-check-internal — the ONLY LLM-generated field. Null when
   *  the LLM call failed or was skipped. */
  summary: string | null;
  /** "llm" (Haiku succeeded) | "unavailable" (call failed / no key / any error).
   *  The UI reads this to decide whether to show the friendly note. */
  summarySource: "llm" | "unavailable";
}

// ── Route ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
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

  let resumeText: string;
  let jobDescription: string;
  let bodyJobTitle: string;

  try {
    const body = await req.json();
    resumeText    = (body.resumeText    ?? "").trim();
    jobDescription = (body.jobDescription ?? "").trim();
    // fix/jobs-target-role-match — client may send jobTitle explicitly
    //   (from urlFetchMeta.title on URL-mode fetches). When present, this
    //   wins over the coarse first-line heuristic below, so targetRoleMatch
    //   actually has a title to score against.
    bodyJobTitle  = (body.jobTitle      ?? "").trim();
    if (!resumeText)     return NextResponse.json({ error: "resumeText is required" },     { status: 400 });
    if (!jobDescription) return NextResponse.json({ error: "jobDescription is required" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // ── Step 1: resolve the structured profile (deterministic scoring input).
  //   The full career_profiles + user_profiles data is what
  //   scoreOpportunityAgainstProfile expects. If a user hits this route
  //   before saving their canonical profile, fall back to a minimal
  //   profile derived from the pasted resume text so scoring still runs.
  const profile = await resolveProfile(supabase, user.id, resumeText);

  // ── Step 2: compute the deterministic result. This is the source of
  //   truth for fitScore + every structured list. NO LLM.
  //   Job title + company are not passed by the client today; we accept
  //   the JD's first line as a coarse title heuristic to keep scoring
  //   sensible until the UI is extended to send them explicitly.
  // Prefer the client-supplied title over the coarse first-line
  // heuristic. Long first lines (RBC-style 200-char intros) return
  // "" from the fallback, which then zeros scoreTargetRoleMatch and
  // drops 35% of the composite weight for no good reason.
  const jobTitle = bodyJobTitle || coarseJobTitleFromJD(jobDescription);
  const deterministic = computeDeterministicFit(jobTitle, jobDescription, /*company*/ "", profile);

  // ── Step 3: semantic score (TF-IDF, already deterministic, no external
  //   API). Best-effort — null on unexpected failure.
  let semanticScore: number | null = null;
  try {
    const cos = compareTexts(resumeText, jobDescription);
    semanticScore = cos === null ? null : cosineToScore(cos);
  } catch {
    semanticScore = null;
  }

  // ── Step 4: try the OPTIONAL narrative summary. If it fails for ANY
  //   reason — billing (RBC incident), timeout, 4xx, 5xx, malformed
  //   JSON — return the deterministic result with summary:null instead
  //   of failing the whole request.
  const { summary, summarySource } = await maybeSummary({
    userId:     user.id,
    jobTitle,
    jobDescription,
    deterministic,
  });

  const result: FitCheckResult = {
    ...deterministic,
    semanticScore,
    summary,
    summarySource,
  };
  return NextResponse.json(result);
}

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * Best-effort profile resolver. Order:
 *   1. career_profiles + user_profiles via extractUserProfile
 *   2. Minimal profile built from the pasted resume text (skills=[],
 *      currentTitle="", years=0, seniority='unknown'). Enough to run
 *      scoreOpportunityAgainstProfile — most sub-scores will be neutral
 *      or 0, which is the CORRECT behavior for a user who hasn't saved
 *      their profile yet.
 */
async function resolveProfile(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
  resumeText: string,
): Promise<UserProfile> {
  try {
    // Cast because extractUserProfile expects the supabase-js SupabaseClient
    // type. The @supabase/ssr createServerClient returns a subtly different
    // structural type; at runtime it's fine.
    const p = await extractUserProfile(
      supabase as unknown as import("@supabase/supabase-js").SupabaseClient,
      userId,
    );
    if (p) return p;
  } catch {
    // fall through
  }
  // Fallback: derive whatever we can from resumeText alone.
  return {
    skills:          [],
    targetRoles:     [],
    targetSeniority: inferSeniority(resumeText),
    currentTitle:    "",
    yearsExperience: 0,
    summary:         resumeText.slice(0, 500),
    keywords:        [],
  };
}

/**
 * Very coarse first-line heuristic for job title. Doesn't need to be
 * accurate — targetRoleMatch is best when the client sends the title
 * explicitly; when they don't we fall back to "" and score 0 on that
 * component (rather than pretending we know).
 */
function coarseJobTitleFromJD(jd: string): string {
  const firstLine = jd.split(/\r?\n/).map(s => s.trim()).find(Boolean) ?? "";
  // Keep only if it looks like a title (< 100 chars, no full-stops early).
  if (firstLine.length < 100 && !/^[A-Z][^.]*\./.test(firstLine)) {
    return firstLine;
  }
  return "";
}

/**
 * Try to enrich the deterministic result with a 2-3 sentence holistic
 * summary from Haiku. Every failure mode returns
 * { summary: null, summarySource: "unavailable" } — the route never
 * throws because of this call.
 *
 * The prompt input is intentionally a compact digest of the deterministic
 * result plus the first 6k chars of the JD — NOT the full resume re-send.
 * That's where the token savings come from.
 */
async function maybeSummary(args: {
  userId:         string;
  jobTitle:       string;
  jobDescription: string;
  deterministic:  DeterministicFitResult;
}): Promise<{ summary: string | null; summarySource: "llm" | "unavailable" }> {
  const { userId, jobTitle, jobDescription, deterministic } = args;

  // No API key configured → gracefully skip. This is the same code path
  // the RBC billing failure exercises after the SDK throws.
  if (!process.env.ANTHROPIC_API_KEY) {
    return { summary: null, summarySource: "unavailable" };
  }

  const jdSnippet = jobDescription.slice(0, 6000);
  const digest = [
    `Fit score: ${deterministic.fitScore}/100`,
    `Skills coverage: ${deterministic.componentScores.skillsMatch}, Seniority match: ${deterministic.componentScores.seniorityMatch}, Experience match: ${deterministic.componentScores.experienceMatch}, Keyword density: ${deterministic.componentScores.keywordDensity}`,
    `Signals: ${deterministic.signals.targetRoleSignal} role match, ${deterministic.signals.senioritySignal} seniority`,
    `Top matched skills: ${deterministic.signals.matchedSkills.slice(0, 5).join(", ") || "(none)"}`,
    `Top missing skills: ${deterministic.signals.missingSkills.slice(0, 5).join(", ") || "(none)"}`,
    `Strengths: ${deterministic.strengths.join(" | ") || "(none)"}`,
    `Gaps: ${deterministic.gaps.join(" | ") || "(none)"}`,
  ].join("\n");

  const prompt = `You are a career coach. In 2-3 sentences write a holistic narrative summary of how this candidate fits this role. Base your summary ONLY on the deterministic analysis provided — do not invent facts.

Job title: ${jobTitle || "(not specified)"}
Job description (first 6000 chars):
${jdSnippet}

Deterministic fit analysis:
${digest}

Return ONLY the 2-3 sentence summary as plain text. No JSON, no markdown, no preamble.`;

  try {
    const anthropic = createTracedClient(userId, "resume/fit-check-summary");
    const msg = await anthropic.messages.create({
      model:       "claude-haiku-4-5-20251001",
      max_tokens:  300,
      temperature: 0,
      messages:    [{ role: "user", content: prompt }],
    });
    const first = msg.content[0];
    if (first?.type !== "text") {
      return { summary: null, summarySource: "unavailable" };
    }
    const text = first.text.trim();
    if (!text) return { summary: null, summarySource: "unavailable" };
    return { summary: text, summarySource: "llm" };
  } catch (e) {
    // Do NOT surface the underlying error text (billing details, key
    // hints, etc.) to the client. Log server-side and return null.
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[fit-check] summary LLM call failed (deterministic body still returned):", msg);
    return { summary: null, summarySource: "unavailable" };
  }
}
