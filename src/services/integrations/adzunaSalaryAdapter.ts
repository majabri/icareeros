/**
 * Adzuna salary-histogram adapter
 *
 * Endpoint: GET https://api.adzuna.com/v1/api/jobs/{country}/histogram
 * Docs:     https://developer.adzuna.com/docs/salary
 *
 * Given a (title, location) pair we ask Adzuna for the salary distribution
 * across matching jobs and return a (min, max) range estimated from the
 * p25 / p75 of the histogram. This is the data source the
 * /api/cron/enrich-salaries cron uses to fill in salary for ATS / WWR / RSS
 * jobs that don't expose salary in their payloads.
 *
 * Rate limits: Adzuna free tier is ~250 requests/day. The cron processes a
 * configurable batch per invocation (default 50) so we stay well under.
 */

const HISTOGRAM_BASE = "https://api.adzuna.com/v1/api/jobs";
const REQUEST_TIMEOUT = 15_000;

export type EnrichmentOutcome =
  | { ok: true;  min: number; max: number; sample_count: number }
  | { ok: false; reason: "no_data" | "fetch_error" | "config_missing" | "low_confidence"; detail?: string };

interface HistogramResponse {
  histogram?: Record<string, number>; // { "10000": 5, "20000": 23, ... }
}

export interface FetchSalaryParams {
  title:     string;
  location?: string | null;
  country?:  string;      // ISO-2 lower, default "us"
}

const MIN_SAMPLES_FOR_CONFIDENCE = 5;

/**
 * Returns a (min, max) salary range for the given title/location by reading
 * Adzuna's salary histogram and taking p25/p75. Designed to be called from
 * a cron — does NOT throw; returns a tagged `EnrichmentOutcome` so the
 * caller can audit per-row.
 */
export async function fetchSalaryRange(
  params: FetchSalaryParams,
): Promise<EnrichmentOutcome> {
  const appId  = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;
  if (!appId || !appKey) {
    return { ok: false, reason: "config_missing", detail: "ADZUNA_APP_ID / ADZUNA_APP_KEY not set" };
  }

  const country = (params.country ?? "us").toLowerCase();
  const q = new URLSearchParams({
    app_id:  appId,
    app_key: appKey,
  });
  // Title is required — Adzuna treats `what` as the keyword query.
  q.set("what", normalizeTitle(params.title));
  if (params.location && params.location.trim().length > 0) {
    q.set("location0", params.location.trim());
  }

  const url = `${HISTOGRAM_BASE}/${country}/histogram?${q}`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    const res = await fetch(url, {
      signal:  controller.signal,
      headers: { Accept: "application/json", "User-Agent": "iCareerOS-EnrichBot/1.0" },
    });
    clearTimeout(timer);

    if (!res.ok) {
      return { ok: false, reason: "fetch_error", detail: `HTTP ${res.status}` };
    }

    const payload = (await res.json()) as HistogramResponse;
    const buckets = payload.histogram ?? {};

    return computeRangeFromHistogram(buckets);
  } catch (e) {
    return { ok: false, reason: "fetch_error", detail: (e as Error).message };
  }
}

/**
 * Pure function — takes the histogram object and returns a salary range.
 * Extracted so the cron tests can exercise the math without mocking fetch.
 *
 * Strategy: each bucket key is a salary threshold (e.g. "50000" = $50K) and
 * the value is the count of matching jobs. We expand into a sorted array of
 * (threshold, count) and compute the p25 / p75 thresholds weighted by count.
 */
export function computeRangeFromHistogram(
  buckets: Record<string, number>,
): EnrichmentOutcome {
  const rows = Object.entries(buckets)
    .map(([k, v]) => ({ threshold: Number(k), count: Number(v) || 0 }))
    .filter(r => Number.isFinite(r.threshold) && r.threshold > 0 && r.count > 0)
    .sort((a, b) => a.threshold - b.threshold);

  if (rows.length === 0) {
    return { ok: false, reason: "no_data", detail: "histogram empty" };
  }

  const sample_count = rows.reduce((s, r) => s + r.count, 0);
  if (sample_count < MIN_SAMPLES_FOR_CONFIDENCE) {
    return {
      ok: false,
      reason: "low_confidence",
      detail: `only ${sample_count} matching jobs (need >= ${MIN_SAMPLES_FOR_CONFIDENCE})`,
    };
  }

  // Build a sorted "salaries" sequence we can index for percentile.
  const sorted: number[] = [];
  for (const r of rows) for (let i = 0; i < r.count; i++) sorted.push(r.threshold);
  const p = (q: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * q)))];

  const min = p(0.25);
  const max = p(0.75);

  // Sanity: if min === max (single-bucket histogram), nudge max up by 10%
  // so downstream filters can still render a range string.
  const adjustedMax = max === min ? Math.round(max * 1.1) : max;

  return { ok: true, min, max: adjustedMax, sample_count };
}

/**
 * Cleans a job title for the Adzuna `what` query.
 *
 * - Lower-cases (Adzuna is case-insensitive but a normalized form helps with
 *   our own logging and reproducibility)
 * - Removes parenthesized qualifiers like "(Remote)" or "(Senior)"
 * - Removes "Senior" / "Sr." / "Jr." / "II" / "III" levels which can over-
 *   restrict the match and produce empty histograms
 * - Trims and collapses whitespace
 *
 * Exported so tests can pin behavior.
 */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b(senior|sr\.?|junior|jr\.?|staff|principal|lead)\b\.?|\b(i{2,3}|iv|v)\b/g, " ")
    .replace(/[^\p{L}\p{N}\s+#./-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
