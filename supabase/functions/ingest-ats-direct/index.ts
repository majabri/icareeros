/**
 * feat/jobs-ats-aggregation Phase 2 — ingest-ats-direct edge function.
 * fix/jobs-ingest-adapter-bugs (v4) — Platform's PR #363 deploy report:
 *   Bug 1  SmartRecruiters ?embed=jobAd so applyUrl is populated
 *   Bug 2A fetchJsonWithLogging surfaces non-200s per source per slug
 *   Bug 2B 17 dead slugs pruned (verified via curl at PR time)
 *   Bug 3  Workday tenants parallelized batch=4 + MAX_PAGES_PER_TENANT=15
 *   Bug 4  Rolled-up `inserted` + `errors` at top level of response
 *
 * #425 (P0) — this function fanned all 5 sources out via a single
 * top-level `Promise.allSettled` and NEVER completed a single invocation
 * in prod: every run hit the 150s edge-function wall-clock limit and was
 * killed (504), so the 48h stale-job sweep, the enrich-jobs chain-kick,
 * and the rolled-up counts after the fan-out never ran. Fix adopts the
 * bounded-slice + self-chain pattern `enrich-jobs` already uses: each
 * invocation processes sources in order, in bounded slices, until an
 * internal time budget is exhausted, persists progress in
 * `public.ingest_ats_cursor`, and self-chains (capped by MAX_CHAIN_DEPTH).
 * The stale-job sweep + enrich-jobs kick only run once a full cycle
 * (all 5 sources) completes — see `serve()` below.
 *
 * Deploy: supabase functions deploy ingest-ats-direct --project-ref kuneabeiwcxavvyyfjkx
 * IMPORTANT — deploy with --no-verify-jwt (or verify_jwt=false in the
 * dashboard) and re-check the function's metadata after deploy; the
 * mgmt-API deploy tool has silently reset this to true before, which
 * caused an 8-day outage on 2026-08-05 (cron callers can't send a
 * Supabase JWT).
 * Trigger: POST https://{project}.supabase.co/functions/v1/ingest-ats-direct
 */
// deno-lint-ignore-file no-explicit-any
// @ts-nocheck

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { invocationStart, invocationComplete, inferInvoker } from "../_shared/heartbeat.ts";

const BATCH_SIZE = 20;                // Greenhouse/Lever/Ashby fetch batch
const FETCH_TIMEOUT_MS = 10_000;
const WD_PAGE_DELAY_MS = 100;         // Bug 3 — was 200
const WD_TENANT_BATCH  = 4;           // Bug 3 — parallel tenants per batch
const WD_MAX_PAGES_PER_TENANT = 15;   // Bug 3 — cap per tenant
const WD_PAGE_SIZE = 20;
const SR_PAGE_SIZE = 100;
const SR_MAX_PAGES = 30;

// #425 — chained continuation. Each invocation gets a wall-clock budget
// well under the 150s edge-function limit (leaves headroom for cold
// start, DB writes, and response serialization); once exhausted it
// persists a cursor and self-chains rather than pressing on and risking
// a 504. MAX_CHAIN_DEPTH is a hard stop mirroring enrich-jobs' pattern —
// if a full cycle (5 sources) can't complete in 60 chained invocations
// something is fundamentally wrong (e.g. every request timing out), and
// we let the cursor go stale + reset rather than chain forever.
const INGEST_BUDGET_MS = 100_000;
const MAX_CHAIN_DEPTH  = 60;
const CURSOR_STALE_MS  = 10 * 60 * 1000; // 10 min — presumed-dead chain, safe to restart

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

// #425 — chunked-source contract. Every per-source ingest function now
// takes a startIndex (resume point) + deadline (Date.now() ms) and
// returns nextIndex/done so the caller can persist a cursor and self-chain
// instead of processing the whole company/tenant list in one invocation.
interface ChunkResult { upserted: number; errors: string[]; nextIndex: number; done: boolean }

// ── Greenhouse ──────────────────────────────────────────────────────────
// List endpoint fields used here: id, title, location.name, absolute_url,
// updated_at, raw payload. Description stays detail-endpoint-owned so
// conflict updates never send `description` for this source.

async function ingestGreenhouse(supabase: any, startIndex: number, deadline: number): Promise<ChunkResult> {
  let upserted = 0;
  const errors: string[] = [];
  let i = startIndex;
  for (; i < GREENHOUSE.length; i += BATCH_SIZE) {
    if (Date.now() >= deadline) return { upserted, errors, nextIndex: i, done: false };
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
  return { upserted, errors, nextIndex: GREENHOUSE.length, done: true };
}

// ── Lever ───────────────────────────────────────────────────────────────
// List endpoint fields used here: id, text, categories.location,
// description, hostedUrl, categories.commitment, createdAt. Lever's list
// payload already carries the job description, so ingest writes it inline.

async function ingestLever(supabase: any, startIndex: number, deadline: number): Promise<ChunkResult> {
  let upserted = 0;
  const errors: string[] = [];
  let i = startIndex;
  for (; i < LEVER.length; i += BATCH_SIZE) {
    if (Date.now() >= deadline) return { upserted, errors, nextIndex: i, done: false };
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
  return { upserted, errors, nextIndex: LEVER.length, done: true };
}

// ── Ashby ───────────────────────────────────────────────────────────────
// List endpoint fields used here: id, title, locationName,
// descriptionPlain, jobUrl, publishedDate, isRemote. Ashby's list payload
// already carries the job description, so ingest writes it inline.

async function ingestAshby(supabase: any, startIndex: number, deadline: number): Promise<ChunkResult> {
  let upserted = 0;
  const errors: string[] = [];
  let i = startIndex;
  for (; i < ASHBY.length; i += BATCH_SIZE) {
    if (Date.now() >= deadline) return { upserted, errors, nextIndex: i, done: false };
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
  return { upserted, errors, nextIndex: ASHBY.length, done: true };
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

async function ingestSingleWorkdayTenant(t: { tenant: string; shard: string; site: string }, supabase: any, errors: string[], deadline: number): Promise<number> {
  const url = buildWorkdayUrl(t.tenant, t.shard, t.site);
  let offset = 0, upserted = 0;
  for (let page = 0; page < WD_MAX_PAGES_PER_TENANT; page++) {
    if (Date.now() >= deadline) break; // #425 — bail out of a single slow tenant rather than blow the invocation budget
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

async function ingestWorkday(supabase: any, startIndex: number, deadline: number): Promise<ChunkResult> {
  let upserted = 0;
  const errors: string[] = [];
  let i = startIndex;
  for (; i < WORKDAY.length; i += WD_TENANT_BATCH) {
    if (Date.now() >= deadline) return { upserted, errors, nextIndex: i, done: false };
    const batch = WORKDAY.slice(i, i + WD_TENANT_BATCH);
    const results = await Promise.allSettled(batch.map(t => ingestSingleWorkdayTenant(t, supabase, errors, deadline)));
    for (const r of results) {
      if (r.status === "fulfilled") upserted += r.value;
      else errors.push(String(r.reason).slice(0, 200));
    }
  }
  return { upserted, errors, nextIndex: WORKDAY.length, done: true };
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

async function ingestSmartRecruitersSlug(slug: string, supabase: any, errors: string[], deadline: number): Promise<number> {
  let offset = 0, upserted = 0;
  for (let page = 0; page < SR_MAX_PAGES; page++) {
    if (Date.now() >= deadline) break; // #425 — bail out of a single slow company rather than blow the invocation budget
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
  return upserted;
}

async function ingestSmartRecruiters(supabase: any, startIndex: number, deadline: number): Promise<ChunkResult> {
  let upserted = 0;
  const errors: string[] = [];
  let i = startIndex;
  for (; i < SMARTRECRUITERS.length; i++) {
    if (Date.now() >= deadline) return { upserted, errors, nextIndex: i, done: false };
    const slug = SMARTRECRUITERS[i];
    upserted += await ingestSmartRecruitersSlug(slug, supabase, errors, deadline);
  }
  return { upserted, errors, nextIndex: SMARTRECRUITERS.length, done: true };
}

// ── Cursor persistence — #425 chained continuation state ────────────────

interface SourceDetail { upserted: number; errors: string[] }
interface CursorState {
  sourceIndex:   number;
  itemIndex:     number;
  chainDepth:    number;
  detail:        Record<string, SourceDetail>;
  runStartedAt:  string | null;
}

const SOURCE_NAMES = ["greenhouse", "lever", "ashby", "workday", "smartrecruiters"] as const;

function emptyDetail(): Record<string, SourceDetail> {
  const out: Record<string, SourceDetail> = {};
  for (const name of SOURCE_NAMES) out[name] = { upserted: 0, errors: [] };
  return out;
}

function freshCursor(): CursorState {
  return { sourceIndex: 0, itemIndex: 0, chainDepth: 0, detail: emptyDetail(), runStartedAt: null };
}

// A cursor is resumable only if a cycle is genuinely in progress AND was
// updated recently. A stale (presumed-dead, e.g. a self-invoke fetch that
// never landed) or already-complete cursor is treated as idle — the next
// invocation starts a brand new cycle rather than getting stuck forever.
async function loadCursor(supabase: any, requestChainDepth: number): Promise<CursorState> {
  try {
    const { data } = await supabase.from("ingest_ats_cursor").select("*").eq("id", 1).maybeSingle();
    if (!data) return freshCursor();
    const isComplete = data.source_index >= SOURCE_NAMES.length;
    const updatedAt = data.updated_at ? new Date(data.updated_at).getTime() : 0;
    const isStale = Date.now() - updatedAt > CURSOR_STALE_MS;
    if (isComplete || isStale) return freshCursor();
    return {
      sourceIndex:  data.source_index ?? 0,
      itemIndex:    data.item_index ?? 0,
      chainDepth:   Math.max(data.chain_depth ?? 0, requestChainDepth),
      detail:       { ...emptyDetail(), ...(data.detail ?? {}) },
      runStartedAt: data.run_started_at ?? null,
    };
  } catch (_e) {
    return freshCursor();
  }
}

async function saveCursor(supabase: any, state: CursorState): Promise<void> {
  try {
    await supabase.from("ingest_ats_cursor").upsert({
      id:             1,
      source_index:   state.sourceIndex,
      item_index:     state.itemIndex,
      chain_depth:    state.chainDepth,
      detail:         state.detail,
      run_started_at: state.runStartedAt,
      updated_at:     new Date().toISOString(),
    });
  } catch (_e) { /* best-effort — worst case this slice re-runs next chain */ }
}

async function resetCursor(supabase: any): Promise<void> {
  try {
    await supabase.from("ingest_ats_cursor").upsert({
      id: 1, source_index: 0, item_index: 0, chain_depth: 0, detail: {}, run_started_at: null,
      updated_at: new Date().toISOString(),
    });
  } catch (_e) { /* best-effort */ }
}

const SOURCE_RUNNERS: Array<(supabase: any, startIndex: number, deadline: number) => Promise<ChunkResult>> = [
  ingestGreenhouse, ingestLever, ingestAshby, ingestWorkday, ingestSmartRecruiters,
];

// ── HTTP entrypoint — Bug 4: rolled-up inserted + errors ────────────────

serve(async (req) => {
  const startTime = Date.now();
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  let __reqBody: any = {};
  try { __reqBody = await req.clone().json(); } catch { __reqBody = {}; }
  const requestChainDepth = typeof __reqBody?.chainDepth === "number" ? Math.max(0, __reqBody.chainDepth) : 0;

  // ── HEARTBEAT (invocation.start) ──
  const __hbStart = Date.now();
  const __hbInvoker: "pg_cron"|"vercel_cron"|"manual"|"chain"|"unknown" = inferInvoker(req, __reqBody);
  const __hbId = await invocationStart({ supabase, functionSlug: "ingest-ats-direct", invokedBy: __hbInvoker, chainDepth: requestChainDepth });
  let __hbResponse: Response;
  try {
  try {
    const deadline = Date.now() + INGEST_BUDGET_MS;
    const cursor = await loadCursor(supabase, requestChainDepth);
    if (cursor.runStartedAt === null) cursor.runStartedAt = new Date().toISOString();
    const runStartedAt = cursor.runStartedAt;

    // #425 — process sources in order, in bounded slices, until either a
    // full cycle completes or the invocation's time budget runs out.
    // Progress is persisted after every source slice so a truncated
    // chain resumes at the next un-processed company/tenant rather than
    // restarting the whole source from #1.
    while (cursor.sourceIndex < SOURCE_NAMES.length) {
      const name = SOURCE_NAMES[cursor.sourceIndex];
      const run = SOURCE_RUNNERS[cursor.sourceIndex];
      const result = await run(supabase, cursor.itemIndex, deadline);
      cursor.detail[name].upserted += result.upserted;
      cursor.detail[name].errors.push(...result.errors);
      if (result.done) {
        cursor.sourceIndex += 1;
        cursor.itemIndex = 0;
      } else {
        cursor.itemIndex = result.nextIndex;
      }
      await saveCursor(supabase, cursor);
      if (!result.done) break; // budget exhausted this invocation — must chain
    }

    const cycleComplete = cursor.sourceIndex >= SOURCE_NAMES.length;
    const gh = cursor.detail.greenhouse, lever = cursor.detail.lever, ashby = cursor.detail.ashby;
    const workday = cursor.detail.workday, smartrecruiters = cursor.detail.smartrecruiters;

    let deactivated = 0;
    if (cycleComplete) {
      // #425 — the 48h stale-job deactivation sweep only runs once a FULL
      // cycle (all 5 sources) has completed. Running it after a
      // truncated/still-chaining pass would falsely deactivate jobs from
      // sources this cycle hasn't reached yet — see issue #425's
      // "do NOT mass-deactivate" warning.
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

      // fix/jobs-enrichment-throughput Fix 2 — kick a priority-lane enrich
      // pass targeting exec / director / VP / security titles so the newly
      // ingested rows get classified fast. Generalizable: the filter is a
      // parameter, not hardcoded here — swap the string for any future
      // high-value pattern.
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

      await resetCursor(supabase);
    } else if (cursor.chainDepth < MAX_CHAIN_DEPTH) {
      // #425 — self-chain so the cycle keeps advancing without a single
      // invocation ever approaching the wall-clock limit. Mirrors the
      // enrich-jobs self-invoke pattern (fire-and-forget, no auth header
      // needed since this function is deployed with verify_jwt=false).
      const nextChainDepth = cursor.chainDepth + 1;
      try {
        void fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/ingest-ats-direct`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chainDepth: nextChainDepth }),
        }).catch(() => {});
      } catch { /* silent — never fail this invocation on chain kick */ }
    }
    // else: MAX_CHAIN_DEPTH reached — stop chaining. The cursor stays
    // in-progress; if nothing resumes it within CURSOR_STALE_MS it's
    // treated as stale and the next tick starts a fresh cycle (see
    // loadCursor). Hitting this cap indicates something is fundamentally
    // wrong (e.g. every upstream request timing out) — chaining forever
    // would just mask that.

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
      // #425 — cycle/chain visibility. `cycleComplete` is true only once
      // all 5 sources have been processed for this run; `chained` tells
      // the caller a self-invoke was fired to continue the cycle.
      cycleComplete,
      chained: !cycleComplete,
      chainDepth: cursor.chainDepth,
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
    __hbResponse = new Response(JSON.stringify(body, null, 2), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    __hbResponse = new Response(JSON.stringify({ ok: false, error: (err as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
  const __hbOutcome: "ok"|"error" = __hbResponse.status >= 200 && __hbResponse.status < 400 ? "ok" : "error";
  await invocationComplete({ supabase, functionSlug: "ingest-ats-direct", invocationId: __hbId, startedAt: __hbStart, outcome: __hbOutcome, error: __hbOutcome === "error" ? ("HTTP " + __hbResponse.status) : undefined, metrics: { http_status: __hbResponse.status } });
  return __hbResponse;
  } catch (__hbE) {
    await invocationComplete({ supabase, functionSlug: "ingest-ats-direct", invocationId: __hbId, startedAt: __hbStart, outcome: "error", error: (__hbE as Error)?.message ?? String(__hbE) });
    throw __hbE;
  }
});
