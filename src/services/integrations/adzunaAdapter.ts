/**
 * Adzuna adapter — official REST API (free tier).
 * Docs: https://developer.adzuna.com/
 *
 * Reads ADZUNA_APP_ID + ADZUNA_APP_KEY from process.env.
 * Returns iCareerOS-shaped OpportunityResult objects so the page renders
 * them with no further mapping.
 *
 * Server-side only — env vars never reach the client.
 */

import type { OpportunityResult } from "@/services/opportunityTypes";

interface AdzunaJob {
  id: string;
  title: string;
  company:     { display_name: string };
  location:    { display_name: string; area?: string[] };
  description: string;
  redirect_url: string;
  salary_min?:  number;
  salary_max?:  number;
  contract_type?: string; // 'full_time' | 'part_time' | 'contract'
  contract_time?: string; // 'permanent' | 'contract'
  category?:   { label?: string };
  created:     string; // ISO date
}

export interface AdzunaSearchParams {
  what?:        string;     // keywords
  where?:       string;     // location
  remote?:      boolean;
  jobType?:     string;     // 'full_time' | 'part_time' | 'contract' | 'permanent'
  salaryMin?:   number;
  salaryMax?:   number;
  resultsPerPage?: number;  // 10-50
  page?:        number;     // 1-based
  country?:     string;     // default 'us'
  sortBy?:      "date" | "salary" | "relevance";
}

export interface AdzunaSearchResult {
  opportunities: OpportunityResult[];
  total:         number;     // Adzuna reports the global match count
  fallback:      boolean;    // true if the API was unreachable / unconfigured
}

const ADZUNA_BASE = "https://api.adzuna.com/v1/api/jobs";

export async function searchAdzuna(params: AdzunaSearchParams): Promise<AdzunaSearchResult> {
  const appId  = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;

  if (!appId || !appKey) {
    console.warn("[adzuna] ADZUNA_APP_ID / ADZUNA_APP_KEY not set — returning empty result");
    return { opportunities: [], total: 0, fallback: true };
  }

  const country = params.country ?? "us";
  const page    = params.page ?? 1;
  const perPage = Math.min(50, Math.max(10, params.resultsPerPage ?? 25));

  const q = new URLSearchParams({
    app_id:           appId,
    app_key:          appKey,
    results_per_page: String(perPage),
    sort_by:          params.sortBy ?? "relevance",
    content_type:     "application/json",
  });
  if (params.what)      q.set("what",  params.what);
  if (params.where)     q.set("where", params.where);
  if (params.salaryMin) q.set("salary_min", String(params.salaryMin));
  if (params.salaryMax) q.set("salary_max", String(params.salaryMax));

  // Adzuna has separate flags per contract type; pick at most one.
  if (params.jobType === "full_time") q.set("full_time", "1");
  if (params.jobType === "part_time") q.set("part_time", "1");
  if (params.jobType === "contract")  q.set("contract",  "1");
  if (params.jobType === "permanent") q.set("permanent", "1");

  const url = `${ADZUNA_BASE}/${country}/search/${page}?${q}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) {
      console.warn(`[adzuna] HTTP ${res.status} on search`);
      return { opportunities: [], total: 0, fallback: true };
    }

    const payload = (await res.json()) as { results?: AdzunaJob[]; count?: number };
    const jobs = Array.isArray(payload.results) ? payload.results : [];

    // Optional client-side remote filter (Adzuna doesn't expose a flag)
    const filtered = params.remote
      ? jobs.filter(j => /remote|wfh|work\s*from\s*home/i.test(`${j.title} ${j.location?.display_name ?? ""} ${j.description ?? ""}`))
      : jobs;

    const opportunities: OpportunityResult[] = filtered.map(a => {
      const isRemote = /remote|wfh|work\s*from\s*home/i.test(
        `${a.title} ${a.location?.display_name ?? ""}`
      );
      const type =
        a.contract_type === "full_time" ? "Full-time" :
        a.contract_type === "part_time" ? "Part-time" :
        a.contract_type === "contract"  ? "Contract"  :
        a.contract_time === "permanent" ? "Full-time" :
        "Full-time";

      // Compose salary string for display
      let salary: string | undefined;
      if (a.salary_min && a.salary_max) {
        salary = `$${Math.round(a.salary_min/1000)}K – $${Math.round(a.salary_max/1000)}K`;
      } else if (a.salary_min) {
        salary = `From $${Math.round(a.salary_min/1000)}K`;
      } else if (a.salary_max) {
        salary = `Up to $${Math.round(a.salary_max/1000)}K`;
      }

      return {
        id:           `adzuna-${a.id}`,
        title:        a.title?.trim() ?? "Untitled",
        company:      a.company?.display_name?.trim() ?? "Unknown",
        location:     a.location?.display_name?.trim() ?? "",
        type,
        description:  a.description ?? "",
        url:          a.redirect_url,
        matchReason:  "",
        salary,
        salary_min:   a.salary_min ?? null,
        salary_max:   a.salary_max ?? null,
        salary_currency: "USD",
        is_remote:    isRemote,
        source:       "adzuna",
        first_seen_at: a.created,
      };
    });

    return {
      opportunities,
      total: payload.count ?? opportunities.length,
      fallback: false,
    };
  } catch (e) {
    console.error("[adzuna] fetch failed:", e instanceof Error ? e.message : e);
    return { opportunities: [], total: 0, fallback: true };
  }
}
