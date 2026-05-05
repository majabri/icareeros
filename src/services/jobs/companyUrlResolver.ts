/**
 * Company careers-page URL resolver.
 *
 * Tries to surface a direct apply link on the company's own site instead of
 * defaulting to the Adzuna redirect. Conservative — only returns a URL when
 * we're confident; no blind guessing of "companyname.com/careers" because
 * many companies use ATS subdomains (greenhouse.io, lever.co, workday.com).
 *
 * Strategy:
 *   1. Scan the description for an explicit apply URL ending in /careers,
 *      /jobs, or with apply.* on the path. Prefer URLs that look like the
 *      company's own site (matching the company name).
 *   2. If we find an ATS pattern (greenhouse.io/$company, jobs.lever.co/$company,
 *      $company.workday.com), surface that — those are direct apply pages.
 *   3. Otherwise return null. Caller falls back to the Adzuna redirect.
 */

import type { OpportunityResult } from "@/services/opportunityTypes";

const URL_RE = /https?:\/\/[^\s"<>'`]+/gi;

const ATS_HOST_PATTERNS = [
  /^(?:[\w-]+\.)?greenhouse\.io$/i,
  /^jobs\.lever\.co$/i,
  /^[\w-]+\.workday\.com$/i,
  /^[\w-]+\.bamboohr\.com$/i,
  /^jobs\.smartrecruiters\.com$/i,
  /^[\w-]+\.icims\.com$/i,
  /^[\w-]+\.ashbyhq\.com$/i,
  /^[\w-]+\.applytojob\.com$/i,
];

const CAREERS_PATH_RE = /\/(careers?|jobs?|positions?|openings?|opportunities?|apply)(\/|\?|$|#)/i;

function companySlug(company: string): string {
  return company.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/**
 * Resolve a direct-apply URL for a job. Returns null if no confident match.
 */
export function resolveCompanyApplyUrl(job: OpportunityResult): string | null {
  const desc = job.description ?? "";
  if (!desc) return null;

  const urls = desc.match(URL_RE) ?? [];
  if (urls.length === 0) return null;

  const cSlug = companySlug(job.company ?? "");

  // Score each URL and pick the best
  type Scored = { url: string; score: number };
  const scored: Scored[] = [];

  for (const raw of urls) {
    let url = raw.replace(/[).,;!?'"]+$/, ""); // strip trailing punctuation
    let host = "";
    try {
      const u = new URL(url);
      host = u.hostname.toLowerCase();
    } catch {
      continue;
    }

    let score = 0;

    // ATS hosts (greenhouse.io, lever.co, workday.com…) are gold for direct apply
    if (ATS_HOST_PATTERNS.some(re => re.test(host))) {
      score += 50;
      // bonus if the company slug appears in host path
      if (cSlug && host.includes(cSlug)) score += 20;
      if (cSlug && url.toLowerCase().includes(cSlug)) score += 10;
    }

    // Careers/jobs path is a strong signal
    if (CAREERS_PATH_RE.test(url)) score += 30;

    // Host matches the company name (e.g., abbott.com for "Abbott Laboratories")
    if (cSlug && cSlug.length >= 4) {
      const hostNoTld = host.split(".").slice(0, -1).join(".");
      if (hostNoTld.replace(/[^a-z0-9]/g, "").includes(cSlug.slice(0, 8))) {
        score += 25;
      }
    }

    // Penalty for known job-board / aggregator hosts
    if (/(adzuna|indeed|glassdoor|simplyhired|ziprecruiter|monster|jobs2careers|careerbuilder)/i.test(host)) {
      score -= 40;
    }

    if (score > 0) scored.push({ url, score });
  }

  if (scored.length === 0) return null;
  scored.sort((a, b) => b.score - a.score);
  // Require a minimum score so we don't surface low-confidence URLs
  return scored[0].score >= 30 ? scored[0].url : null;
}

/**
 * Decorate a list of opportunities with `apply_url_company`. Returns a new
 * array; original objects are not mutated.
 */
export function attachCompanyApplyUrls<T extends OpportunityResult>(
  jobs: T[]
): Array<T & { apply_url_company?: string | null }> {
  return jobs.map(job => ({
    ...job,
    apply_url_company: resolveCompanyApplyUrl(job),
  }));
}
