/**
 * feat/jobs-ats-aggregation Phase 2 — ingest-ats-direct edge function.
 *
 * Runs every ~4h (via pg_cron or the Supabase scheduler) to refresh the
 * public.ats_jobs table with every open posting on the curated ATS
 * company list. The function fans out at BATCH_SIZE parallel requests to
 * avoid stampeding any single ATS host. Never throws — all per-tenant
 * failures degrade to a logged error in the response body.
 *
 * PENDING: this function is not yet deployed. Deployment steps:
 *   1. Ensure supabase/migrations/*_ats_jobs.sql has been applied
 *      (Platform-owned; the migration file's PENDING header notes this)
 *   2. supabase functions deploy ingest-ats-direct --project-ref kuneabeiwcxavvyyfjkx
 *   3. Add a pg_cron entry:
 *        SELECT cron.schedule(
 *          'ingest-ats-4h', '0 star/4 * * *',
 *          $$ SELECT net.http_post(
 *               url:='https://kuneabeiwcxavvyyfjkx.supabase.co/functions/v1/ingest-ats-direct',
 *               headers:='{"Authorization":"Bearer <SERVICE_ROLE>"}'::jsonb) $$
 *        );
 */
// deno-lint-ignore-file no-explicit-any
// @ts-nocheck  — edge-function runtime uses Deno's native fetch/serve. This
// file is compiled by Supabase's build pipeline, not Next's tsc, so the
// per-line `deno-lint-ignore` + `@ts-nocheck` prevent the Next type-check
// from tripping on the Deno APIs.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BATCH_SIZE = 20;
const FETCH_TIMEOUT_MS = 8000;

// NOTE: This edge function must not import from `src/` (Next paths are
// unavailable in the Deno runtime). The company list is intentionally
// duplicated as a JSON literal here — keep in sync with src/services/
// integrations/ats/companyList.ts via the CI helper (see Phase 4 backlog).

const GREENHOUSE = ["airbnb","instacart","doordash","lyft","robinhood","coinbase","stripe","discord","datadoghq","elastic","gitlab","twilio","shopify","atlassian","asana","reddit","pinterest","squarespace","snowflakecomputing","okta"];
const LEVER      = ["netflix","spotify","rippling","ramp","scale","anthropic","openai","huggingface","perplexity","linear","vercel","supabase","replit","notion","figma","loom","miro","framer","raycast","arc"];
const ASHBY      = ["ramp","linear","vanta","modal","deel","mercury","brex","warpdotdev","attio","prisma","tigerbeetle","render","fly","convex","neon","browserbase","trigger","windsurf","cursor"];

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "iCareerOS-Ingest/1.0" },
      signal: ctl.signal,
    });
    clearTimeout(t);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch { return null; }
}

async function ingestGreenhouse(supabase: any): Promise<{ upserted: number; errors: string[] }> {
  let upserted = 0;
  const errors: string[] = [];
  for (let i = 0; i < GREENHOUSE.length; i += BATCH_SIZE) {
    const batch = GREENHOUSE.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(batch.map(async (slug) => {
      const data = await fetchJson<{ jobs?: any[] }>(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`);
      const jobs = data?.jobs ?? [];
      const rows = jobs.filter((j: any) => j.absolute_url).map((j: any) => ({
        source: "greenhouse",
        external_id: String(j.id ?? ""),
        company: slug,
        title: (j.title || "").trim(),
        location: j.location?.name ?? null,
        description: stripHtml(j.content ?? ""),
        apply_url: j.absolute_url,
        posted_at: j.updated_at ?? null,
        remote: /remote/i.test(j.title ?? "") || /remote/i.test(j.location?.name ?? ""),
        raw: j,
        last_seen_at: new Date().toISOString(),
        is_active: true,
      }));
      if (rows.length === 0) return 0;
      const { error } = await supabase.from("ats_jobs").upsert(rows, { onConflict: "source,apply_url" });
      if (error) throw new Error(`gh:${slug}:${error.message}`);
      return rows.length;
    }));
    for (const r of results) {
      if (r.status === "fulfilled") upserted += r.value;
      else errors.push(String(r.reason).slice(0, 200));
    }
  }
  return { upserted, errors };
}

async function ingestLever(supabase: any): Promise<{ upserted: number; errors: string[] }> {
  let upserted = 0;
  const errors: string[] = [];
  for (let i = 0; i < LEVER.length; i += BATCH_SIZE) {
    const batch = LEVER.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(batch.map(async (slug) => {
      const postings = (await fetchJson<any[]>(`https://api.lever.co/v0/postings/${slug}?mode=json`)) ?? [];
      const rows = postings.filter((p: any) => p.hostedUrl).map((p: any) => ({
        source: "lever",
        external_id: p.id,
        company: slug,
        title: (p.text || "").trim(),
        location: p.categories?.location ?? null,
        description: stripHtml(p.description ?? ""),
        apply_url: p.hostedUrl,
        employment_type: p.categories?.commitment ?? null,
        posted_at: p.createdAt ? new Date(p.createdAt).toISOString() : null,
        raw: p,
        last_seen_at: new Date().toISOString(),
        is_active: true,
      }));
      if (rows.length === 0) return 0;
      const { error } = await supabase.from("ats_jobs").upsert(rows, { onConflict: "source,apply_url" });
      if (error) throw new Error(`lever:${slug}:${error.message}`);
      return rows.length;
    }));
    for (const r of results) {
      if (r.status === "fulfilled") upserted += r.value;
      else errors.push(String(r.reason).slice(0, 200));
    }
  }
  return { upserted, errors };
}

async function ingestAshby(supabase: any): Promise<{ upserted: number; errors: string[] }> {
  let upserted = 0;
  const errors: string[] = [];
  for (let i = 0; i < ASHBY.length; i += BATCH_SIZE) {
    const batch = ASHBY.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(batch.map(async (slug) => {
      const data = await fetchJson<{ jobs?: any[] }>(`https://api.ashbyhq.com/posting-api/job-board/${slug}`);
      const jobs = data?.jobs ?? [];
      const rows = jobs.filter((j: any) => j.jobUrl).map((j: any) => ({
        source: "ashby",
        external_id: j.id,
        company: slug,
        title: (j.title || "").trim(),
        location: j.locationName ?? null,
        description: stripHtml(j.descriptionPlain ?? ""),
        apply_url: j.jobUrl,
        posted_at: j.publishedDate ?? null,
        remote: !!j.isRemote,
        raw: j,
        last_seen_at: new Date().toISOString(),
        is_active: true,
      }));
      if (rows.length === 0) return 0;
      const { error } = await supabase.from("ats_jobs").upsert(rows, { onConflict: "source,apply_url" });
      if (error) throw new Error(`ashby:${slug}:${error.message}`);
      return rows.length;
    }));
    for (const r of results) {
      if (r.status === "fulfilled") upserted += r.value;
      else errors.push(String(r.reason).slice(0, 200));
    }
  }
  return { upserted, errors };
}

serve(async (_req) => {
  const startTime = Date.now();
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const runStartedAt = new Date().toISOString();
    const gh    = await ingestGreenhouse(supabase);
    const lever = await ingestLever(supabase);
    const ashby = await ingestAshby(supabase);

    // Deactivate postings not seen in ~48h. Non-fatal on failure.
    let deactivated = 0;
    try {
      const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      const { count } = await supabase
        .from("ats_jobs")
        .update({ is_active: false })
        .lt("last_seen_at", cutoff)
        .eq("is_active", true)
        .select("id", { count: "exact", head: true });
      deactivated = count ?? 0;
    } catch (_e) { /* best-effort */ }

    // feat/jobs-search-db Task 1 — clean response shape. The prior shape
    // exposed { greenhouse:{upserted}, lever:{upserted}, ashby:{upserted} }
    // but the cron caller in src/app/api/cron/ingest-ats/route.ts expects
    // { upsert:{inserted} } — the mismatch produced "inserted=?" in logs.
    // Aligning to a single stable contract used by both sides.
    const totalIngested = gh.upserted + lever.upserted + ashby.upserted;
    const combinedErrors = [
      ...gh.errors.map(e    => ({ source: "greenhouse", error: e })),
      ...lever.errors.map(e => ({ source: "lever",      error: e })),
      ...ashby.errors.map(e => ({ source: "ashby",      error: e })),
    ];
    const body = {
      success:  true,
      ok:       true,
      ingested: totalIngested,
      // We upsert on ONCONFLICT so ingested combines new + updated. Split
      // reporting would require the DB to distinguish; approximated as
      // total for now. Deactivated tracked separately.
      updated:  0,
      deactivated,
      sources: {
        greenhouse: gh.upserted,
        lever:      lever.upserted,
        ashby:      ashby.upserted,
      },
      duration_ms: Date.now() - startTime,
      errors: combinedErrors,
      runStartedAt,
      finishedAt: new Date().toISOString(),
      // TODO Phase 2 v2: extend to workable/recruitee/smartrecruiters/breezy/pinpoint
      // once each has a verified company list.
    };
    return new Response(JSON.stringify(body, null, 2), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: (err as Error).message }), {
      status:  500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
