/**
 * iCareerOS — ATS Direct Adapter
 *
 * Brief: feat/jobs-intelligence-suite Task 5.
 *
 * Pulls public job listings from Greenhouse, Lever, and Ashby's open
 * job-board APIs for a curated list of tech companies. These APIs are
 * free, require no auth, and return canonical apply URLs that point
 * directly to the company's career page — the highest-trust source
 * surface available (weighted 1.0 in opportunityAggregator).
 *
 * Endpoints (all GET, JSON):
 *   Greenhouse: https://boards-api.greenhouse.io/v1/boards/{company}/jobs
 *   Lever:      https://api.lever.co/v0/postings/{company}?mode=json
 *   Ashby:      https://api.ashbyhq.com/posting-api/job-board/{company}
 *
 * Concurrency: ~60 companies × 3 APIs would be 180 requests. We use
 * Promise.allSettled and a per-company timeout to make the slowest
 * outlier non-blocking. Failures degrade silently.
 */

import type { OpportunityResult, OpportunitySearchFilters } from "@/services/opportunityTypes";

// Companies known to use each ATS. Hand-curated from common tech companies.
// Update via grep / dataset refresh — these strings ARE the URL slugs.
const GREENHOUSE_COMPANIES = [
  "airbnb", "instacart", "doordash", "lyft", "robinhood", "coinbase",
  "stripe", "discord", "datadoghq", "elastic", "gitlab", "twilio",
  "shopify", "atlassian", "asana", "reddit", "pinterest", "squarespace",
  "snowflakecomputing", "okta",
] as const;

const LEVER_COMPANIES = [
  "netflix", "spotify", "rippling", "ramp", "scale", "anthropic",
  "openai", "huggingface", "perplexity", "linear", "vercel",
  "supabase", "replit", "notion", "figma", "loom", "miro",
  "framer", "raycast", "arc",
] as const;

const ASHBY_COMPANIES = [
  "ramp", "linear", "vanta", "modal", "deel", "mercury",
  "brex", "warpdotdev", "loops", "attio", "prisma", "tigerbeetle",
  "render", "fly", "convex", "neon", "browserbase", "trigger",
  "windsurf", "cursor",
] as const;

const FETCH_TIMEOUT_MS = 6000;

interface GreenhouseJob {
  id: number;
  title: string;
  absolute_url: string;
  location?: { name?: string };
  content?: string;
  updated_at?: string;
  departments?: Array<{ name?: string }>;
}

interface LeverPosting {
  id: string;
  text: string;
  hostedUrl: string;
  categories?: { location?: string; commitment?: string; team?: string };
  description?: string;
  createdAt?: number;
}

interface AshbyJob {
  id: string;
  title: string;
  jobUrl: string;
  locationName?: string;
  descriptionPlain?: string;
  publishedDate?: string;
  isRemote?: boolean;
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "iCareerOS/1.0" },
      signal: ctl.signal,
    });
    clearTimeout(t);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function matchesQuery(text: string, query: string): boolean {
  if (!query) return true;
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return text.toLowerCase().includes(q);
}

async function searchGreenhouse(query: string): Promise<OpportunityResult[]> {
  const out: OpportunityResult[] = [];
  const results = await Promise.allSettled(
    GREENHOUSE_COMPANIES.map(async (slug) => {
      const data = await fetchJson<{ jobs?: GreenhouseJob[] }>(
        `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`,
      );
      const jobs = data?.jobs ?? [];
      return { slug, jobs };
    }),
  );
  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    const { slug, jobs } = r.value;
    for (const j of jobs) {
      if (!matchesQuery(`${j.title} ${j.content ?? ""}`, query)) continue;
      out.push({
        id:           `greenhouse-${slug}-${j.id}`,
        title:        (j.title || "").trim(),
        company:      slug,
        location:     j.location?.name?.trim() ?? "",
        type:         "",
        description:  (j.content || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
        url:          j.absolute_url,
        matchReason:  "",
        source:       "greenhouse",
        first_seen_at: j.updated_at,
        is_remote:    /remote/i.test(`${j.title} ${j.location?.name ?? ""}`),
      });
    }
  }
  return out;
}

async function searchLever(query: string): Promise<OpportunityResult[]> {
  const out: OpportunityResult[] = [];
  const results = await Promise.allSettled(
    LEVER_COMPANIES.map(async (slug) => {
      const data = await fetchJson<LeverPosting[]>(
        `https://api.lever.co/v0/postings/${slug}?mode=json`,
      );
      return { slug, postings: data ?? [] };
    }),
  );
  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    const { slug, postings } = r.value;
    for (const p of postings) {
      const desc = (p.description || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (!matchesQuery(`${p.text} ${desc}`, query)) continue;
      out.push({
        id:           `lever-${slug}-${p.id}`,
        title:        (p.text || "").trim(),
        company:      slug,
        location:     p.categories?.location?.trim() ?? "",
        type:         p.categories?.commitment?.trim() ?? "",
        description:  desc,
        url:          p.hostedUrl,
        matchReason:  "",
        source:       "lever",
        first_seen_at: p.createdAt ? new Date(p.createdAt).toISOString() : undefined,
        is_remote:    /remote/i.test(`${p.text} ${p.categories?.location ?? ""}`),
      });
    }
  }
  return out;
}

async function searchAshby(query: string): Promise<OpportunityResult[]> {
  const out: OpportunityResult[] = [];
  const results = await Promise.allSettled(
    ASHBY_COMPANIES.map(async (slug) => {
      const data = await fetchJson<{ jobs?: AshbyJob[] }>(
        `https://api.ashbyhq.com/posting-api/job-board/${slug}`,
      );
      return { slug, jobs: data?.jobs ?? [] };
    }),
  );
  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    const { slug, jobs } = r.value;
    for (const j of jobs) {
      if (!matchesQuery(`${j.title} ${j.descriptionPlain ?? ""}`, query)) continue;
      out.push({
        id:           `ashby-${slug}-${j.id}`,
        title:        (j.title || "").trim(),
        company:      slug,
        location:     j.locationName?.trim() ?? "",
        type:         "",
        description:  (j.descriptionPlain || "").trim(),
        url:          j.jobUrl,
        matchReason:  "",
        source:       "ashby",
        first_seen_at: j.publishedDate,
        is_remote:    !!j.isRemote || /remote/i.test(`${j.title} ${j.locationName ?? ""}`),
      });
    }
  }
  return out;
}

export interface ATSSearchResult {
  opportunities: OpportunityResult[];
  total: number;
  fallback: boolean;
}

/**
 * Search Greenhouse + Lever + Ashby in parallel and merge.
 * Filter by query (job title keyword) since the ATS endpoints return
 * everything on the company board.
 */
export async function searchATS(
  filters: OpportunitySearchFilters,
): Promise<ATSSearchResult> {
  const query = filters.query
    || filters.targetTitles?.[0]
    || filters.skills?.[0]
    || "";

  const [gh, lv, as] = await Promise.allSettled([
    searchGreenhouse(query),
    searchLever(query),
    searchAshby(query),
  ]);

  const opportunities: OpportunityResult[] = [];
  let anySuccess = false;

  for (const r of [gh, lv, as]) {
    if (r.status === "fulfilled") {
      opportunities.push(...r.value);
      anySuccess = true;
    }
  }

  return {
    opportunities,
    total:    opportunities.length,
    fallback: !anySuccess,
  };
}
