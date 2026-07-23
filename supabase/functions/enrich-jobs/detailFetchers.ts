// deno-lint-ignore-file no-explicit-any
/**
 * detailFetchers — per-source JD detail-fetch adapters for the
 * description-backfill flow (issue #400).
 *
 * Design constraints (Platform 2026-07-23):
 *   - Reuse the same per-posting endpoints proven in the URL-fetch path
 *     (Greenhouse board API job detail, SmartRecruiters posting detail,
 *     Workday CXS job detail). No new endpoints, no new vendors.
 *   - Rate-pacing per adapter — conservative defaults + inter-request
 *     delays so one enrich-jobs invocation stays well inside the 60s
 *     edge-function time limit.
 *   - Per-source circuit breaker — trip after N consecutive failures,
 *     skip that source for the rest of the invocation, continue others.
 *   - Failed rows never silently skipped — status transitions honestly
 *     (per #389 status-honesty rule).
 *
 * Testing surface:
 *   - Each adapter has a `parseXxxResponse(json)` helper that's pure and
 *     tested against a fixture in __tests__/detailFetchers.test.ts.
 *   - The circuit breaker + rate pacer are pure state machines tested
 *     separately.
 */

// ─────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────

export interface AtsJobRow {
  id:          string;
  source:      string;
  external_id: string | null;
  company:    string | null;
  apply_url:   string | null;
}

export type DetailFetchResult =
  | { ok: true;  description: string; source: "greenhouse" | "smartrecruiters" | "workday" }
  | { ok: false; error: string; retryable: boolean };

// ─────────────────────────────────────────────────────────────────────
// Rate pacer
// ─────────────────────────────────────────────────────────────────────

export interface RateConfig {
  /** Milliseconds between requests to the same source. Default 250ms. */
  interRequestMs:  number;
  /** Max requests per source per invocation. Default 50. */
  maxPerInvocation: number;
}

export const DEFAULT_RATE_CONFIG: Record<string, RateConfig> = {
  greenhouse:      { interRequestMs: 250, maxPerInvocation: 50 },
  smartrecruiters: { interRequestMs: 250, maxPerInvocation: 50 },
  // Workday: some tenants require cookie state, others don't. Same rate.
  workday:         { interRequestMs: 300, maxPerInvocation: 40 },
};

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ─────────────────────────────────────────────────────────────────────
// Circuit breaker
// ─────────────────────────────────────────────────────────────────────

export interface CircuitBreakerConfig {
  /** Trip after this many consecutive failures. Default 5. */
  consecutiveFailureThreshold: number;
  /** Trip after this many total failures in one invocation. Default 15. */
  totalFailureThreshold:       number;
}

export const DEFAULT_CIRCUIT_CONFIG: CircuitBreakerConfig = {
  consecutiveFailureThreshold: 5,
  totalFailureThreshold:       15,
};

export class CircuitBreaker {
  private consecutive = 0;
  private total       = 0;
  private tripped     = false;
  constructor(private cfg: CircuitBreakerConfig = DEFAULT_CIRCUIT_CONFIG) {}

  /** Register a success. Resets consecutive counter. */
  onSuccess(): void {
    this.consecutive = 0;
  }
  /** Register a failure. Returns true if the breaker is now tripped. */
  onFailure(): boolean {
    this.consecutive++;
    this.total++;
    if (
      this.consecutive >= this.cfg.consecutiveFailureThreshold ||
      this.total       >= this.cfg.totalFailureThreshold
    ) {
      this.tripped = true;
    }
    return this.tripped;
  }
  isTripped(): boolean { return this.tripped; }
  /** For observability. */
  snapshot(): { consecutive: number; total: number; tripped: boolean } {
    return { consecutive: this.consecutive, total: this.total, tripped: this.tripped };
  }
}

// ─────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────

const FETCH_TIMEOUT_MS = 15_000;

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...(init ?? {}), signal: ctl.signal });
  } finally {
    clearTimeout(t);
  }
}

/**
 * Cheap HTML → plain-text. Same shape as ingest-ats-direct's stripHtml
 * (which is inlined). Keeps output small — the DB column has generous
 * headroom but rendering downstream is bounded by ~15KB.
 */
export function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// ─────────────────────────────────────────────────────────────────────
// Greenhouse — boards-api.greenhouse.io/v1/boards/{org}/jobs/{id}
// ─────────────────────────────────────────────────────────────────────

/**
 * Extract {org, id} from a Greenhouse apply URL.
 * Matches boards.greenhouse.io/{org}/jobs/{id} and
 *         job-boards.greenhouse.io/{org}/jobs/{id}.
 */
export function parseGreenhouseUrl(applyUrl: string): { org: string; id: string } | null {
  try {
    const u = new URL(applyUrl);
    if (!/(^|\.)greenhouse\.io$/.test(u.hostname)) return null;
    const m = u.pathname.match(/^\/([^/]+)\/jobs\/(\d+)/);
    if (!m) return null;
    return { org: m[1], id: m[2] };
  } catch { return null; }
}

/** Parse Greenhouse response body. Exported for unit-testing. */
export function parseGreenhouseResponse(body: unknown): string | null {
  const j = body as { content?: string };
  if (!j || typeof j.content !== "string") return null;
  const desc = stripHtml(j.content);
  return desc.length > 0 ? desc : null;
}

export async function fetchGreenhouseDescription(row: AtsJobRow): Promise<DetailFetchResult> {
  // Ingest writes row.company = greenhouse-board-slug and row.external_id = numeric id.
  // Use those directly — apply_url is often the company's custom careers page
  // (e.g. databricks.com/...?gh_jid=NNN), not the boards.greenhouse.io URL.
  // Falls back to parsing apply_url only if the row identity fields are absent.
  let org = row.company ?? "";
  let id  = row.external_id ?? "";
  if (!org || !id) {
    const parsed = row.apply_url ? parseGreenhouseUrl(row.apply_url) : null;
    if (!parsed) return { ok: false, error: "no identity fields and unparseable apply_url", retryable: false };
    org = parsed.org;
    id  = parsed.id;
  }
  if (!/^\d+$/.test(id)) {
    return { ok: false, error: "external_id not a Greenhouse numeric id", retryable: false };
  }
  try {
    const res = await fetchWithTimeout(
      `https://boards-api.greenhouse.io/v1/boards/${org}/jobs/${id}`,
    );
    if (res.status === 404) return { ok: false, error: "posting not found", retryable: false };
    if (res.status === 429) return { ok: false, error: "rate limited", retryable: true };
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}`, retryable: res.status >= 500 };
    const body = await res.json();
    const desc = parseGreenhouseResponse(body);
    if (!desc) return { ok: false, error: "empty description in response", retryable: false };
    return { ok: true, description: desc, source: "greenhouse" };
  } catch (e) {
    return { ok: false, error: `fetch failed: ${(e as Error).message}`, retryable: true };
  }
}

// ─────────────────────────────────────────────────────────────────────
// SmartRecruiters — api.smartrecruiters.com/v1/postings/{id}
// or api.smartrecruiters.com/v1/companies/{slug}/postings/{id}
// ─────────────────────────────────────────────────────────────────────

/**
 * SmartRecruiters external_id format from ingest-ats-direct is
 * `{slug}:{postingId}`. Returns { slug, postingId } or null.
 */
export function parseSmartRecruitersExternalId(externalId: string | null): { slug: string; postingId: string } | null {
  if (!externalId) return null;
  const m = externalId.match(/^([^:]+):([^:]+)$/);
  if (!m) return null;
  return { slug: m[1], postingId: m[2] };
}

/** Parse SmartRecruiters posting response. Exported for unit-testing. */
export function parseSmartRecruitersResponse(body: unknown): string | null {
  const p = body as { jobAd?: { sections?: { jobDescription?: { text?: string } } } };
  const text = p?.jobAd?.sections?.jobDescription?.text;
  if (typeof text !== "string") return null;
  const desc = stripHtml(text);
  return desc.length > 0 ? desc : null;
}

export async function fetchSmartRecruitersDescription(row: AtsJobRow): Promise<DetailFetchResult> {
  const parsed = parseSmartRecruitersExternalId(row.external_id);
  if (!parsed) return { ok: false, error: "external_id not in slug:id form", retryable: false };
  try {
    const res = await fetchWithTimeout(
      `https://api.smartrecruiters.com/v1/companies/${parsed.slug}/postings/${parsed.postingId}`,
    );
    if (res.status === 404) return { ok: false, error: "posting not found", retryable: false };
    if (res.status === 429) return { ok: false, error: "rate limited", retryable: true };
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}`, retryable: res.status >= 500 };
    const body = await res.json();
    const desc = parseSmartRecruitersResponse(body);
    if (!desc) return { ok: false, error: "empty description in response", retryable: false };
    return { ok: true, description: desc, source: "smartrecruiters" };
  } catch (e) {
    return { ok: false, error: `fetch failed: ${(e as Error).message}`, retryable: true };
  }
}

// ─────────────────────────────────────────────────────────────────────
// Workday — {tenant}.wd{n}[-impl].myworkdayjobs.com/wday/cxs/{tenant}/{site}/job/{slugId}
// ─────────────────────────────────────────────────────────────────────

const WORKDAY_HOST_RE = /^([^.]+)\.wd\d+(?:-impl)?\.myworkdayjobs\.com$/;
const WORKDAY_PATH_RE = /^\/(?:[a-z]{2}(?:-[A-Z]{2})?\/)?([^/]+)\/(?:details|job)\/(?:[^/]+\/)?([^?]+)/;

/**
 * Extract {origin, tenant, site, slugId} from a Workday apply URL.
 * Same pattern as tryWorkday() in src/lib/jobs/fetchJobFromUrl.ts.
 */
export function parseWorkdayUrl(applyUrl: string): { origin: string; tenant: string; site: string; slugId: string } | null {
  try {
    const u = new URL(applyUrl);
    const host = u.hostname.match(WORKDAY_HOST_RE);
    if (!host) return null;
    const tenant = host[1];
    const path = u.pathname.match(WORKDAY_PATH_RE);
    if (!path) return null;
    const [, site, slugId] = path;
    return { origin: u.origin, tenant, site, slugId: slugId.replace(/\/+$/, "") };
  } catch { return null; }
}

/** Parse Workday CXS response body. Exported for unit-testing. */
export function parseWorkdayResponse(body: unknown): string | null {
  const j = body as { jobPostingInfo?: { jobDescription?: string } };
  const html = j?.jobPostingInfo?.jobDescription;
  if (typeof html !== "string") return null;
  const desc = stripHtml(html);
  return desc.length > 0 ? desc : null;
}

export async function fetchWorkdayDescription(row: AtsJobRow): Promise<DetailFetchResult> {
  if (!row.apply_url) return { ok: false, error: "no apply_url", retryable: false };
  const parsed = parseWorkdayUrl(row.apply_url);
  if (!parsed) return { ok: false, error: "unparseable apply_url", retryable: false };
  try {
    const apiUrl = `${parsed.origin}/wday/cxs/${parsed.tenant}/${encodeURIComponent(parsed.site)}/job/${parsed.slugId}`;
    const res = await fetchWithTimeout(apiUrl);
    if (res.status === 404) return { ok: false, error: "posting not found", retryable: false };
    if (res.status === 429) return { ok: false, error: "rate limited", retryable: true };
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}`, retryable: res.status >= 500 };
    const body = await res.json();
    const desc = parseWorkdayResponse(body);
    if (!desc) return { ok: false, error: "empty description in response", retryable: false };
    return { ok: true, description: desc, source: "workday" };
  } catch (e) {
    return { ok: false, error: `fetch failed: ${(e as Error).message}`, retryable: true };
  }
}

// ─────────────────────────────────────────────────────────────────────
// Dispatcher
// ─────────────────────────────────────────────────────────────────────

export type FetcherName = "greenhouse" | "smartrecruiters" | "workday";

export function pickFetcher(source: string): { name: FetcherName; fetch: (row: AtsJobRow) => Promise<DetailFetchResult> } | null {
  switch (source) {
    case "greenhouse":      return { name: "greenhouse",      fetch: fetchGreenhouseDescription };
    case "smartrecruiters": return { name: "smartrecruiters", fetch: fetchSmartRecruitersDescription };
    case "workday":         return { name: "workday",         fetch: fetchWorkdayDescription };
    default: return null;
  }
}
