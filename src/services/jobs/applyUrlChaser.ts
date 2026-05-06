/**
 * Apply-URL chaser — converts Adzuna redirects into the actual company /
 * ATS apply page whenever possible.
 *
 * Adzuna gives us `redirect_url` which is a tracking link that 301/302's
 * through to the real destination. The destination is typically:
 *   ~50%  ATS (Greenhouse, Lever, Workday, iCIMS, Ashby, BambooHR…)
 *   ~30%  Company careers site (apple.com/jobs, microsoft.com/careers)
 *   ~20%  Aggregator (Indeed, Glassdoor, ZipRecruiter, SimplyHired)
 *
 * For the first two we want the resolved URL on the Apply button — it's
 * the canonical place to apply. For aggregators we keep the Adzuna URL as
 * a working fallback (going company-direct via an aggregator hop is no
 * better than just hitting Adzuna).
 *
 * Server-side only — uses fetch with redirect: 'follow' and reads the
 * final response.url. Times out at 4 s per URL so a slow tracker can't
 * stall the agent route.
 */

const AGGREGATOR_HOSTS_RE =
  /(adzuna|indeed|glassdoor|simplyhired|ziprecruiter|monster|jobs2careers|careerbuilder|jobspider|talentify|hireology|appcast)/i;

const ATS_HOSTS_RE =
  /(greenhouse\.io|lever\.co|workday\.com|bamboohr\.com|smartrecruiters\.com|icims\.com|ashbyhq\.com|applytojob\.com|jobvite\.com|breezy\.hr|teamtailor\.com|recruiterbox\.com|jazzhr\.com|workable\.com|recruitee\.com|personio\.com|wd\d+\.myworkday\.com|myworkdayjobs\.com|taleo\.net|brassring\.com|kenexa\.com|successfactors\.com|silkroad\.com|ultipro\.com|adp\.com|paylocity\.com)/i;

export interface ChasedUrl {
  resolved: string;       // final URL after redirect chain
  isAggregator: boolean;  // true if final URL is on a job-board host
  isAts: boolean;         // true if final URL is on a known ATS host
}

/**
 * Follow the redirect chain on an Adzuna-style tracking URL and return the
 * final destination. Returns null on network failure or timeout.
 */
async function followRedirect(url: string, timeoutMs = 4000): Promise<string | null> {
  try {
    const ac = new AbortController();
    const t  = setTimeout(() => ac.abort(), timeoutMs);
    const res = await fetch(url, {
      method:   "GET",
      redirect: "follow",
      signal:   ac.signal,
      // Some ATS hosts reject default fetch UA — pretend to be a normal browser
      headers: {
        "User-Agent":      "Mozilla/5.0 (compatible; iCareerOSBot/1.0)",
        "Accept":          "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    clearTimeout(t);
    return res.url || url;
  } catch {
    return null;
  }
}

export async function chaseApplyUrl(adzunaUrl: string): Promise<ChasedUrl | null> {
  const final = await followRedirect(adzunaUrl);
  if (!final) return null;
  let host = "";
  try { host = new URL(final).hostname.toLowerCase(); } catch { return null; }
  return {
    resolved:     final,
    isAggregator: AGGREGATOR_HOSTS_RE.test(host),
    isAts:        ATS_HOSTS_RE.test(host),
  };
}

/**
 * Run chaseApplyUrl across many opportunities in parallel with a per-call
 * timeout. Sets `apply_url_company` to the chased URL when it lands on an
 * ATS or a non-aggregator company site. Falls back to the description-based
 * resolver value or null otherwise.
 *
 * Bound concurrency: 8 parallel chases (Vercel function timeout is 10 s,
 * each chase 4 s, 8 in flight = ~5 s wall time for 24 jobs).
 */
export async function chaseApplyUrlsBatch<
  T extends { url?: string | null; apply_url_company?: string | null }
>(jobs: T[]): Promise<T[]> {
  const CONCURRENCY = 8;
  const out: T[] = [...jobs];
  let next = 0;

  async function worker() {
    while (next < jobs.length) {
      const i = next++;
      const job = out[i];
      const startUrl = job.url;
      if (!startUrl) continue;

      const chased = await chaseApplyUrl(startUrl);
      if (!chased) continue;

      // If the chase landed on a real company page or ATS, that's the apply URL.
      // If it landed on an aggregator, keep whatever the resolver found (or null).
      if (!chased.isAggregator) {
        out[i] = { ...job, apply_url_company: chased.resolved };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, worker));
  return out;
}
