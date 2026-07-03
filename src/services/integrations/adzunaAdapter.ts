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
import { cleanJobDescription } from "@/services/jobs/descriptionCleaner";

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


/**
 * fix/jobs-smart-apply-issues Fix 4 — Adzuna returns a `redirect_url` that
 * bounces through Adzuna's tracker. Try to resolve it to the direct
 * employer URL at ingest time. Falls back to the description body (which
 * sometimes contains the ATS URL inline) and finally to the redirect_url.
 *
 * We keep this best-effort: the outer search always returns something,
 * even if resolution fails (network, timeout, etc.).
 */
const RESOLVED_URL_CACHE = new Map<string, string>();

async function followRedirects(initialUrl: string, hops = 3): Promise<string> {
  let currentUrl = initialUrl;
  for (let i = 0; i < hops; i++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8_000);
      const res = await fetch(currentUrl, {
        method:  "HEAD",
        redirect: "manual",
        signal:  controller.signal,
        headers: { "User-Agent": "Mozilla/5.0 iCareerOS-JobFetcher/1.0" },
      });
      clearTimeout(timeout);
      if (res.status >= 300 && res.status < 400) {
        const next = res.headers.get("location");
        if (!next) return currentUrl;
        currentUrl = new URL(next, currentUrl).href;
        continue;
      }
      // 2xx / 4xx / 5xx — stop chasing
      return currentUrl;
    } catch {
      return currentUrl; // network or timeout: return best-known URL
    }
  }
  return currentUrl;
}

export async function resolveAdzunaApplyUrl(adzunaJob: { redirect_url?: string; description?: string; apply_url?: string; company_url?: string }): Promise<string> {
  // Direct fields sometimes populated by Adzuna
  const direct = (adzunaJob as { apply_url?: string; company_url?: string }).apply_url ?? adzunaJob.company_url;
  if (direct && !/adzuna\.com/i.test(direct)) return direct;

  const redirectUrl = adzunaJob.redirect_url ?? "";
  if (redirectUrl && RESOLVED_URL_CACHE.has(redirectUrl)) {
    return RESOLVED_URL_CACHE.get(redirectUrl)!;
  }

  // 1) Follow up to 3 redirects
  if (redirectUrl) {
    const resolved = await followRedirects(redirectUrl, 3);
    if (resolved && !/adzuna\.com/i.test(resolved)) {
      RESOLVED_URL_CACHE.set(redirectUrl, resolved);
      return resolved;
    }
  }

  // 2) Extract ATS URL from description
  const desc = adzunaJob.description ?? "";
  const urlMatch = desc.match(/https?:\/\/(?:jobs|careers|apply|boards|(?:[a-z0-9-]+\.)?greenhouse|(?:[a-z0-9-]+\.)?ashbyhq|(?:[a-z0-9-]+\.)?lever|(?:[a-z0-9-]+\.)?workable|(?:[a-z0-9-]+\.)?smartrecruiters|(?:[a-z0-9-]+\.)?myworkdayjobs)[^\s"'<>]+/i);
  if (urlMatch) {
    RESOLVED_URL_CACHE.set(redirectUrl, urlMatch[0]);
    return urlMatch[0];
  }

  // 3) Fall back to the Adzuna redirect
  return redirectUrl;
}

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
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "Accept": "application/json", "User-Agent": "iCareerOS/1.0" },
    });
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

    const opportunities: OpportunityResult[] = await Promise.all(filtered.map(async a => {
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

      // fix/jobs-smart-apply-issues Fix 4 — resolve Adzuna's tracker
      // redirect to the direct employer URL when possible. Falls back
      // to a.redirect_url unchanged if resolution fails.
      const resolvedUrl = await resolveAdzunaApplyUrl({
        redirect_url: a.redirect_url,
        description:  a.description,
      });

      return {
        id:           `adzuna-${a.id}`,
        title:        a.title?.trim() ?? "Untitled",
        company:      a.company?.display_name?.trim() ?? "Unknown",
        location:     a.location?.display_name?.trim() ?? "",
        type,
        description:  cleanJobDescription(a.description),
        url:          resolvedUrl,
        // Preserve the Adzuna tracker as apply_url_company (used elsewhere)
        // but the canonical `url` is now the direct employer link.
        apply_url_company: !/adzuna\.com/i.test(resolvedUrl) ? resolvedUrl : (a.redirect_url ?? null),
        matchReason:  "",
        salary,
        salary_min:   a.salary_min ?? null,
        salary_max:   a.salary_max ?? null,
        salary_currency: "USD",
        is_remote:    isRemote,
        source:       "adzuna",
        first_seen_at: a.created,
      };
    }));

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
