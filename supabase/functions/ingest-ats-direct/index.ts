/**
 * feat/jobs-ats-aggregation Phase 2 — ingest-ats-direct edge function.
 * fix/jobs-ingest-adapter-bugs (v4) — Platform's PR #363 deploy report:
 *   Bug 1  SmartRecruiters ?embed=jobAd so applyUrl is populated
 *   Bug 2A fetchJsonWithLogging surfaces non-200s per source per slug
 *   Bug 2B 17 dead slugs pruned (verified via curl at PR time)
 *   Bug 3  Workday tenants parallelized batch=4 + MAX_PAGES_PER_TENANT=15
 *   Bug 4  Rolled-up `inserted` + `errors` at top level of response
 *
 * Deploy: supabase functions deploy ingest-ats-direct --project-ref kuneabeiwcxavvyyfjkx
 * Trigger: POST https://{project}.supabase.co/functions/v1/ingest-ats-direct
 */
// deno-lint-ignore-file no-explicit-any
// @ts-nocheck

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BATCH_SIZE = 20;                // Greenhouse/Lever/Ashby fetch batch
const FETCH_TIMEOUT_MS = 10_000;
const WD_PAGE_DELAY_MS = 100;         // Bug 3 — was 200
const WD_TENANT_BATCH  = 4;           // Bug 3 — parallel tenants per batch
const WD_MAX_PAGES_PER_TENANT = 15;   // Bug 3 — cap per tenant
const WD_PAGE_SIZE = 20;
const SR_PAGE_SIZE = 100;
const SR_MAX_PAGES = 30;

// ── Company lists — synced to companyList.ts (dead slugs pruned) ────────

const GREENHOUSE: string[] = [
  "airbnb","instacart","lyft","robinhood","coinbase",
  "stripe","discord","elastic","gitlab","twilio",
  "asana","reddit","pinterest","squarespace","okta",
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
  "spotify","rippling","ramp","scale","anthropic",
  "openai","huggingface","perplexity","linear","vercel",
  "supabase","replit","notion","figma","loom",
  "miro","framer","raycast","arc"
];

const ASHBY: string[] = [
  "ramp","linear","vanta","modal","attio",
  "render","neon","browserbase","cursor","method",
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
  return (s ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * Bug 2A — fetch helper that logs every non-2xx into the shared errors[]
 * so we can see which specific slugs are dying, instead of silently
 * treating them as "no jobs".
 */
async function fetchJsonWithLogging<T>(url: string, source: string, slug: string, errors: string[], init: RequestInit = {}): Promise<T | null> {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, {
      ...init,
      headers: { Accept: "application/json", "User-Agent": "iCareerOS-Ingest/1.0", ...(init.headers ?? {}) },
      signal: ctl.signal,
    });
    clearTimeout(t);
    if (!res.ok) {
      errors.push(`${source}:${slug}:HTTP ${res.status}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    errors.push(`${source}:${slug}:${(err as Error).message}`);
    return null;
  }
}

// ── Greenhouse ──────────────────────────────────────────────────────────

async function ingestGreenhouse(supabase: any): Promise<{ upserted: number; errors: string[] }> {
  let upserted = 0;
  const errors: string[] = [];
  for (let i = 0; i < GREENHOUSE.length; i += BATCH_SIZE) {
    const batch = GREENHOUSE.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(batch.map(async (slug) => {
      const data = await fetchJsonWithLogging<{ jobs?: any[] }>(
        `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`,
        "greenhouse", slug, errors,
      );
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
      const postings = (await fetchJsonWithLogging<any[]>(
        `https://api.lever.co/v0/postings/${slug}?mode=json`,
        "lever", slug, errors,
      )) ?? [];
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
      const data = await fetchJsonWithLogging<{ jobs?: any[] }>(
        `https://api.ashbyhq.com/posting-api/job-board/${slug}`,
        "ashby", slug, errors,
      );
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

// ── Workday CXS — Bug 3: parallel tenant batches ────────────────────────

export function buildWorkdayUrl(tenant: string, shard: string, site: string): string {
  return `https://${tenant}.${shard}.myworkdayjobs.com/wday/cxs/${tenant}/${site}/jobs`;
}
export function workdayApplyUrl(tenant: string, shard: string, site: string, externalPath: string): string {
  return `https://${tenant}.${shard}.myworkdayjobs.com/${site}${externalPath}`;
}

async function ingestSingleWorkdayTenant(t: { tenant: string; shard: string; site: string }, supabase: any, errors: string[]): Promise<number> {
  const url = buildWorkdayUrl(t.tenant, t.shard, t.site);
  let offset = 0, upserted = 0;
  for (let page = 0; page < WD_MAX_PAGES_PER_TENANT; page++) {
    const data = await fetchJsonWithLogging<any>(url, "workday", t.tenant, errors, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appliedFacets: {}, limit: WD_PAGE_SIZE, offset, searchText: "" }),
    });
    const postings: any[] = data?.jobPostings ?? [];
    if (postings.length === 0) break;
    const rows = postings.map((p: any) => {
      const externalPath = p.externalPath ?? "";
      if (!externalPath) return null;
      return {
        source: "workday",
        external_id: `${t.tenant}:${externalPath}`,
        company: t.tenant,
        title: (p.title || "").trim(),
        location: p.locationsText ?? null,
        description: "",
        apply_url: workdayApplyUrl(t.tenant, t.shard, t.site, externalPath),
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
      if (error) { errors.push(`workday:${t.tenant}:${error.message}`.slice(0, 200)); break; }
      upserted += rows.length;
    }
    if (postings.length < WD_PAGE_SIZE) break;
    offset += WD_PAGE_SIZE;
    await sleep(WD_PAGE_DELAY_MS);
  }
  return upserted;
}

export function chunkWorkdayTenants<T>(tenants: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < tenants.length; i += size) out.push(tenants.slice(i, i + size));
  return out;
}

async function ingestWorkday(supabase: any): Promise<{ upserted: number; errors: string[] }> {
  let upserted = 0;
  const errors: string[] = [];
  for (const batch of chunkWorkdayTenants(WORKDAY, WD_TENANT_BATCH)) {
    const results = await Promise.allSettled(batch.map(t => ingestSingleWorkdayTenant(t, supabase, errors)));
    for (const r of results) {
      if (r.status === "fulfilled") upserted += r.value;
      else errors.push(String(r.reason).slice(0, 200));
    }
  }
  return { upserted, errors };
}

// ── SmartRecruiters — Bug 1: ?embed=jobAd ───────────────────────────────

export function buildSmartRecruitersUrl(slug: string, offset: number, limit = SR_PAGE_SIZE): string {
  return `https://api.smartrecruiters.com/v1/companies/${slug}/postings?limit=${limit}&offset=${offset}&embed=jobAd`;
}

export function srLocationString(loc: any): string | null {
  if (!loc?.city) return null;
  return `${loc.city}${loc.country ? ", " + loc.country : ""}`;
}

async function ingestSmartRecruiters(supabase: any): Promise<{ upserted: number; errors: string[] }> {
  let upserted = 0;
  const errors: string[] = [];
  for (const slug of SMARTRECRUITERS) {
    let offset = 0;
    for (let page = 0; page < SR_MAX_PAGES; page++) {
      const data = await fetchJsonWithLogging<any>(
        buildSmartRecruitersUrl(slug, offset),
        "smartrecruiters", slug, errors,
      );
      const postings: any[] = data?.content ?? [];
      if (postings.length === 0) break;
      const rows = postings.map((p: any) => {
        // Bug 1 — with ?embed=jobAd, applyUrl is populated. Fallback
        // constructs the standard jobs.smartrecruiters.com URL.
        const applyUrl = p.applyUrl ?? p.postingUrl
                       ?? `https://jobs.smartrecruiters.com/${slug}/${p.id}`;
        if (!p.id) return null;
        return {
          source: "smartrecruiters",
          external_id: `${slug}:${p.id}`,
          company: slug,
          title: (p.name || "").trim(),
          location: srLocationString(p.location),
          description: stripHtml(p.jobAd?.sections?.jobDescription?.text ?? ""),
          apply_url: applyUrl,
          posted_at: p.releasedDate ?? p.createdOn ?? null,
          remote: !!p.location?.remote,
          raw: p,
          last_seen_at: new Date().toISOString(),
          is_active: true,
          enrichment_status: "pending",
        };
      }).filter((r: any) => r !== null);
      if (rows.length > 0) {
        const { error } = await supabase.from("ats_jobs").upsert(rows, { onConflict: "source,apply_url" });
        if (error) { errors.push(`smartrecruiters:${slug}:${error.message}`.slice(0, 200)); break; }
        upserted += rows.length;
      }
      if (postings.length < SR_PAGE_SIZE) break;
      offset += SR_PAGE_SIZE;
      await sleep(WD_PAGE_DELAY_MS);
    }
  }
  return { upserted, errors };
}

// ── HTTP entrypoint — Bug 4: rolled-up inserted + errors ────────────────

serve(async (_req) => {
  const startTime = Date.now();
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const runStartedAt = new Date().toISOString();

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

    // Bug 4 — rolled-up counts at top level so the cron caller reads
    // result.inserted + result.errors instead of digging into per-source.
    const totalUpserted = gh.upserted + lever.upserted + ashby.upserted + workday.upserted + smartrecruiters.upserted;
    const totalErrors   = gh.errors.length + lever.errors.length + ashby.errors.length + workday.errors.length + smartrecruiters.errors.length;

    const combinedErrors = [
      ...gh.errors.map(e             => ({ source: "greenhouse",      error: e })),
      ...lever.errors.map(e          => ({ source: "lever",           error: e })),
      ...ashby.errors.map(e          => ({ source: "ashby",           error: e })),
      ...workday.errors.map(e        => ({ source: "workday",         error: e })),
      ...smartrecruiters.errors.map(e=> ({ source: "smartrecruiters", error: e })),
    ];

    const body = {
      ok:       true,
      success:  true,
      runStartedAt,
      finishedAt: new Date().toISOString(),
      duration_ms: Date.now() - startTime,
      // Bug 4 — rolled-up counts for cron logging
      inserted: totalUpserted,
      updated:  0,
      errors:   totalErrors,
      deactivated,
      // Per-source detail
      greenhouse:      { upserted: gh.upserted,              errors: gh.errors.length },
      lever:           { upserted: lever.upserted,           errors: lever.errors.length },
      ashby:           { upserted: ashby.upserted,           errors: ashby.errors.length },
      workday:         { upserted: workday.upserted,         errors: workday.errors.length },
      smartrecruiters: { upserted: smartrecruiters.upserted, errors: smartrecruiters.errors.length },
      // Aggregate for the older cron path
      sources: {
        greenhouse: gh.upserted, lever: lever.upserted, ashby: ashby.upserted,
        workday: workday.upserted, smartrecruiters: smartrecruiters.upserted,
      },
      errorDetails: combinedErrors,
      ingested: totalUpserted,
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
