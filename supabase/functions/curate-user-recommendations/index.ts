// deno-lint-ignore-file no-explicit-any
/**
 * curate-user-recommendations — Phase 3 of feat/jobs-pipeline.
 *
 * Runs daily at 04:00 UTC (Vercel Cron via /api/cron/curate-user-recommendations)
 * OR on-demand when a user's target_roles / skills change (via DB trigger).
 *
 * For each active user (or one specific user when {userId} is provided):
 *   1. Load user_profiles.target_roles + career_profiles.skills/summary/headline
 *   2. Run a Deno-native version of the unified retrieval engine (mirrors
 *      src/services/retrieval/expandQueries.ts + retrieveByTitle.ts) against
 *      ats_jobs where enrichment_status='complete'
 *   3. Score every retrieved candidate (mirrors src/services/scoring math)
 *   4. Upsert top 100 matches into user_job_recommendations, refreshing
 *      `computed_at` on conflict so freshness headers actually advance
 *   5. Delete stale rows for this user (computed_at < NOW() - 1 day)
 *
 * On-demand invocation body: { userId: "<uuid>", trigger: "profile_change" }
 *
 * ---------------------------------------------------------------
 * fix/jobs-curator-deno-port (PR after #370) — this file's history:
 *   - PR #370 renamed the call sites to `expandQueriesDeno` and
 *     `buildTsqueryArgDeno` without ever defining them, so every
 *     invoke crashed with `ReferenceError`. CI didn't catch it because
 *     Deno files weren't type-checked.
 *   - This revision (a) inlines the missing functions verbatim from
 *     the Node-side modules, (b) removes the now-unused legacy helpers,
 *     (c) sets computed_at explicitly on conflict, (d) is guarded by a
 *     new CI `deno check` step and a parity test.
 * ---------------------------------------------------------------
 */

// NOTE — using esm.sh, not jsr:. The jsr:@supabase/functions-js edge-runtime
// types pull in a transitive npm:openai dep that `deno check` cannot resolve
// without a node_modules folder. The other passing edge functions all use
// esm.sh (see ingest-ats-direct, support-resolver, support-action-runner);
// this file matches that pattern so CI per-function `deno check` is clean
// out-of-the-box.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─────────────────────────────────────────────────────────────────────────
// ROLE_FAMILIES — copied verbatim from src/services/curator/roleFamilies.ts.
//
// Kept in sync manually. The parity test in
// supabase/functions/curate-user-recommendations/parity.test.ts asserts
// that `expandQueriesDeno` produces the same groups as the Node-side
// `expandQueries` for a fixed archetype set. If the taxonomy drifts on
// either side the test fails.
// ─────────────────────────────────────────────────────────────────────────
// Pure query-expansion + tsquery-building logic lives in ./lib.ts so the
// vitest parity test (src/services/retrieval/__tests__/expandQueries.deno-parity.test.ts)
// can import the exact same code the edge function runs.
import {
  ROLE_FAMILIES as _ROLE_FAMILIES,
  normalisePhraseDeno,
  synonymsForExactDeno,
  expandQueriesDeno,
  buildTsqueryArgDeno,
} from "./lib.ts";
// re-export so the (very small) public surface of this file stays
// stable for any other Deno test that imports it directly.
export { normalisePhraseDeno, synonymsForExactDeno, expandQueriesDeno, buildTsqueryArgDeno };
void _ROLE_FAMILIES;

// ─────────────────────────────────────────────────────────────────────────
// Fit scoring
// ─────────────────────────────────────────────────────────────────────────
function scoreJob(job: any, profile: any): {
  total: number;
  roleSignal: string;
  matchedSkills: string[];
  missingSkills: string[];
  roleBestMatch: string;
} {
  const title = (job.title ?? "").toLowerCase();
  const desc  = (job.description ?? "").toLowerCase();
  const roles: string[] = (profile.targetRoles ?? []).map((r: string) => r.toLowerCase());
  const skills: string[] = (profile.skills ?? []).map((s: string) => s.toLowerCase());

  let bestOverlap = 0;
  let bestMatch = "";
  for (const r of roles) {
    const wA: Set<string> = new Set(title.split(/\s+/));
    const wB: Set<string> = new Set(r.split(/\s+/));
    const inter = [...wA].filter((w: string) => wB.has(w)).length;
    const union = new Set<string>([...wA, ...wB]).size;
    const ratio = union ? inter / union : 0;
    if (ratio > bestOverlap) { bestOverlap = ratio; bestMatch = r; }
  }
  const roleScore = Math.round(bestOverlap * 100);
  const roleSignal = roleScore >= 80 ? "exact" : roleScore >= 40 ? "adjacent" : roleScore >= 20 ? "stretch" : "mismatch";

  const matched: string[] = [];
  const missing: string[] = [];
  const jobSkills = (job.extracted_skills ?? []) as string[];
  const jobSkillsLower = jobSkills.map(s => s.toLowerCase());
  for (const s of skills) {
    if (jobSkillsLower.includes(s) || desc.includes(s)) matched.push(s);
    else missing.push(s);
  }
  const skillsScore = skills.length ? Math.round((matched.length / skills.length) * 100) : 0;

  const senMatch = profile.targetSeniority && job.extracted_seniority === profile.targetSeniority;
  const seniorityScore = senMatch ? 100 : 50;

  const total = Math.max(0, Math.min(100, Math.round(
    roleScore     * 0.35 +
    skillsScore   * 0.30 +
    seniorityScore* 0.20 +
    50            * 0.10 +
    (desc && roles.some(r => desc.includes(r)) ? 80 : 30) * 0.05
  )));

  return { total, roleSignal, matchedSkills: matched, missingSkills: missing, roleBestMatch: bestMatch };
}

function classify(total: number, origin: "exact" | "adjacent" | "skills"): "strongMatch" | "worthConsidering" | "stretch" | null {
  // fix/jobs-classify-thresholds — lower stretch threshold 30 → 24.
  //   Baseline simulation against Amir's real 27-row retrieval pool
  //   (user_id b40f764f-8e8b-4f8d-b3a7-9e993e57f15a, live SQL 2026-07-17)
  //   under the CURRENT Deno scoreJob showed the target-acceptance role
  //   ("Senior Director, CISO Healthcare West" [zscaler]) scoring 24, and
  //   the target-rejection rows (Pfizer Executive Assistant + Pfizer
  //   Administrative Assistant) scoring 17. Threshold 24 lets the
  //   director-level borderlines clear while keeping admin/EA + null-
  //   seniority IC rows filtered.
  //
  // strongMatch (>=65) and worthConsidering (>=45) thresholds unchanged.
  //
  // NOTE — this tuning is against the CURRENT Deno scoring. PR #384's
  //   synonym-aware ladder is Node-only; porting it to Deno makes scoring
  //   too permissive against admin/EA titles containing "CISO" as a bare
  //   token. Discussed the port + rejected it for this PR in favour of
  //   the surgical threshold tune (Amir's rule: "tune only what's still
  //   stuck"). Follow-up PR after Platform reviews the Deno port trade-
  //   offs.
  if (origin === "exact" && total >= 65) return "strongMatch";
  if (total >= 45 && total < 65) return "worthConsidering";
  if (total >= 24) return "stretch";
  return null;
}

function reasonFor(sig: { roleSignal: string; matchedSkills: string[]; missingSkills: string[]; roleBestMatch: string }): string {
  const parts: string[] = [];
  if (sig.roleSignal === "exact" && sig.roleBestMatch) parts.push(`Exact match for ${sig.roleBestMatch}`);
  else if (sig.roleSignal === "adjacent") parts.push("Adjacent to your target role");
  else if (sig.roleSignal === "stretch") parts.push("Stretch role");
  const tot = sig.matchedSkills.length + sig.missingSkills.length;
  if (tot > 0) parts.push(`${sig.matchedSkills.length} of ${tot} required skills match`);
  return parts.join(" · ");
}

// ─────────────────────────────────────────────────────────────────────────
// Per-user curation
// ─────────────────────────────────────────────────────────────────────────
async function curateForUser(supabase: any, userId: string): Promise<{ recs: number }> {
  const [{ data: up }, { data: cp }] = await Promise.all([
    supabase.from("user_profiles").select("target_roles").eq("user_id", userId).maybeSingle(),
    supabase.from("career_profiles").select("skills, headline, summary").eq("user_id", userId).maybeSingle(),
  ]);
  const targetRoles = (up?.target_roles ?? []) as string[];
  if (targetRoles.length === 0) return { recs: 0 };

  const skills = (cp?.skills ?? []) as string[];
  const profile = { targetRoles, skills, targetSeniority: null };

  const groups = expandQueriesDeno(targetRoles);
  const perGroupResults = await Promise.all(groups.map(async g => {
    const arg = buildTsqueryArgDeno(g.queries);
    if (!arg.arg) return { label: g.label, rows: [] as any[] };
    const { data } = await supabase.from("ats_jobs")
      .select("id, title, company, description, extracted_skills, extracted_seniority")
      .eq("is_active", true).eq("enrichment_status", "complete")
      .textSearch("title", arg.arg, { type: arg.mode, config: "english" })
      .order("posted_at", { ascending: false, nullsFirst: false })
      .limit(40);
    return { label: g.label, rows: data ?? [] };
  }));

  const tagged = new Map<string, { row: any; retrievedFor: string[] }>();
  for (const { label, rows } of perGroupResults) {
    for (const r of rows) {
      const existing = tagged.get(r.id);
      if (existing) {
        if (!existing.retrievedFor.includes(label)) existing.retrievedFor.push(label);
      } else {
        tagged.set(r.id, { row: r, retrievedFor: [label] });
      }
    }
  }

  // fix/jobs-curator-deno-port Fix 4 — set computed_at explicitly on
  //   every scored row. Without this, the upsert's ON CONFLICT UPDATE
  //   path preserves the existing row's computed_at, freezing
  //   X-Recommendations-Computed-At forever.
  const nowIso = new Date().toISOString();
  const scored = [...tagged.values()].map(({ row, retrievedFor }) => {
    const s = scoreJob(row, profile);
    const tier = classify(s.total, "exact");
    if (!tier) return null;
    const matchedRole = retrievedFor[0] ?? "";
    const baseReason = reasonFor(s);
    const reasonWithProvenance = matchedRole
      ? `Retrieved for ${matchedRole}${baseReason ? " · " + baseReason : ""}`
      : baseReason;
    return {
      user_id:      userId,
      job_id:       row.id,
      fit_score:    s.total,
      tier,
      match_reason: reasonWithProvenance,
      computed_at:  nowIso,
    };
  }).filter(Boolean).slice(0, 100);

  if (scored.length > 0) {
    await supabase.from("user_job_recommendations").upsert(scored, {
      onConflict: "user_id,job_id",
      ignoreDuplicates: false,
    });
  }
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  await supabase.from("user_job_recommendations")
    .delete().eq("user_id", userId).lt("computed_at", cutoff);

  return { recs: scored.length };
}

async function runBatch(supabase: any): Promise<{ users: number; recs: number }> {
  const { data: run } = await supabase.from("curation_runs")
    .insert({ trigger: "scheduled" }).select("id").single();

  let users = 0, recs = 0;
  try {
    let cursor: string | null = null;
    while (true) {
      let q = supabase.from("user_profiles").select("user_id").order("user_id");
      if (cursor) q = q.gt("user_id", cursor);
      q = q.limit(50);
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data ?? []) as Array<{ user_id: string }>;
      if (rows.length === 0) break;

      for (const r of rows) {
        try {
          const { recs: n } = await curateForUser(supabase, r.user_id);
          users++;
          recs += n;
        } catch (_e) { /* per-user error swallowed */ }
      }
      cursor = rows[rows.length - 1].user_id;
      if (rows.length < 50) break;
    }
    if (run?.id) {
      await supabase.from("curation_runs").update({
        finished_at: new Date().toISOString(),
        users_processed: users,
        recommendations_written: recs,
        status: "complete",
      }).eq("id", run.id);
    }
  } catch (err) {
    if (run?.id) {
      await supabase.from("curation_runs").update({
        finished_at: new Date().toISOString(),
        status: "failed",
        error: String(err),
      }).eq("id", run.id);
    }
    throw err;
  }
  return { users, recs };
}

Deno.serve(async (req: Request) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  let body: any = {};
  try { body = await req.json(); } catch (_e) { /* GET or empty body */ }

  try {
    if (body?.userId && typeof body.userId === "string") {
      const started = Date.now();
      const { recs } = await curateForUser(supabase, body.userId);
      return new Response(JSON.stringify({ userId: body.userId, recs, durationMs: Date.now() - started }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }
    const started = Date.now();
    const r = await runBatch(supabase);
    return new Response(JSON.stringify({ ...r, durationMs: Date.now() - started }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[curate-user-recommendations] fatal:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
