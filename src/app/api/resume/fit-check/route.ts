import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createTracedClient } from "@/lib/observability/langfuse";
import { embed, cosineSimilarity, cosineToScore } from "@/lib/embeddings/openai";
import { createHash } from "node:crypto";

/**
 * POST /api/resume/fit-check
 *
 * 2026-06-19 (Brief Tasks 2 + 17) — extended return shape:
 *   - `breakdown` sub-scores: skillsCoverage, seniorityFit, locationFit,
 *     experienceFit, redFlagsFound — drive the labeled bars on /evaluate/job-fit
 *     and the compact tooltip on opportunity cards.
 *   - `keywordCoverage`: per-keyword presence with a coverage percentage,
 *     rendered as covered/missing tag clouds.
 */

export interface FitBreakdown {
  /** 0-100 — proportion of JD-required skills present on the resume. */
  skillsCoverage: number;
  /** Seniority alignment vs JD seniority signals. */
  seniorityFit: "match" | "overqualified" | "underqualified" | "unknown";
  /** Location alignment — remote_ok captures remote-friendly JDs. */
  locationFit: "match" | "remote_ok" | "mismatch" | "unknown";
  /** 0-100 — years/depth of experience signal vs JD requirement. */
  experienceFit: number;
  /** Red flags present IN THE JD itself (unpaid, commission-only, etc). */
  redFlagsFound: string[];
}

export interface KeywordCoverage {
  /** JD keywords that ALSO appear in the resume (case-insensitive). */
  covered: string[];
  /** JD keywords NOT found on the resume. */
  missing: string[];
  /** 0-100 — covered.length / (covered+missing) total * 100. */
  coverageScore: number;
}

export interface FitCheckResult {
  fitScore: number;
  summary: string;
  strengths: string[];
  gaps: string[];
  missingSkills: string[];
  recommendations: string[];
  breakdown: FitBreakdown;
  keywordCoverage: KeywordCoverage;
  /** 2026-06-28 — semantic similarity 0-100 from OpenAI text-embedding-3-small.
   *  Null when OPENAI_API_KEY is unset or the embedding call failed — UI hides
   *  the tag in that case. */
  semanticScore?: number | null;
}

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

  try {
    const body = await req.json();
    resumeText    = (body.resumeText    ?? "").trim();
    jobDescription = (body.jobDescription ?? "").trim();

    if (!resumeText)    return NextResponse.json({ error: "resumeText is required" },    { status: 400 });
    if (!jobDescription) return NextResponse.json({ error: "jobDescription is required" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const anthropic = createTracedClient(user.id, "resume/fit-check");

  const prompt = `You are an expert career coach and ATS analyst. Assess how well a candidate's resume fits a job description.

<resume>
${resumeText}
</resume>

<job_description>
${jobDescription}
</job_description>

Provide a detailed, explainable fit analysis. Respond ONLY with valid JSON in this exact format:
{
  "fitScore": <integer 0-100>,
  "summary": "<2-3 sentence overall assessment>",
  "strengths": ["<strength 1>", "<strength 2>", "<strength 3>"],
  "gaps": ["<gap 1>", "<gap 2>", "<gap 3>"],
  "missingSkills": ["<skill 1>", "<skill 2>"],
  "recommendations": ["<recommendation 1>", "<recommendation 2>", "<recommendation 3>"],
  "breakdown": {
    "skillsCoverage": <integer 0-100>,
    "seniorityFit": "<one of: match | overqualified | underqualified | unknown>",
    "locationFit":  "<one of: match | remote_ok | mismatch | unknown>",
    "experienceFit": <integer 0-100>,
    "redFlagsFound": ["<JD red flag 1>", "<JD red flag 2>"]
  },
  "keywordCoverage": {
    "covered": ["<keyword 1>", "<keyword 2>"],
    "missing": ["<keyword 1>", "<keyword 2>"],
    "coverageScore": <integer 0-100>
  }
}

Guidelines:
- fitScore: 80-100 = strong fit, 60-79 = moderate fit, 40-59 = partial fit, below 40 = weak fit
- strengths: 3-5 specific things the candidate has that match the job
- gaps: 2-4 specific things the job requires that the candidate lacks or has weakly
- missingSkills: concrete skills/tools/technologies in the JD not on the resume
- recommendations: 2-4 actionable steps to improve this resume for this specific role
- breakdown.skillsCoverage: count of REQUIRED skills present on resume / total REQUIRED * 100
- breakdown.seniorityFit:
    "match"            — candidate's seniority aligns with JD's
    "overqualified"    — candidate is more senior than the role
    "underqualified"   — candidate is less senior than the role
    "unknown"          — neither resume nor JD declares seniority clearly
- breakdown.locationFit:
    "match"     — candidate's location matches the JD's hard location requirement
    "remote_ok" — JD allows remote, regardless of candidate location
    "mismatch"  — JD requires onsite in a different city/country
    "unknown"   — JD or resume omits location
- breakdown.experienceFit: 0-100 score on YEARS / DEPTH of experience vs JD requirement
- breakdown.redFlagsFound: any RED FLAGS IN THE JD ITSELF (unpaid, equity-only, "competitive salary"
  with no number, "commission only", "homework assignment", "working interview", MLM signals).
  Empty array if none.
- keywordCoverage.covered: distinct ATS-style keywords from the JD that ALSO appear on the resume (case-insensitive).
- keywordCoverage.missing: distinct ATS-style keywords from the JD that DO NOT appear on the resume.
- keywordCoverage.coverageScore: round(covered / (covered + missing) * 100). 0 when both are empty.
- Aim for 8-15 keywords across covered + missing combined.`;

  // fix/jobs-fit-check-500 (2026-06-29) — wrap in try/catch so an
  // Anthropic-side failure returns a readable JSON body instead of a
  // blank 500. Combining temperature + top_p triggered the prior 500.
  let msg;
  try {
    msg = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      // Deterministic scoring (Fix C from #336). Only temperature is set —
      // Anthropic recommends choosing ONE of temperature or top_p, not both.
      // The prior #336 also set top_p: 1; that combination produced an
      // unhandled SDK rejection in production. Dropping top_p preserves
      // determinism (temperature: 0 alone is enough).
      temperature: 0,
      messages: [{ role: "user", content: prompt }],
    });
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : "Anthropic call failed";
    console.error("[fit-check] anthropic.messages.create threw:", errMsg);
    return NextResponse.json({ error: `Fit check service error: ${errMsg}` }, { status: 502 });
  }

  const raw = (msg.content[0] as { type: string; text: string }).text;
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return NextResponse.json({ error: "AI response parse failed" }, { status: 500 });
  }

  try {
    const result: FitCheckResult = JSON.parse(jsonMatch[0]);

    // Defensive defaults so older client code that hasn't been updated to
    // read the new fields doesn't crash on legacy-shape consumers.
    if (!result.breakdown) {
      result.breakdown = {
        skillsCoverage: 0,
        seniorityFit:   "unknown",
        locationFit:    "unknown",
        experienceFit:  0,
        redFlagsFound:  [],
      };
    }
    if (!result.keywordCoverage) {
      result.keywordCoverage = { covered: [], missing: [], coverageScore: 0 };
    }

    // 2026-06-28 — semantic score (pgvector + OpenAI text-embedding-3-small).
    // Best-effort: null on missing key, missing tables, or fetch failure.
    try {
      result.semanticScore = await computeSemanticScore(supabase, user.id, resumeText, jobDescription);
    } catch {
      result.semanticScore = null;
    }

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Failed to parse AI response" }, { status: 500 });
  }
}

// ── Semantic scoring helpers ─────────────────────────────────────────

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/**
 * Compute a 0-100 semantic similarity score between profile-resume text
 * and job-description text. Caches the profile embedding in
 * career_profiles.embedding (re-uses if the underlying text fingerprint
 * matches) and the job embedding in job_embeddings keyed on a sha256
 * fingerprint of the JD text. Returns null when embeddings are unavailable.
 */
async function computeSemanticScore(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
  resumeText: string,
  jobDescription: string,
): Promise<number | null> {
  // Profile embedding — cache in career_profiles.embedding + a fingerprint
  // column so we know when to re-embed. We don't have a fingerprint column,
  // so we just trust the existing cached embedding; an explicit "refresh"
  // option could come later.
  const { data: profileRow } = await supabase
    .from("career_profiles")
    .select("embedding")
    .eq("user_id", userId)
    .maybeSingle();
  let profileEmbedding: number[] | null = (profileRow?.embedding as number[] | null) ?? null;
  if (!profileEmbedding) {
    profileEmbedding = await embed(resumeText);
    if (profileEmbedding) {
      // Best-effort persist — don't fail the request if this errors
      await supabase
        .from("career_profiles")
        .upsert({ user_id: userId, embedding: profileEmbedding }, { onConflict: "user_id" })
        .then(() => undefined, () => undefined);
    }
  }
  if (!profileEmbedding) return null;

  // Job embedding — cache in job_embeddings keyed by sha256(JD) recorded
  // in the job_url column (we'll repurpose it as a fingerprint since the
  // caller may not provide a real URL for paste-mode JDs).
  const jdFp = `sha256:${sha256(jobDescription)}`;
  const { data: jobRow } = await supabase
    .from("job_embeddings")
    .select("embedding")
    .eq("user_id", userId)
    .eq("job_url", jdFp)
    .maybeSingle();
  let jobEmbedding: number[] | null = (jobRow?.embedding as number[] | null) ?? null;
  if (!jobEmbedding) {
    jobEmbedding = await embed(jobDescription);
    if (jobEmbedding) {
      await supabase
        .from("job_embeddings")
        .upsert({ user_id: userId, job_url: jdFp, embedding: jobEmbedding }, { onConflict: "user_id,job_url" })
        .then(() => undefined, () => undefined);
    }
  }
  if (!jobEmbedding) return null;

  const cos = cosineSimilarity(profileEmbedding, jobEmbedding);
  return cosineToScore(cos);
}
