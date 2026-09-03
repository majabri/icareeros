/**
 * feat/jobs-ats-aggregation Phase 2 — ingest-ats-direct edge function.
 * fix/jobs-ingest-adapter-bugs (v4) — Platform's PR #363 deploy report:
 *   Bug 1  SmartRecruiters ?embed=jobAd so applyUrl is populated
 *   Bug 2A fetchJsonWithLogging surfaces non-200s per source per slug
 *   Bug 2B 17 dead slugs pruned (verified via curl at PR time)
 *   Bug 3  Workday tenants parallelized batch=4 + MAX_PAGES_PER_TENANT=15
 *   Bug 4  Rolled-up `inserted` + `errors` at top level of response
 *
 * fix/ingest-ats-wall-clock-timeout (v5) — the whole-cycle fan-out never
 * finished. `Promise.allSettled` over all five sources exceeded the ~150s
 * edge wall clock on EVERY invocation (39 `invocation.start` / 0
 * `invocation.complete` over three days in production), so the gateway
 * returned 504 and everything after the fan-out — the 48h deactivation
 * sweep, the priority-lane enrich kick, and the Bug-4 rolled-up counts —
 * never ran.
 *
 * The fix is the chained-continuation pattern `enrich-jobs` already uses
 * (see `selfInvokeIfPending()` + `MAX_CHAIN_DEPTH` in ../enrich-jobs):
 *   - Each invocation runs a DEADLINE-BOUNDED slice (SLICE_BUDGET_MS) of
 *     the work, never approaching the wall clock.
 *   - A per-source cursor (`IngestCursor`) records exactly where the slice
 *     stopped; running totals ride along in the same request body.
 *   - When work remains, the function fire-and-forget self-invokes with
 *     `chainDepth + 1`, capped by MAX_CHAIN_DEPTH.
 *   - The terminal link does the post-fan-out work: deactivation sweep
 *     (only on a fully-completed cycle), enrich chain-kick, and an
 *     `ingest.cycle.complete` row in `infrastructure_events` carrying the
 *     cycle-wide rolled-up counts.
 *
 * Deploy: supabase functions deploy ingest-ats-direct --project-ref kuneabeiwcxavvyyfjkx --no-verify-jwt
 *   This function is custom-header/internal-auth only and MUST stay
 *   verify_jwt=false — see runbook gotcha #8 in docs/OBSERVABILITY_HEARTBEAT.md.
 * Trigger: POST https://{project}.supabase.co/functions/v1/ingest-ats-direct
 */
// deno-lint-ignore-file no-explicit-any
// @ts-nocheck

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { invocationStart, invocationComplete, inferInvoker } from "../_shared/heartbeat.ts";
import {
  DONE, SLICE_BUDGET_MS, MAX_CHAIN_DEPTH,
  normalizeCursor, normalizeTotals, normalizeChainDepth,
  isCursorComplete, remainingUnits, shouldChain, accumulate,
  totalUpserted, totalErrors,
  type IngestCursor, type IngestTotals, type SourceSizes,
} from "./chainState.ts";

const BATCH_SIZE = 20;                // Greenhouse/Lever/Ashby fetch batch
const FETCH_TIMEOUT_MS = 10_000;
const WD_PAGE_DELAY_MS = 100;         // Bug 3 — was 200
const WD_TENANT_BATCH  = 4;           // Bug 3 — parallel tenants per batch
const WD_MAX_PAGES_PER_TENANT = 15;   // Bug 3 — cap per tenant
const WD_PAGE_SIZE = 20;
const SR_PAGE_SIZE = 100;
const SR_MAX_PAGES = 30;

// ── v5 chained-continuation budget ──────────────────────────────────────
//
// SLICE_BUDGET_MS (see ./chainState.ts) is a SOFT deadline: it is only
// checked BEFORE starting a work unit, never mid-unit, so worst-case
// overshoot is a single unit. The slowest unit is a paginating one —
// WD_PAGES_PER_SLICE / SR_PAGES_PER_SLICE pages, each capped at
// FETCH_TIMEOUT_MS, i.e. 3 x 10s ~= 30s. 60s + 30s sits well inside the
// ~150s edge wall clock that the unsliced v4 hit on every run.
const WD_PAGES_PER_SLICE = 3;    // Workday pages per tenant per slice
const SR_PAGES_PER_SLICE = 3;    // SmartRecruiters pages per slug per slice
const STALE_CUTOFF_MS    = 48 * 60 * 60 * 1000;

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

// ── v5 cursor + totals ──────────────────────────────────────────────────
// The chain-state helpers live in ./chainState.ts (no Deno-only imports,
// so they are unit-testable from vitest). SIZES pins them to the company
// lists configured above.

const SIZES: SourceSizes = {
  greenhouse:      GREENHOUSE.length,
  lever:           LEVER.length,
  ashby:           ASHBY.length,
  workday:         WORKDAY.length,
  smartrecruiters: SMARTRECRUITERS.length,
};

// ── Greenhouse ──────────────────────────────────────────────────────────
// List endpoint fields used here: id, title, location.name, absolute_url,
// updated_at, raw payload. Description stays detail-endpoint-owned so
// conflict updates never send `description` for this source.
//
// v5: slice-bounded. Starts at `from`, returns the next unprocessed index
// so the following chain link resumes exactly where this one stopped.

async function ingestGreenhouse(supabase: any, from: number, deadline: number): Promise<{ upserted: number; errors: string[]; next: number }> {
  let upserted = 0;
  let i = from;
  const errors: string[] = [];
  for (; i < GREENHOUSE.length && Date.now() < deadline; i += BATCH_SIZE) {
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
  return { upserted, errors, next: Math.min(i, GREENHOUSE.length) };
}

// ── Lever ───────────────────────────────────────────────────────────────
// List endpoint fields used here: id, text, categories.location,
// description, hostedUrl, categories.commitment, createdAt. Lever's list
// payload already carries the job description, so ingest writes it inline.

async function ingestLever(supabase: any, from: number, deadline: number): Promise<{ upserted: number; errors: string[]; next: number }> {
  let upserted = 0;
  let i = from;
  const errors: string[] = [];
  for (; i < LEVER.length && Date.now() < deadline; i += BATCH_SIZE) {
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
  return { upserted, errors, next: Math.min(i, LEVER.length) };
}

// ── Ashby ───────────────────────────────────────────────────────────────
// List endpoint fields used here: id, title, locationName,
// descriptionPlain, jobUrl, publishedDate, isRemote. Ashby's list payload
// already carries the job description, so ingest writes it inline.

async function ingestAshby(supabase: any, from: number, deadline: number): Promise<{ upserted: number; errors: string[]; next: number }> {
  let upserted = 0;
  let i = from;
  const errors: string[] = [];
  for (; i < ASHBY.length && Date.now() < deadline; i += BATCH_SIZE) {
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
  return { upserted, errors, next: Math.min(i, ASHBY.length) };
}

// ── Workday CXS — Bug 3: parallel tenant batches ────────────────────────
// List endpoint fields used here: externalPath, title, locationsText, raw
// payload. Description is fetched later from the detail page, so conflict
// updates must omit `description` for this source.

export function buildWorkdayUrl(tenant: string, shard: string, site: string): string {
  return `https://${tenant}.${shard}.myworkdayjobs.com/wday/cxs/${tenant}/${site}/jobs`;
}
export function workdayApplyUrl(tenant: string, shard: string, site: string, externalPath: string): string {
  return `https://${tenant}.${shard}.myworkdayjobs.com/${site}${externalPath}`;
}

/**
 * v5 — one tenant, at most WD_PAGES_PER_SLICE pages, resuming from
 * `startOffset`. Returns the next offset to fetch, or DONE when the tenant
 * is exhausted (empty page, short page, page cap, or upsert error).
 */
async function ingestSingleWorkdayTenant(t: { tenant: string; shard: string; site: string }, supabase: any, errors: string[], startOffset: number): Promise<{ upserted: number; nextOffset: number }> {
  const url = buildWorkdayUrl(t.tenant, t.shard, t.site);
  let offset = startOffset, upserted = 0;
  for (let page = 0; page < WD_PAGES_PER_SLICE; page++) {
    if (offset >= WD_MAX_PAGES_PER_TENANT * WD_PAGE_SIZE) return { upserted, nextOffset: DONE };
    const data = await fetchJsonWithLogging<any>(url, "workday", t.tenant, errors, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appliedFacets: {}, limit: WD_PAGE_SIZE, offset, searchText: "" }),
    });
    const postings: any[] = data?.jobPostings ?? [];
    if (postings.length === 0) return { upserted, nextOffset: DONE };
    const rows = postings.map((p: any) => {
      const externalPath = p.externalPath ?? "";
      if (!externalPath) return null;
      return {
        source: "workday",
        external_id: `${t.tenant}:${externalPath}`,
        company: t.tenant,
        title: (p.title || "").trim(),
        location: p.locationsText ?? null,
        apply_url: workdayApplyUrl(t.tenant, t.shard, t.site, externalPath),
        posted_at: null,
        remote: /remote/i.test(p.locationsText ?? "") || /remote/i.test(p.title ?? ""),
        raw: p,
        last_seen_at: new Date().toISOString(),
        is_active: true,
      };
    }).filter((r: any) => r !== null);
    if (rows.length > 0) {
      const { error } = await supabase.from("ats_jobs").upsert(rows, { onConflict: "source,apply_url" });
      if (error) { errors.push(`workday:${t.tenant}:${error.message}`.slice(0, 200)); return { upserted, nextOffset: DONE }; }
      upserted += rows.length;
    }
    if (postings.length < WD_PAGE_SIZE) return { upserted, nextOffset: DONE };
    offset += WD_PAGE_SIZE;
    await sleep(WD_PAGE_DELAY_MS);
  }
  return { upserted, nextOffset: offset >= WD_MAX_PAGES_PER_TENANT * WD_PAGE_SIZE ? DONE : offset };
}

/**
 * v5 — mutates `cursor` (one entry per WORKDAY tenant) in place. Keeps
 * Bug 3's WD_TENANT_BATCH parallelism, but the batch is drawn from the
 * tenants that are still pending rather than from a fixed chunking, so a
 * resumed chain link doesn't re-walk finished tenants.
 */
async function ingestWorkday(supabase: any, cursor: number[], deadline: number): Promise<{ upserted: number; errors: string[] }> {
  let upserted = 0;
  const errors: string[] = [];
  while (Date.now() < deadline) {
    const pending: number[] = [];
    for (let i = 0; i < WORKDAY.length && pending.length < WD_TENANT_BATCH; i++) {
      if (cursor[i] !== DONE) pending.push(i);
    }
    if (pending.length === 0) break;
    const results = await Promise.allSettled(pending.map(i => ingestSingleWorkdayTenant(WORKDAY[i], supabase, errors, cursor[i])));
    results.forEach((r, k) => {
      const i = pending[k];
      if (r.status === "fulfilled") { upserted += r.value.upserted; cursor[i] = r.value.nextOffset; }
      else { errors.push(String(r.reason).slice(0, 200)); cursor[i] = DONE; }
    });
  }
  return { upserted, errors };
}

// ── SmartRecruiters — Bug 1: ?embed=jobAd ───────────────────────────────
// List endpoint fields used here: id, name, location, applyUrl/postingUrl,
// releasedDate/createdOn, raw payload, plus embedded
// jobAd.sections.jobDescription.text via `?embed=jobAd`.

export function buildSmartRecruitersUrl(slug: string, offset: number, limit = SR_PAGE_SIZE): string {
  return `https://api.smartrecruiters.com/v1/companies/${slug}/postings?limit=${limit}&offset=${offset}&embed=jobAd`;
}

export function srLocationString(loc: any): string | null {
  if (!loc?.city) return null;
  return `${loc.city}${loc.country ? ", " + loc.country : ""}`;
}

/**
 * v5 — mutates `cursor` (one entry per SMARTRECRUITERS slug) in place.
 * Each slug advances at most SR_PAGES_PER_SLICE pages per slice, so a
 * deep-paginating company can no longer monopolise the wall clock.
 */
async function ingestSmartRecruiters(supabase: any, cursor: number[], deadline: number): Promise<{ upserted: number; errors: string[] }> {
  let upserted = 0;
  const errors: string[] = [];
  for (let s = 0; s < SMARTRECRUITERS.length; s++) {
    if (cursor[s] === DONE || Date.now() >= deadline) continue;
    const slug = SMARTRECRUITERS[s];
    let offset = cursor[s];
    for (let page = 0; page < SR_PAGES_PER_SLICE; page++) {
      if (offset >= SR_MAX_PAGES * SR_PAGE_SIZE) { offset = DONE; break; }
      const data = await fetchJsonWithLogging<any>(
        buildSmartRecruitersUrl(slug, offset),
        "smartrecruiters", slug, errors,
      );
      const postings: any[] = data?.content ?? [];
      if (postings.length === 0) { offset = DONE; break; }
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
        };
      }).filter((r: any) => r !== null);
      if (rows.length > 0) {
        const { error } = await supabase.from("ats_jobs").upsert(rows, { onConflict: "source,apply_url" });
        if (error) { errors.push(`smartrecruiters:${slug}:${error.message}`.slice(0, 200)); offset = DONE; break; }
        upserted += rows.length;
      }
      if (postings.length < SR_PAGE_SIZE) { offset = DONE; break; }
      offset += SR_PAGE_SIZE;
      await sleep(WD_PAGE_DELAY_MS);
    }
    cursor[s] = offset;
  }
  return { upserted, errors };
}

// ── v5 slice runner ─────────────────────────────────────────────────────

/**
 * Runs as much of the remaining cycle as fits inside `deadline`, in a
 * fixed source order. Every loop guards on the deadline BEFORE starting a
 * unit, so this returns promptly with a partial cursor instead of running
 * into the wall clock. `cursor` and `totals` are mutated in place.
 */
async function runSlice(supabase: any, cursor: IngestCursor, totals: IngestTotals, deadline: number): Promise<void> {
  const gh = await ingestGreenhouse(supabase, cursor.greenhouse, deadline);
  cursor.greenhouse = gh.next;
  accumulate(totals, "greenhouse", gh.upserted, gh.errors);

  const lever = await ingestLever(supabase, cursor.lever, deadline);
  cursor.lever = lever.next;
  accumulate(totals, "lever", lever.upserted, lever.errors);

  const ashby = await ingestAshby(supabase, cursor.ashby, deadline);
  cursor.ashby = ashby.next;
  accumulate(totals, "ashby", ashby.upserted, ashby.errors);

  const workday = await ingestWorkday(supabase, cursor.workday, deadline);
  accumulate(totals, "workday", workday.upserted, workday.errors);

  const sr = await ingestSmartRecruiters(supabase, cursor.smartrecruiters, deadline);
  accumulate(totals, "smartrecruiters", sr.upserted, sr.errors);
}

// ── v5 terminal-link work — everything v4 never reached ─────────────────

/**
 * 48h stale-job deactivation sweep. Only ever called on a COMPLETE cycle:
 * on a depth-capped (truncated) cycle some sources were never visited, and
 * flipping their rows inactive would punish the truncation rather than a
 * genuinely dead posting.
 */
async function deactivateStaleJobs(supabase: any): Promise<number> {
  try {
    const cutoff = new Date(Date.now() - STALE_CUTOFF_MS).toISOString();
    const { count } = await supabase
      .from("ats_jobs")
      .update({ is_active: false })
      .lt("last_seen_at", cutoff)
      .eq("is_active", true)
      .select("id", { count: "exact", head: true });
    return count ?? 0;
  } catch (_e) { return 0; /* best-effort */ }
}

/**
 * fix/jobs-enrichment-throughput Fix 2 — kick a priority-lane enrich pass
 * targeting exec / director / VP / security titles so the newly ingested
 * rows get classified fast. Generalizable: the filter is a parameter, not
 * hardcoded here — swap the string for any future high-value pattern.
 *
 * v5 — moved to the terminal chain link; under v4 this line sat after the
 * fan-out await and therefore never executed.
 */
function kickEnrichJobs(): void {
  try {
    void fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/enrich-jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chainDepth: 0,
        priorityTitleFilter: "security|ciso|biso|director|chief|vp|head of",
      }),
    }).catch(() => {});
  } catch { /* silent — never fail ingest on enrich chain */ }
}

/**
 * Fire-and-forget self-invoke carrying the cursor + running totals — the
 * same pattern as enrich-jobs' `selfInvokeIfPending()`, which production
 * heartbeats confirm works (130 of 166 enrich-jobs starts over three days
 * were `invoked_by: "chain"`). Capped by MAX_CHAIN_DEPTH so a cursor bug
 * can't spin an unbounded chain.
 *
 * The caller's `x-ingest-cron-secret` is forwarded so every link is
 * indistinguishable from the original cron call to any future auth gate.
 */
function selfInvokeIfPending(state: {
  chainDepth: number; cursor: IngestCursor; totals: IngestTotals;
  runStartedAt: string; cycleId: string; cronSecret: string | null;
}): void {
  if (state.chainDepth >= MAX_CHAIN_DEPTH) return;
  try {
    void fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/ingest-ats-direct`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(state.cronSecret ? { "x-ingest-cron-secret": state.cronSecret } : {}),
      },
      body: JSON.stringify({
        chainDepth:   state.chainDepth + 1,
        cursor:       state.cursor,
        totals:       state.totals,
        runStartedAt: state.runStartedAt,
        cycleId:      state.cycleId,
      }),
    }).catch(() => {});
  } catch { /* silent — never let self-invoke failure surface */ }
}

/**
 * v5 — the Bug-4 rolled-up counts, relocated. They used to be computed
 * after the fan-out await (i.e. never) and returned only in the HTTP body,
 * which the 504 swallowed. Now the terminal link writes them to
 * `infrastructure_events` so the cycle result is durable and queryable
 * alongside the invocation heartbeats.
 */
async function logCycleComplete(supabase: any, payload: Record<string, unknown>): Promise<void> {
  try {
    await supabase.from("infrastructure_events").insert({
      source:     "edge-fn.ingest-ats-direct",
      event_type: "ingest.cycle.complete",
      severity:   payload.truncated ? "warning" : "info",
      payload,
    });
  } catch (e) {
    console.error("[ingest-ats-direct] cycle event insert failed:", (e as Error)?.message);
  }
}

// ── HTTP entrypoint — Bug 4: rolled-up inserted + errors ────────────────

serve(async (req) => {
  const startTime = Date.now();
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // v5 — chain state arrives in the request body. A first tick (cron) has
  // no body, or a body with no cursor, and starts a fresh cycle.
  const reqBody: any = await req.json().catch(() => ({}));
  const chainDepth = normalizeChainDepth(reqBody?.chainDepth);
  const cursor = normalizeCursor(reqBody?.cursor, SIZES);
  const totals = normalizeTotals(reqBody?.totals);
  const runStartedAt = typeof reqBody?.runStartedAt === "string" ? reqBody.runStartedAt : new Date().toISOString();
  const cycleId = typeof reqBody?.cycleId === "string" ? reqBody.cycleId.slice(0, 64) : crypto.randomUUID();
  const cronSecret = req.headers.get("x-ingest-cron-secret");

  // ── HEARTBEAT (invocation.start) ──
  const __hbStart = Date.now();
  const __hbInvoker: "pg_cron"|"vercel_cron"|"manual"|"chain"|"unknown" = inferInvoker(req, reqBody);
  const __hbId = await invocationStart({
    supabase,
    functionSlug: "ingest-ats-direct",
    invokedBy: __hbInvoker,
    chainDepth,
    extra: { cycle_id: cycleId },
  });
  let __hbResponse: Response;
  try {
  try {
    // v5 — bounded slice. Everything below this await is now reachable,
    // which is the whole point of the fix.
    await runSlice(supabase, cursor, totals, startTime + SLICE_BUDGET_MS);

    const cycleComplete = isCursorComplete(cursor, SIZES);
    const terminal      = !shouldChain(chainDepth, cursor, SIZES);

    // Bug 4 — rolled-up counts, now cycle-wide rather than per-invocation.
    const inserted = totalUpserted(totals);
    const errorCount = totalErrors(totals);

    let deactivated = 0;
    if (terminal) {
      if (cycleComplete) deactivated = await deactivateStaleJobs(supabase);
      kickEnrichJobs();
      await logCycleComplete(supabase, {
        cycle_id:      cycleId,
        run_started_at: runStartedAt,
        finished_at:   new Date().toISOString(),
        chain_links:   chainDepth + 1,
        truncated:     !cycleComplete,
        inserted,
        errors:        errorCount,
        deactivated,
        sources: {
          greenhouse: totals.greenhouse.upserted, lever: totals.lever.upserted,
          ashby: totals.ashby.upserted, workday: totals.workday.upserted,
          smartrecruiters: totals.smartrecruiters.upserted,
        },
        error_samples: totals.errorSamples,
      });
    } else {
      selfInvokeIfPending({ chainDepth, cursor, totals, runStartedAt, cycleId, cronSecret });
    }

    const body = {
      ok:       true,
      success:  true,
      cycleId,
      runStartedAt,
      finishedAt: new Date().toISOString(),
      duration_ms: Date.now() - startTime,
      // v5 chain state — the caller sees where the cycle got to.
      chainDepth,
      chained:  !terminal,
      cycleComplete,
      truncated: terminal && !cycleComplete,
      remaining: remainingUnits(cursor, SIZES),
      // Bug 4 — rolled-up counts for cron logging (cycle-to-date).
      inserted,
      updated:  0,
      errors:   errorCount,
      deactivated,
      // Per-source detail (cycle-to-date)
      greenhouse:      { upserted: totals.greenhouse.upserted,      errors: totals.greenhouse.errors },
      lever:           { upserted: totals.lever.upserted,           errors: totals.lever.errors },
      ashby:           { upserted: totals.ashby.upserted,           errors: totals.ashby.errors },
      workday:         { upserted: totals.workday.upserted,         errors: totals.workday.errors },
      smartrecruiters: { upserted: totals.smartrecruiters.upserted, errors: totals.smartrecruiters.errors },
      // Aggregate for the older cron path
      sources: {
        greenhouse: totals.greenhouse.upserted, lever: totals.lever.upserted, ashby: totals.ashby.upserted,
        workday: totals.workday.upserted, smartrecruiters: totals.smartrecruiters.upserted,
      },
      errorDetails: totals.errorSamples,
      ingested: inserted,
    };
    __hbResponse = new Response(JSON.stringify(body, null, 2), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    __hbResponse = new Response(JSON.stringify({ ok: false, error: (err as Error).message, chainDepth, cycleId }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
  const __hbOutcome: "ok"|"error" = __hbResponse.status >= 200 && __hbResponse.status < 400 ? "ok" : "error";
  await invocationComplete({ supabase, functionSlug: "ingest-ats-direct", invocationId: __hbId, startedAt: __hbStart, outcome: __hbOutcome, error: __hbOutcome === "error" ? ("HTTP " + __hbResponse.status) : undefined, metrics: { http_status: __hbResponse.status, chain_depth: chainDepth, cycle_id: cycleId } });
  return __hbResponse;
  } catch (__hbE) {
    await invocationComplete({ supabase, functionSlug: "ingest-ats-direct", invocationId: __hbId, startedAt: __hbStart, outcome: "error", error: (__hbE as Error)?.message ?? String(__hbE) });
    throw __hbE;
  }
});
