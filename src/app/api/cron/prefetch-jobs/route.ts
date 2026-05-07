/**
 * POST /api/cron/prefetch-jobs
 *
 * Vercel Cron — runs every 6 hours.
 * Pre-populates the `opportunities` table with Adzuna results so the
 * dashboard's Act and Advise stages have live job data without users
 * triggering on-demand searches.
 *
 * Phase 2 Item 2 — see docs/specs/COWORK-BRIEF-phase2-v1.md.
 *
 * Strategy
 * --------
 * Roles are derived from career_profiles in two tiers:
 *   1. Headlines (text) — distinct, trimmed, non-empty. Headlines often
 *      hold the user's role aspiration ("Senior Product Manager",
 *      "Backend Engineer (Go)"), so they make better Adzuna `what`
 *      queries than raw skills.
 *   2. Fallback: top-5 most-frequent target_skills (text[]) — used only
 *      when fewer than 3 distinct headlines exist (e.g. early user base).
 *
 * Cap at 10 total roles per run to stay within Vercel's 30s cron budget.
 * Each role pulls up to 20 Adzuna results, so a single run can populate
 * up to 200 opportunities.
 *
 * Auth
 * ----
 * Bearer CRON_SECRET in Authorization header. Mirrors the pattern in
 * /api/cron/job-alerts/route.ts. Vercel adds this automatically when
 * invoking the scheduled cron.
 *
 * Schema
 * ------
 * No migration. Reuses existing columns:
 *   - source = 'adzuna_prefetch' (distinct from 'adzuna' on-demand rows)
 *   - source_id = Adzuna's job id (without the "adzuna-" prefix the
 *     adapter applies for OpportunityResult.id)
 *   - first_seen_at = now() (default; serves as the row's ingest timestamp)
 *
 * Dedup
 * -----
 * Upsert with onConflict: "source,source_id" — same pattern as
 * /api/jobs/agent. A row that already exists at (source, source_id)
 * is updated, not duplicated.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { searchAdzuna } from "@/services/integrations/adzunaAdapter";
import type { OpportunityResult } from "@/services/opportunityTypes";

const MAX_ROLES                = 10;
const RESULTS_PER_ROLE         = 20;
const HEADLINE_MIN_BEFORE_FALLBACK = 3;
const WALL_CLOCK_BUDGET_MS     = 25_000;

interface RoleQuery {
  what: string;
  src:  "headline" | "skill";
}

// ── Role selection ──────────────────────────────────────────────────────────

/**
 * Build the list of role-query strings to feed Adzuna. Headlines first
 * (more specific to job titles), with target_skills as a fallback when
 * the headline pool is too small.
 */
async function selectRoleQueries(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: ReturnType<typeof createClient<any, any>>,
): Promise<RoleQuery[]> {
  // Tier 1 — distinct trimmed headlines
  const { data: headlineRows, error: headlineErr } = await supabase
    .from("career_profiles")
    .select("headline")
    .not("headline", "is", null);

  const headlines = new Set<string>();
  if (!headlineErr && Array.isArray(headlineRows)) {
    for (const r of headlineRows as Array<{ headline: string | null }>) {
      const trimmed = (r.headline ?? "").trim();
      if (trimmed) headlines.add(trimmed);
    }
  }

  let roles: RoleQuery[] = Array.from(headlines)
    .slice(0, MAX_ROLES)
    .map(h => ({ what: h, src: "headline" as const }));

  // Tier 2 — top target_skills if headline pool is too thin
  if (roles.length < HEADLINE_MIN_BEFORE_FALLBACK) {
    const { data: skillRows, error: skillErr } = await supabase
      .from("career_profiles")
      .select("target_skills");

    if (!skillErr && Array.isArray(skillRows)) {
      const counts = new Map<string, number>();
      for (const r of skillRows as Array<{ target_skills: string[] | null }>) {
        const skills = r.target_skills ?? [];
        for (const s of skills) {
          const key = (s ?? "").trim();
          if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
        }
      }
      const topSkills = Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([s]) => ({ what: s, src: "skill" as const }));

      const seen = new Set(roles.map(r => r.what.toLowerCase()));
      for (const s of topSkills) {
        if (roles.length >= MAX_ROLES) break;
        if (!seen.has(s.what.toLowerCase())) {
          roles.push(s);
          seen.add(s.what.toLowerCase());
        }
      }
    }
  }

  return roles.slice(0, MAX_ROLES);
}

// ── Adzuna OpportunityResult → opportunities row ────────────────────────────

interface OpportunityRow {
  source:          "adzuna_prefetch";
  source_id:       string | null;
  title:           string;
  company:         string;
  location:        string | null;
  description:     string | null;
  url:             string | null;
  job_type:        string | null;
  is_remote:       boolean;
  salary_min:      number | null;
  salary_max:      number | null;
  salary_currency: string | null;
  posted_at:       string | null;
  is_active:       boolean;
  is_flagged:      boolean;
  flag_reasons:    string[] | null;
  quality_score:   number | null;
}

function mapToRow(o: OpportunityResult): OpportunityRow {
  // The adapter prefixes its OpportunityResult.id with "adzuna-" — strip
  // it so source_id matches Adzuna's own canonical id and dedups against
  // any rows already inserted by /api/jobs/agent or /api/jobs/search.
  const sourceId = (o.id ?? "").replace(/^adzuna-/, "") || null;
  return {
    source:          "adzuna_prefetch",
    source_id:       sourceId,
    title:           o.title,
    company:         o.company,
    location:        o.location || null,
    description:     o.description || null,
    url:             o.url || null,
    job_type:        o.type || null,
    is_remote:       o.is_remote ?? false,
    salary_min:      o.salary_min ?? null,
    salary_max:      o.salary_max ?? null,
    salary_currency: o.salary_currency ?? null,
    posted_at:       o.first_seen_at ?? null,
    is_active:       true,
    is_flagged:      o.is_flagged ?? false,
    flag_reasons:    o.flag_reasons ?? null,
    quality_score:   o.quality_score ?? null,
  };
}

// ── Wall-clock guard ────────────────────────────────────────────────────────

function timeoutAfter<T>(ms: number, label: string): Promise<T> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`prefetch-jobs ${label} timeout after ${ms}ms`)), ms),
  );
}

// ── Route handler ───────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const startedAt = Date.now();

  // 1. Auth — Bearer CRON_SECRET (mirror /api/cron/job-alerts pattern)
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Service-role Supabase client — bypasses RLS for cross-user reads
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY not configured" },
      { status: 500 },
    );
  }
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
  );

  try {
    // 3. Build role queries
    const roles = await selectRoleQueries(supabase);
    if (roles.length === 0) {
      return NextResponse.json({
        fetched:    0,
        skipped:    0,
        roles:      [],
        sources:    {},
        durationMs: Date.now() - startedAt,
        message:    "No headlines or target_skills found in career_profiles — nothing to fetch.",
      });
    }

    // 4. Fan out to Adzuna (Promise.allSettled — one bad role doesn't kill others)
    const remainingMs = Math.max(2000, WALL_CLOCK_BUDGET_MS - (Date.now() - startedAt));
    const settled = await Promise.race([
      Promise.allSettled(
        roles.map(r =>
          searchAdzuna({ what: r.what, resultsPerPage: RESULTS_PER_ROLE })
            .then(result => ({ role: r, result }))
        ),
      ),
      timeoutAfter<never>(remainingMs, "Adzuna fan-out"),
    ]);

    // 5. Collect rows + per-role status
    const allRows: OpportunityRow[] = [];
    const perRoleStatus: Array<{ role: string; src: string; fetched: number; status: "ok" | "error" | "empty"; error?: string }> = [];

    for (let i = 0; i < settled.length; i++) {
      const r = settled[i];
      const meta = roles[i];
      if (r.status === "fulfilled") {
        const opps = r.value.result.opportunities;
        if (r.value.result.fallback) {
          perRoleStatus.push({ role: meta.what, src: meta.src, fetched: 0, status: "error", error: "Adzuna unconfigured or unreachable" });
        } else if (opps.length === 0) {
          perRoleStatus.push({ role: meta.what, src: meta.src, fetched: 0, status: "empty" });
        } else {
          for (const o of opps) allRows.push(mapToRow(o));
          perRoleStatus.push({ role: meta.what, src: meta.src, fetched: opps.length, status: "ok" });
        }
      } else {
        perRoleStatus.push({ role: meta.what, src: meta.src, fetched: 0, status: "error", error: r.reason instanceof Error ? r.reason.message : String(r.reason) });
      }
    }

    // 6. Upsert in one batched call. Empty rows → no-op return.
    let upsertedCount = 0;
    if (allRows.length > 0) {
      // Drop rows missing source_id (we can't dedup against them)
      const insertable = allRows.filter(r => r.source_id !== null);
      const skipped    = allRows.length - insertable.length;
      const { error: upsertErr } = await supabase
        .from("opportunities")
        .upsert(insertable, { onConflict: "source,source_id", ignoreDuplicates: false });
      if (upsertErr) {
        console.warn("[prefetch-jobs] upsert failed:", upsertErr.message);
        return NextResponse.json(
          {
            error:      upsertErr.message,
            fetched:    insertable.length,
            skipped,
            roles:      perRoleStatus,
            durationMs: Date.now() - startedAt,
          },
          { status: 500 },
        );
      }
      upsertedCount = insertable.length;
    }

    const durationMs = Date.now() - startedAt;
    console.log(`[prefetch-jobs] complete: roles=${roles.length} upserted=${upsertedCount} ${durationMs}ms`);
    return NextResponse.json({
      fetched:    upsertedCount,
      skipped:    allRows.length - upsertedCount,
      roles:      perRoleStatus,
      durationMs,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("[prefetch-jobs] error:", message);
    return NextResponse.json(
      { error: message, durationMs: Date.now() - startedAt },
      { status: 500 },
    );
  }
}
