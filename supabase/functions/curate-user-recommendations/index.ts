// deno-lint-ignore-file no-explicit-any
/**
 * curate-user-recommendations — Phase 3 of feat/jobs-pipeline.
 *
 * Runs daily at 04:00 UTC OR on-demand when a user's target_roles /
 * skills change (via DB trigger).
 *
 * For each active user (or one specific user when {userId} is provided):
 *   1. Load user_profiles.target_roles + career_profiles.skills/summary/headline
 *   2. Run a Deno-native version of the curator (same scoring math as
 *      src/services/curator/*) against ats_jobs where enrichment_status='complete'
 *   3. Upsert top 100 matches into user_job_recommendations
 *   4. Delete stale rows for this user (computed_at < NOW() - 1 day)
 *
 * On-demand invocation body: { userId: "<uuid>", trigger: "profile_change" }
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// ── Small utilities: role families (subset — 30+ synonyms across 8 families) ─
const ROLE_FAMILIES: Record<string, string[]> = {
  security_exec: [
    "director of security", "head of security", "ciso", "chief information security officer",
    "chief security officer", "biso", "vp security", "security director",
    "chief cybersecurity officer", "cso", "vciso", "virtual ciso",
    "field ciso", "security lead", "security executive",
  ],
  engineering_exec: [
    "director of engineering", "engineering director", "vp engineering",
    "cto", "chief technology officer", "head of engineering",
  ],
  product_exec: [
    "director of product", "vp product", "chief product officer", "cpo",
    "head of product",
  ],
  data_exec: [
    "director of data", "chief data officer", "cdo", "head of data",
    "vp data", "head of analytics",
  ],
  cfo_finance: ["cfo", "chief financial officer", "vp finance"],
  coo_ops:     ["coo", "chief operating officer", "vp operations"],
  chro_people: ["chro", "chief people officer", "vp people", "vp hr"],
  cmo_marketing:["cmo", "chief marketing officer", "vp marketing"],
};

function expandRoles(targetRoles: string[]): string[] {
  const set = new Set<string>();
  for (const r of targetRoles) {
    const t = (r ?? "").toLowerCase().trim();
    if (!t) continue;
    set.add(t);
    for (const [, syns] of Object.entries(ROLE_FAMILIES)) {
      if (syns.some(s => t.includes(s) || s.includes(t))) {
        syns.forEach(s => set.add(s));
      }
    }
  }
  return Array.from(set);
}

function toWebsearchQuery(roles: string[]): string {
  return roles
    .map(r => r.trim().toLowerCase())
    .filter(Boolean)
    .map(r => (/\s/.test(r) ? `"${r.replace(/"/g, "")}"` : r))
    .join(" OR ");
}

// ── Fit scoring — reduced to what we need for tier + reason ─────────────
function scoreJob(job: any, profile: any): { total: number; roleSignal: string; matchedSkills: string[]; missingSkills: string[]; roleBestMatch: string } {
  const title = (job.title ?? "").toLowerCase();
  const desc  = (job.description ?? "").toLowerCase();
  const roles: string[] = (profile.targetRoles ?? []).map((r: string) => r.toLowerCase());
  const skills: string[] = (profile.skills ?? []).map((s: string) => s.toLowerCase());

  // Role signal — highest word-overlap ratio across targetRoles
  let bestOverlap = 0;
  let bestMatch = "";
  for (const r of roles) {
    const wA = new Set(title.split(/\s+/));
    const wB = new Set(r.split(/\s+/));
    const inter = [...wA].filter(w => wB.has(w)).length;
    const union = new Set([...wA, ...wB]).size;
    const ratio = union ? inter / union : 0;
    if (ratio > bestOverlap) { bestOverlap = ratio; bestMatch = r; }
  }
  const roleScore = Math.round(bestOverlap * 100);
  const roleSignal = roleScore >= 80 ? "exact" : roleScore >= 40 ? "adjacent" : roleScore >= 20 ? "stretch" : "mismatch";

  // Skills match
  const matched: string[] = [];
  const missing: string[] = [];
  const jobSkills = (job.extracted_skills ?? []) as string[];
  const jobSkillsLower = jobSkills.map(s => s.toLowerCase());
  for (const s of skills) {
    if (jobSkillsLower.includes(s) || desc.includes(s)) matched.push(s);
    else missing.push(s);
  }
  const skillsScore = skills.length ? Math.round((matched.length / skills.length) * 100) : 0;

  // Seniority — profile.targetSeniority == job.extracted_seniority?
  const senMatch = profile.targetSeniority && job.extracted_seniority === profile.targetSeniority;
  const seniorityScore = senMatch ? 100 : 50;

  // Composite (matches the Next.js curator's weights)
  const total = Math.max(0, Math.min(100, Math.round(
    roleScore     * 0.35 +
    skillsScore   * 0.30 +
    seniorityScore* 0.20 +
    50            * 0.10 +   // experience placeholder
    (desc && roles.some(r => desc.includes(r)) ? 80 : 30) * 0.05
  )));

  return { total, roleSignal, matchedSkills: matched, missingSkills: missing, roleBestMatch: bestMatch };
}

function classify(total: number, origin: "exact" | "adjacent" | "skills"): "strongMatch" | "worthConsidering" | "stretch" | null {
  if (origin === "exact" && total >= 65) return "strongMatch";
  if (total >= 45 && total < 65) return "worthConsidering";
  if (total >= 30) return "stretch";
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

// ── Per-user curation ────────────────────────────────────────────────────
async function curateForUser(supabase: any, userId: string): Promise<{ recs: number }> {
  const [{ data: up }, { data: cp }] = await Promise.all([
    supabase.from("user_profiles").select("target_roles").eq("user_id", userId).maybeSingle(),
    supabase.from("career_profiles").select("skills, headline, summary").eq("user_id", userId).maybeSingle(),
  ]);
  const targetRoles = (up?.target_roles ?? []) as string[];
  if (targetRoles.length === 0) return { recs: 0 };

  const skills = (cp?.skills ?? []) as string[];
  const profile = { targetRoles, skills, targetSeniority: null };

  // fix/jobs-curation-family-precision PR 3 — Deno port of the
  //   unified retrieval engine. One tsquery per target role, run in
  //   parallel; union + dedupe by id with retrievedFor labels
  //   accumulated. NO family fast-path here either.
  void expandRoles; void toWebsearchQuery;   // legacy — no longer used
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

  const scored = [...tagged.values()].map(({ row, retrievedFor }) => {
    // Every candidate came from an exact title match — queryOrigin='exact'
    // per the unified model.
    const s = scoreJob(row, profile);
    const tier = classify(s.total, "exact");
    if (!tier) return null;
    // Prefer retrievedFor[0] as the matched role in the reason line.
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
    };
  }).filter(Boolean).slice(0, 100);

  if (scored.length > 0) {
    await supabase.from("user_job_recommendations").upsert(scored, { onConflict: "user_id,job_id" });
  }
  // Delete stale recs for this user (older than yesterday)
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  await supabase.from("user_job_recommendations")
    .delete().eq("user_id", userId).lt("computed_at", cutoff);

  return { recs: scored.length };
}

// ── Batch orchestration ─────────────────────────────────────────────────
async function runBatch(supabase: any): Promise<{ users: number; recs: number }> {
  // Track this run for observability
  const { data: run } = await supabase.from("curation_runs")
    .insert({ trigger: "scheduled" }).select("id").single();

  let users = 0, recs = 0;
  try {
    // Process users in chunks of 50
    let cursor: string | null = null;
    while (true) {
      let q = supabase.from("user_profiles").select("user_id").order("user_id");
      if (cursor) q = q.gt("user_id", cursor);
      q = q.limit(50);
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data ?? []) as Array<{ user_id: string }>;
      if (rows.length === 0) break;

      // Serialise per-user to avoid overloading Postgres textSearch
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
