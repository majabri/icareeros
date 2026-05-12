/**
 * ingest-ats-direct — Supabase Edge Function (Deno)
 *
 * Direct ATS ingestion for iCareerOS. Replaces Adzuna for the top
 * companies — these jobs are clean by construction (no aggregator
 * tracking links, no "Job ID" boilerplate, no email-gate funnels).
 *
 * Sources (ported from azjobs `scrape-jobs-ats` reference, fresh
 * implementation per Rule 10):
 *   • Greenhouse  — public Boards API JSON
 *   • Lever       — public Postings API JSON
 *   • Ashby       — page HTML scrape (window.__INITIAL_STATE__)
 *   • Workday     — POST /wday/cxs/{slug}/jobs
 *   • Career Page — regex job-link extraction fallback
 *
 * Seed companies (10): Stripe, Notion, Linear, Vercel, Anthropic, OpenAI,
 * Figma, Airtable, Retool, Rippling. Slugs are best-guess from the
 * brief — Wave 4 CHECKPOINT verifies them before any DB write.
 *
 * Invocation modes:
 *   POST { dry_run: true }                  — fetch + return, NO writes
 *   POST { dry_run: false, max_per_company: 25 } — fetch + upsert into
 *                                                  public.opportunities
 *
 * Defaults to dry_run=true to enforce the CHECKPOINT discipline. The
 * caller must explicitly set dry_run=false to allow writes.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── Seed companies (Wave 4) ────────────────────────────────────────────────

type ATS = "greenhouse" | "lever" | "ashby" | "workday" | "career_page";

interface CompanyConfig {
  name: string;          // Display name for the `company` field.
  slug: string;          // Slug used by the ATS endpoint.
  ats: ATS;
  /** Optional override URL (Workday + career_page only). */
  url?: string;
}

const SEED_COMPANIES: CompanyConfig[] = [
  // Verified 2026-05-11 via curl probes (see Wave 4 CHECKPOINT report).
  // Greenhouse: 4 companies w/ public boards-api.greenhouse.io endpoints
  { name: "Stripe",    slug: "stripe",    ats: "greenhouse" },
  { name: "Vercel",    slug: "vercel",    ats: "greenhouse" },
  { name: "Anthropic", slug: "anthropic", ats: "greenhouse" },
  { name: "Figma",     slug: "figma",     ats: "greenhouse" },
  // Ashby (using api.ashbyhq.com/posting-api JSON, not the HTML scrape):
  { name: "Notion",    slug: "notion",    ats: "ashby"      },
  { name: "OpenAI",    slug: "openai",    ats: "ashby"      },
  { name: "Linear",    slug: "linear",    ats: "ashby"      },
  // Career page fallback — Airtable/Rippling/Retool have no public API.
  { name: "Airtable",  slug: "airtable",  ats: "career_page", url: "https://airtable.com/careers" },
  { name: "Rippling",  slug: "rippling",  ats: "career_page", url: "https://www.rippling.com/careers/jobs" },
  { name: "Retool",    slug: "retool",    ats: "career_page", url: "https://retool.com/careers" },
];

// ── Shape we normalize every scraper output into ───────────────────────────

interface ScrapedJob {
  source: ATS;
  source_id: string;          // Stable per ATS + company + job-id
  title: string;
  company: string;
  description: string;
  location: string;
  is_remote: boolean;
  job_type: string;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  apply_url: string;          // CLEAN — points directly at the company's ATS posting
  posted_at: string;
}

// ── HTTP entry ─────────────────────────────────────────────────────────────

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  let body: any = {};
  try { body = await req.json(); } catch { /* empty body is fine */ }
  const dryRun: boolean = body?.dry_run !== false;       // default true
  const maxPerCompany: number = clampInt(body?.max_per_company, 1, 100, 25);

  const t0 = Date.now();
  const perCompany: Record<string, { count: number; error?: string; sample?: ScrapedJob[] }> = {};
  const allJobs: ScrapedJob[] = [];

  for (const c of SEED_COMPANIES) {
    try {
      const jobs = await scrapeCompany(c, maxPerCompany);
      perCompany[c.slug] = {
        count: jobs.length,
        sample: jobs.slice(0, 3), // surface a sample for the CHECKPOINT
      };
      allJobs.push(...jobs);
    } catch (e) {
      perCompany[c.slug] = { count: 0, error: (e as Error)?.message ?? String(e) };
    }
    // Gentle rate limit between companies.
    await sleep(400);
  }

  let upsertResult: { inserted: number; updated: number; error?: string } | undefined;
  if (!dryRun && allJobs.length > 0) {
    upsertResult = await upsertJobs(allJobs);
  }

  return json({
    ok:          true,
    dry_run:     dryRun,
    elapsed_ms:  Date.now() - t0,
    total_jobs:  allJobs.length,
    by_company:  perCompany,
    upsert:      upsertResult ?? null,
  });
});

// ── Per-ATS scrapers ───────────────────────────────────────────────────────

async function scrapeCompany(c: CompanyConfig, max: number): Promise<ScrapedJob[]> {
  switch (c.ats) {
    case "greenhouse":  return scrapeGreenhouse(c, max);
    case "lever":       return scrapeLever(c, max);
    case "ashby":       return scrapeAshby(c, max);
    case "workday":     return scrapeWorkday(c, max);
    case "career_page": return scrapeCareerPage(c, max);
  }
}

async function scrapeGreenhouse(c: CompanyConfig, max: number): Promise<ScrapedJob[]> {
  const url = `https://boards-api.greenhouse.io/v1/boards/${c.slug}/jobs?content=true`;
  const res = await fetchWithUA(url);
  if (!res.ok) throw new Error(`Greenhouse ${c.slug} → ${res.status}`);
  const data = await res.json();
  const out: ScrapedJob[] = [];
  for (const j of (data?.jobs ?? []).slice(0, max)) {
    const desc = stripHtml(decodeHtml(j.content ?? ""));
    const loc = parseLocationObj(j.location);
    out.push({
      source:           "greenhouse",
      source_id:        `gh-${c.slug}-${j.id}`,
      title:            j.title || "Untitled",
      company:          c.name,
      description:      desc.slice(0, 5000),
      location:         loc,
      is_remote:        isRemote(loc, desc),
      job_type:         guessJobType(j.title, desc),
      salary_min:       extractSalary(desc, "min"),
      salary_max:       extractSalary(desc, "max"),
      salary_currency:  null,
      apply_url:        j.absolute_url,
      posted_at:        j.updated_at || new Date().toISOString(),
    });
  }
  return out;
}

async function scrapeLever(c: CompanyConfig, max: number): Promise<ScrapedJob[]> {
  const url = `https://api.lever.co/v0/postings/${c.slug}?mode=json`;
  const res = await fetchWithUA(url);
  if (!res.ok) throw new Error(`Lever ${c.slug} → ${res.status}`);
  const data = await res.json();
  const out: ScrapedJob[] = [];
  for (const j of (data ?? []).slice(0, max)) {
    const desc = (j.descriptionPlain || stripHtml(j.description ?? "")).slice(0, 5000);
    const loc = j?.categories?.location || "";
    out.push({
      source:           "lever",
      source_id:        `lv-${c.slug}-${j.id}`,
      title:            j.text || "Untitled",
      company:          c.name,
      description:      desc,
      location:         loc,
      is_remote:        isRemote(loc, desc),
      job_type:         guessJobType(j.text, desc),
      salary_min:       j.salaryMin ?? null,
      salary_max:       j.salaryMax ?? null,
      salary_currency:  j.salaryCurrency ?? null,
      apply_url:        j.applyUrl || j.hostedUrl,
      posted_at:        j.createdAt ? new Date(j.createdAt).toISOString() : new Date().toISOString(),
    });
  }
  return out;
}

async function scrapeAshby(c: CompanyConfig, max: number): Promise<ScrapedJob[]> {
  // Public JSON endpoint — way more reliable than scraping the HTML page,
  // which is a client-side-rendered SPA shell for most boards.
  const url = `https://api.ashbyhq.com/posting-api/job-board/${c.slug}`;
  const res = await fetchWithUA(url);
  if (!res.ok) throw new Error(`Ashby ${c.slug} → ${res.status}`);
  const data = await res.json();
  const out: ScrapedJob[] = [];
  for (const j of (data?.jobs ?? []).slice(0, max)) {
    const desc = (j.descriptionPlain || stripHtml(j.descriptionHtml ?? "")).slice(0, 5000);
    const loc = j.locationName || parseLocationObj(j.location) || "";
    out.push({
      source:           "ashby",
      source_id:        `ash-${c.slug}-${j.id}`,
      title:            j.title || "Untitled",
      company:          c.name,
      description:      desc,
      location:         loc,
      is_remote:        Boolean(j.isRemote) || isRemote(loc, desc),
      job_type:         (j.employmentType || guessJobType(j.title, desc)).toLowerCase().replace(/\s+/g, "_"),
      salary_min:       null,
      salary_max:       null,
      salary_currency:  null,
      apply_url:        j.applyUrl || j.jobUrl,
      posted_at:        j.publishedAt ? new Date(j.publishedAt).toISOString() : new Date().toISOString(),
    });
  }
  return out;
}

async function _scrapeAshbyHtmlLegacy(c: CompanyConfig, max: number): Promise<ScrapedJob[]> {
  const url = `https://jobs.ashbyhq.com/${c.slug}`;
  const res = await fetchWithUA(url, true);
  if (!res.ok) throw new Error(`Ashby ${c.slug} → ${res.status}`);
  const html = await res.text();
  const m = html.match(/window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?});\s*<\/script>/);
  if (!m) throw new Error(`Ashby ${c.slug} → no __INITIAL_STATE__ found`);
  let initial: any;
  try { initial = JSON.parse(m[1]); } catch { throw new Error(`Ashby ${c.slug} → unparseable __INITIAL_STATE__`); }
  const jobs = initial?.jobs?.jobs ?? initial?.boardData?.jobs ?? [];
  const out: ScrapedJob[] = [];
  for (const j of jobs.slice(0, max)) {
    const desc = stripHtml(j.descriptionHtml ?? j.description ?? "").slice(0, 5000);
    const loc = parseLocationObj(j.location);
    out.push({
      source:           "ashby",
      source_id:        `ash-${c.slug}-${j.id}`,
      title:            j.title || "Untitled",
      company:          c.name,
      description:      desc,
      location:         loc,
      is_remote:        isRemote(loc, desc),
      job_type:         guessJobType(j.title, desc),
      salary_min:       j.compensationMin ?? null,
      salary_max:       j.compensationMax ?? null,
      salary_currency:  j.compensationCurrency ?? null,
      apply_url:        `https://jobs.ashbyhq.com/${c.slug}/${j.id}`,
      posted_at:        j.publishedAt ? new Date(j.publishedAt).toISOString() : new Date().toISOString(),
    });
  }
  return out;
}

async function scrapeWorkday(c: CompanyConfig, max: number): Promise<ScrapedJob[]> {
  const base = c.url || `https://${c.slug}.wd1.myworkdayjobs.com`;
  const searchUrl = `${base}/wday/cxs/${c.slug}/jobs`;
  const res = await fetch(searchUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": uaJSON() },
    body: JSON.stringify({ appliedFacets: {}, limit: max, offset: 0, searchText: "" }),
  });
  if (!res.ok) throw new Error(`Workday ${c.slug} → ${res.status}`);
  const data = await res.json();
  const out: ScrapedJob[] = [];
  for (const j of (data?.jobPostings ?? []).slice(0, max)) {
    const desc = stripHtml(j.jobDescription ?? "").slice(0, 5000);
    const loc = j.locationsText || "";
    out.push({
      source:           "workday",
      source_id:        `wd-${c.slug}-${j.bulletFields?.[0] ?? hash(j.externalPath ?? j.title ?? "")}`,
      title:            j.title || "Untitled",
      company:          c.name,
      description:      desc,
      location:         loc,
      is_remote:        isRemote(loc, desc),
      job_type:         guessJobType(j.title, desc),
      salary_min:       null,
      salary_max:       null,
      salary_currency:  null,
      apply_url:        `${base}${j.externalPath ?? ""}`,
      posted_at:        j.postedOn ? new Date(j.postedOn).toISOString() : new Date().toISOString(),
    });
  }
  return out;
}

async function scrapeCareerPage(c: CompanyConfig, max: number): Promise<ScrapedJob[]> {
  // Generic fallback — extracts job-link anchors from the careers page.
  // Less reliable than the structured ATSes; used only when ats === 'career_page'.
  const url = c.url || `https://${c.slug}.com/careers`;
  const res = await fetchWithUA(url, true);
  if (!res.ok) throw new Error(`Career page ${c.slug} → ${res.status}`);
  const html = await res.text();
  const out: ScrapedJob[] = [];
  const re = /<a[^>]+href="([^"]*(?:job|career|position|opening)[^"]*)"[^>]*>([^<]{4,140})<\/a>/gi;
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null && out.length < max) {
    const href = m[1];
    const title = decodeHtml(m[2]).replace(/\s+/g, " ").trim();
    if (!title || seen.has(href)) continue;
    seen.add(href);
    const full = href.startsWith("http") ? href : new URL(href, url).toString();
    out.push({
      source:           "career_page",
      source_id:        `cp-${c.slug}-${hash(href)}`,
      title,
      company:          c.name,
      description:      "",
      location:         "",
      is_remote:        false,
      job_type:         "full_time",
      salary_min:       null,
      salary_max:       null,
      salary_currency:  null,
      apply_url:        full,
      posted_at:        new Date().toISOString(),
    });
  }
  return out;
}

// ── Upsert into public.opportunities ───────────────────────────────────────

async function upsertJobs(jobs: ScrapedJob[]): Promise<{ inserted: number; updated: number; error?: string }> {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return { inserted: 0, updated: 0, error: "missing service-role credentials in edge env" };
  }
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
  const rows = jobs.map(j => ({
    title:               j.title,
    company:             j.company,
    description:         j.description,
    location:            j.location,
    url:                 j.apply_url,
    apply_url_company:   j.apply_url, // ATS scrapes ARE the company URL
    job_type:            j.job_type,
    is_remote:           j.is_remote,
    salary_min:          j.salary_min,
    salary_max:          j.salary_max,
    salary_currency:     j.salary_currency,
    source:              "ats",
    source_id:           j.source_id,
    first_seen_at:       new Date().toISOString(),
    posted_at:           j.posted_at,
    is_active:           true,
    is_flagged:          false,
  }));
  const { error, data, count } = await sb
    .from("opportunities")
    .upsert(rows, { onConflict: "source,source_id", ignoreDuplicates: false, count: "exact" })
    .select("id");
  if (error) return { inserted: 0, updated: 0, error: error.message };
  return { inserted: data?.length ?? count ?? 0, updated: 0 };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function uaHtml() { return "Mozilla/5.0 (compatible; iCareerOS/1.0; Job Discovery Bot)"; }
function uaJSON() { return "iCareerOS/1.0 (Job Discovery Bot)"; }

async function fetchWithUA(url: string, asHtml = false): Promise<Response> {
  return fetch(url, {
    headers: {
      "User-Agent": asHtml ? uaHtml() : uaJSON(),
      "Accept":     asHtml ? "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" : "application/json",
    },
  });
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g,  "<")
    .replace(/&gt;/g,  ">")
    .replace(/&quot;/g,'"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g," ");
}

function parseLocationObj(loc: any): string {
  if (!loc) return "";
  if (typeof loc === "string") return loc;
  return loc.name || loc.title || loc.city || "";
}

function isRemote(loc: string, desc: string): boolean {
  const t = `${loc} ${desc}`.toLowerCase();
  return t.includes("remote")
      || t.includes("work from home")
      || t.includes("distributed")
      || t.includes("anywhere");
}

function guessJobType(title: string, description: string): string {
  const t = `${title} ${description}`.toLowerCase();
  if (t.includes("intern"))                                     return "internship";
  if (t.includes("contract") || t.includes("freelance"))        return "contract";
  if (t.includes("part-time") || t.includes("part time"))       return "part_time";
  return "full_time";
}

function extractSalary(content: string, kind: "min" | "max"): number | null {
  // Match "$120k - $150k" / "$120,000 - $150,000" / "$120k–$150k".
  const m = /\$?\s*([\d,]+)\s*(k|000)?\s*[-–—to]+\s*\$?\s*([\d,]+)\s*(k|000)?/i.exec(content);
  if (!m) return null;
  let lo = parseInt(m[1].replace(/,/g, ""), 10);
  let hi = parseInt(m[3].replace(/,/g, ""), 10);
  if (Number.isNaN(lo) || Number.isNaN(hi)) return null;
  if (m[2]?.toLowerCase() === "k") lo *= 1000;
  if (m[4]?.toLowerCase() === "k") hi *= 1000;
  return kind === "min" ? lo : hi;
}

function hash(s: string): string {
  // Tiny non-cryptographic hash — stable across runs, used as part of source_id.
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

function clampInt(v: unknown, lo: number, hi: number, fallback: number): number {
  const n = typeof v === "number" ? v : parseInt(String(v ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
