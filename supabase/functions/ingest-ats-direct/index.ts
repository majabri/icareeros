/**
 * feat/jobs-ats-aggregation Phase 2 — ingest-ats-direct edge function.
 * feat/jobs-ingest-workday-smartrecruiters — v3: adds Workday CXS + SR
 * fan-out and syncs the hardcoded slug lists to companyList.ts contents.
 *
 * Runs every ~4h (via pg_cron or the Supabase scheduler) to refresh the
 * public.ats_jobs table with every open posting on the curated ATS
 * company list. The function fans out at BATCH_SIZE parallel requests
 * to avoid stampeding any single ATS host. Never throws — all
 * per-tenant failures degrade to a logged error in the response body.
 *
 * Deploy:  supabase functions deploy ingest-ats-direct --project-ref kuneabeiwcxavvyyfjkx
 * Trigger: POST https://{project}.supabase.co/functions/v1/ingest-ats-direct
 */
// deno-lint-ignore-file no-explicit-any
// @ts-nocheck

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BATCH_SIZE = 20;
const FETCH_TIMEOUT_MS = 10_000;
const WD_PAGE_DELAY_MS = 200;   // rate-limit between Workday pages per tenant

// ── Company lists — kept in sync with src/services/integrations/ats/companyList.ts ──

const GREENHOUSE: string[] = [
  "airbnb","instacart","doordash","lyft","robinhood",
  "coinbase","stripe","discord","datadoghq","elastic",
  "gitlab","twilio","shopify","atlassian","asana",
  "reddit","pinterest","squarespace","snowflakecomputing","okta",
  "carta","betterment","marqeta","nubank","toast",
  "sofi","affirm","chime","jumptrading","akunacapital",
  "virtu","honor","imc","onemedical","oscar",
  "zocdoc","talkspace","zscaler","cloudflare","mixpanel",
  "pagerduty","amplitude","dashlane","newrelic","braze",
  "mongodb","dragos","riotgames","epicgames","thoughtworks",
  "roblox","glossier","peloton","voxmedia","buzzfeed",
  "adyen","databricks","monzo","bcg","tcs"
];

const LEVER: string[] = [
  "netflix","spotify","rippling","ramp","scale",
  "anthropic","openai","huggingface","perplexity","linear",
  "vercel","supabase","replit","notion","figma",
  "loom","miro","framer","raycast","arc",
  "palantir"
];

const ASHBY: string[] = [
  "ramp","linear","vanta","modal","deel",
  "mercury","brex","warpdotdev","attio","prisma",
  "tigerbeetle","render","fly","convex","neon",
  "browserbase","trigger","windsurf","cursor","method",
  "persona","column","abridge","writer","character",
  "midjourney","posthog","photoroom","resend","langchain",
  "cohere","elevenlabs","kalshi","whoop","drata"
];

const WORKDAY: Array<{ tenant: string; shard: string; site: string }> = [
  { tenant: "kla", shard: "wd1", site: "Search" },
  { tenant: "salesforce", shard: "wd12", site: "External_Career_Site" },
  { tenant: "adobe", shard: "wd5", site: "external_experienced" },
  { tenant: "accenture", shard: "wd103", site: "AccentureCareers" },
  { tenant: "boeing", shard: "wd1", site: "EXTERNAL_CAREERS" },
  { tenant: "capitalone", shard: "wd12", site: "Capital_One" },
  { tenant: "cvshealth", shard: "wd1", site: "CVS_Health_Careers" },
  { tenant: "disney", shard: "wd5", site: "disneycareer" },
  { tenant: "hpe", shard: "wd5", site: "Jobsathpe" },
  { tenant: "intel", shard: "wd1", site: "External" },
  { tenant: "mastercard", shard: "wd1", site: "CorporateCareers" },
  { tenant: "ms", shard: "wd5", site: "External" },
  { tenant: "pfizer", shard: "wd1", site: "PfizerCareers" },
  { tenant: "pwc", shard: "wd3", site: "Global_Experienced_Careers" },
  { tenant: "statestreet", shard: "wd1", site: "Global" },
  { tenant: "target", shard: "wd5", site: "targetcareers" },
  { tenant: "travelers", shard: "wd5", site: "External" }
];

const SMARTRECRUITERS: string[] = [
  "Visa","ASOS","BoschGroup","DeliveryHero","Dominos"
];

// ── Common helpers ──────────────────────────────────────────────────────

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

async function fetchJson<T>(url: string, init: RequestInit = {}): Promise<T | null> {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, {
      ...init,
      headers: { Accept: "application/json", "User-Agent": "iCareerOS-Ingest/1.0", ...(init.headers ?? {}) },
      signal: ctl.signal,
    });
    clearTimeout(t);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch { return null; }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ── Greenhouse ──────────────────────────────────────────────────────────

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
        enrichment_status: "pending",
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

// ── Lever ───────────────────────────────────────────────────────────────

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
        enrichment_status: "pending",
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

// ── Ashby ───────────────────────────────────────────────────────────────

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
        enrichment_status: "pending",
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

// ── Workday CXS ─────────────────────────────────────────────────────────

/**
 * Workday tenant fetcher. Paginates through all pages of `.jobPostings[]`
 * (up to a hard cap of 20 pages) and upserts rows. Descriptions are NOT
 * fetched during ingest — the enrichment cron picks up the row and
 * resolves the direct URL + skills etc. later.
 */
export function buildWorkdayUrl(tenant: string, shard: string, site: string): string {
  return `https://${tenant}.${shard}.myworkdayjobs.com/wday/cxs/${tenant}/${site}/jobs`;
}

export function workdayApplyUrl(tenant: string, shard: string, site: string, externalPath: string): string {
  return `https://${tenant}.${shard}.myworkdayjobs.com/${site}${externalPath}`;
}

async function ingestWorkday(supabase: any): Promise<{ upserted: number; errors: string[] }> {
  let upserted = 0;
  const errors: string[] = [];
  const WD_PAGE_SIZE = 20;
  const WD_MAX_PAGES = 20;
  for (const tenant of WORKDAY) {
    const url = buildWorkdayUrl(tenant.tenant, tenant.shard, tenant.site);
    let offset = 0;
    try {
      for (let page = 0; page < WD_MAX_PAGES; page++) {
        const body = { appliedFacets: {}, limit: WD_PAGE_SIZE, offset, searchText: "" };
        const data = await fetchJson<any>(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const postings: any[] = data?.jobPostings ?? [];
        if (postings.length === 0) break;

        const rows = postings.map((p: any) => {
          const externalPath = p.externalPath ?? "";
          const applyUrl = externalPath ? workdayApplyUrl(tenant.tenant, tenant.shard, tenant.site, externalPath) : null;
          if (!applyUrl) return null;
          return {
            source: "workday",
            external_id: `${tenant.tenant}:${externalPath}`,
            company: tenant.tenant,
            title: (p.title || "").trim(),
            location: p.locationsText ?? null,
            description: "", // populated by enrichment
            apply_url: applyUrl,
            posted_at: null,
            remote: /remote/i.test(p.locationsText ?? "") || /remote/i.test(p.title ?? ""),
            raw: p,
            last_seen_at: new Date().toISOString(),
            is_active: true,
            enrichment_status: "pending",
          };
        }).filter((r: any) => r !== null);

        if (rows.length > 0) {
          const { error } = await supabase.from("ats_jobs").upsert(rows, { onConflict: "source,apply_url" });
          if (error) { errors.push(`wd:${tenant.tenant}:${error.message}`.slice(0, 200)); break; }
          upserted += rows.length;
        }
        if (postings.length < WD_PAGE_SIZE) break;
        offset += WD_PAGE_SIZE;
        await sleep(WD_PAGE_DELAY_MS);
      }
    } catch (e) {
      errors.push(`wd:${tenant.tenant}:${(e as Error).message}`.slice(0, 200));
    }
  }
  return { upserted, errors };
}

// ── SmartRecruiters ─────────────────────────────────────────────────────

async function ingestSmartRecruiters(supabase: any): Promise<{ upserted: number; errors: string[] }> {
  let upserted = 0;
  const errors: string[] = [];
  const SR_PAGE_SIZE = 100;
  const SR_MAX_PAGES = 30;
  for (const slug of SMARTRECRUITERS) {
    let offset = 0;
    try {
      for (let page = 0; page < SR_MAX_PAGES; page++) {
        const listUrl = `https://api.smartrecruiters.com/v1/companies/${slug}/postings?limit=${SR_PAGE_SIZE}&offset=${offset}`;
        const data = await fetchJson<any>(listUrl);
        const postings: any[] = data?.content ?? [];
        if (postings.length === 0) break;

        // Batch details in parallel (small — 100 per page)
        const rows = postings.filter((p: any) => p.id && p.applyUrl).map((p: any) => ({
          source: "smartrecruiters",
          external_id: p.id,
          company: slug,
          title: (p.name || "").trim(),
          location: p.location?.city ? `${p.location.city}${p.location.country ? ", " + p.location.country : ""}` : null,
          description: "", // enrichment fills this
          apply_url: p.applyUrl ?? p.postingUrl,
          posted_at: p.releasedDate ?? p.createdOn ?? null,
          remote: !!p.location?.remote,
          raw: p,
          last_seen_at: new Date().toISOString(),
          is_active: true,
          enrichment_status: "pending",
        }));

        if (rows.length > 0) {
          const { error } = await supabase.from("ats_jobs").upsert(rows, { onConflict: "source,apply_url" });
          if (error) { errors.push(`sr:${slug}:${error.message}`.slice(0, 200)); break; }
          upserted += rows.length;
        }
        if (postings.length < SR_PAGE_SIZE) break;
        offset += SR_PAGE_SIZE;
        await sleep(WD_PAGE_DELAY_MS);
      }
    } catch (e) {
      errors.push(`sr:${slug}:${(e as Error).message}`.slice(0, 200));
    }
  }
  return { upserted, errors };
}

// ── HTTP entrypoint ─────────────────────────────────────────────────────

serve(async (_req) => {
  const startTime = Date.now();
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const runStartedAt = new Date().toISOString();

    // feat/jobs-ingest-workday-smartrecruiters — fan out across all 5
    // sources in parallel via Promise.allSettled so a slow Workday tenant
    // can't block a fast Greenhouse response.
    const [ghRes, leverRes, ashbyRes, wdRes, srRes] = await Promise.allSettled([
      ingestGreenhouse(supabase),
      ingestLever(supabase),
      ingestAshby(supabase),
      ingestWorkday(supabase),
      ingestSmartRecruiters(supabase),
    ]);

    const unwrap = (r: PromiseSettledResult<{ upserted: number; errors: string[] }>) =>
      r.status === "fulfilled" ? r.value : { upserted: 0, errors: [String(r.reason).slice(0, 200)] };
    const gh = unwrap(ghRes), lever = unwrap(leverRes), ashby = unwrap(ashbyRes);
    const workday = unwrap(wdRes), smartrecruiters = unwrap(srRes);

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

    const totalIngested = gh.upserted + lever.upserted + ashby.upserted + workday.upserted + smartrecruiters.upserted;
    const combinedErrors = [
      ...gh.errors.map(e             => ({ source: "greenhouse",      error: e })),
      ...lever.errors.map(e          => ({ source: "lever",           error: e })),
      ...ashby.errors.map(e          => ({ source: "ashby",           error: e })),
      ...workday.errors.map(e        => ({ source: "workday",         error: e })),
      ...smartrecruiters.errors.map(e=> ({ source: "smartrecruiters", error: e })),
    ];
    const body = {
      success:  true,
      ok:       true,
      ingested: totalIngested,
      updated:  0,
      deactivated,
      sources: {
        greenhouse:      gh.upserted,
        lever:           lever.upserted,
        ashby:           ashby.upserted,
        workday:         workday.upserted,
        smartrecruiters: smartrecruiters.upserted,
      },
      // Compact per-source shape the brief asked for
      greenhouse:      { upserted: gh.upserted,             errors: gh.errors.length },
      lever:           { upserted: lever.upserted,          errors: lever.errors.length },
      ashby:           { upserted: ashby.upserted,          errors: ashby.errors.length },
      workday:         { upserted: workday.upserted,        errors: workday.errors.length },
      smartrecruiters: { upserted: smartrecruiters.upserted, errors: smartrecruiters.errors.length },
      duration_ms: Date.now() - startTime,
      errors: combinedErrors,
      runStartedAt,
      finishedAt: new Date().toISOString(),
    };
    return new Response(JSON.stringify(body, null, 2), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: (err as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
