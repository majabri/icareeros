/**
 * POST /api/jobs/deep-fit
 *
 * Pro-tier feature: returns the DeepFitResult for a (user, job) pair —
 * matched skills, gaps, improvement plan, interview probability, etc.
 *
 * Plan gate:
 *   - When `feature_flags.monetization_enabled` is FALSE → open to all (pre-launch default).
 *   - When monetization is enabled → only `standard` or `pro` plans allowed.
 *     Free + Starter get 403 `{ error: 'upgrade_required', plan: 'standard' }`.
 *
 * Caches the result in `user_opportunity_matches.deep_fit_analysis` so repeat
 * clicks on the same job are instant. Cache is per (user_id, opportunity_id) —
 * stays valid until the user refreshes their resume; the UI surfaces a
 * "recompute" affordance for that case (out of scope for W1).
 */

import { NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { withCrossSubdomainCookie } from "@/lib/supabase-cookie-options";
import { createClient as createServiceRoleClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { analyzeJobFit, type DeepFitResult } from "@/lib/jobFitAnalysis";

async function makeSupabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, withCrossSubdomainCookie(options)));
          } catch { /* server-component context */ }
        },
      },
    },
  );
}

interface ReqBody { jobId?: string; refresh?: boolean }

export async function POST(req: Request) {
  // ── 1. Auth ────────────────────────────────────────────────────────────
  const supabase = await makeSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // ── 2. Body ────────────────────────────────────────────────────────────
  let body: ReqBody = {};
  try { body = await req.json(); } catch { /* tolerate */ }
  const jobId = typeof body.jobId === "string" ? body.jobId : null;
  if (!jobId) {
    return NextResponse.json({ error: "missing_job_id" }, { status: 400 });
  }
  const refresh = body.refresh === true;

  // ── 3. Plan gate ───────────────────────────────────────────────────────
  // Open when monetization is off (pre-launch). Standard/Pro only when on.
  const { data: flag } = await supabase
    .from("feature_flags")
    .select("enabled")
    .eq("key", "monetization_enabled")
    .maybeSingle();

  if (flag?.enabled === true) {
    const { data: sub } = await supabase
      .from("user_subscriptions")
      .select("plan, status")
      .eq("user_id", user.id)
      .maybeSingle();
    const plan = sub?.plan ?? "free";
    const active = sub?.status === "active" || sub?.status === "trialing";
    const effective = active ? plan : "free";
    if (!["standard", "pro"].includes(effective as string)) {
      return NextResponse.json(
        { error: "upgrade_required", plan: "standard" },
        { status: 403 },
      );
    }
  }

  // ── 4. Cache hit? (skip when refresh=true) ─────────────────────────────
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const sb = serviceKey
    ? createServiceRoleClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        serviceKey,
        { auth: { persistSession: false } },
      )
    : supabase;

  if (!refresh) {
    const { data: cached } = await sb
      .from("user_opportunity_matches")
      .select("deep_fit_analysis")
      .eq("user_id", user.id)
      .eq("opportunity_id", jobId)
      .maybeSingle();
    const hit = cached?.deep_fit_analysis as DeepFitResult | null | undefined;
    if (hit && typeof hit === "object" && typeof hit.overallScore === "number") {
      return NextResponse.json({ ok: true, cached: true, result: hit });
    }
  }

  // ── 5. Fetch job description ───────────────────────────────────────────
  const { data: opp, error: oppErr } = await sb
    .from("opportunities")
    .select("id, title, company, description")
    .eq("id", jobId)
    .maybeSingle();
  if (oppErr || !opp) {
    return NextResponse.json({ error: "job_not_found" }, { status: 404 });
  }

  // ── 6. Fetch resume from career_profiles + flatten to text ─────────────
  const { data: cp } = await supabase
    .from("career_profiles")
    .select("headline, summary, skills, work_experience, education, certifications")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!cp) {
    return NextResponse.json(
      { error: "no_career_profile", message: "Add your career profile to use Deep Fit." },
      { status: 400 },
    );
  }

  const skills      = (cp.skills as string[] | null) ?? [];
  const workExp     = (cp.work_experience as Array<{ title?: string; company?: string; description?: string }> | null) ?? [];
  const education   = (cp.education as Array<{ degree?: string; university?: string }> | null) ?? [];
  const certs       = (cp.certifications as Array<{ name?: string; issuer?: string }> | null) ?? [];

  const resumeText = [
    cp.headline ? `Title: ${cp.headline}` : "",
    cp.summary  ? `Summary: ${cp.summary}` : "",
    `Skills: ${skills.join(", ")}`,
    workExp.length > 0
      ? `Experience:\n${workExp.map(w => `${w.title ?? ""} at ${w.company ?? ""} — ${(w.description ?? "").slice(0, 500)}`).join("\n")}`
      : "",
    education.length > 0
      ? `Education: ${education.map(e => `${e.degree ?? ""} ${e.university ?? ""}`).join("; ")}`
      : "",
    certs.length > 0
      ? `Certifications: ${certs.map(c => `${c.name ?? ""} ${c.issuer ? `(${c.issuer})` : ""}`).join(", ")}`
      : "",
  ].filter(Boolean).join("\n\n");

  // ── 7. Run analysis ────────────────────────────────────────────────────
  const result = analyzeJobFit(opp.description ?? "", resumeText);

  // ── 8. Cache the result (best-effort upsert; ignore failures) ──────────
  const { error: upsertErr } = await sb
    .from("user_opportunity_matches")
    .upsert(
      { user_id: user.id, opportunity_id: jobId, deep_fit_analysis: result },
      { onConflict: "user_id,opportunity_id" }
    );
  if (upsertErr) {
    console.warn("[deep-fit] cache write failed (non-fatal):", upsertErr.message);
  }

  return NextResponse.json({ ok: true, cached: false, result });
}
