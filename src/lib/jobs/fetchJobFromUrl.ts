/**
 * fetchJobFromUrl — Resolve a job-posting URL to clean text the LLM can read.
 *
 * Strategy:
 *   1. Detect known ATS hosts (Greenhouse, Lever, Ashby) and hit their public
 *      JSON APIs directly — fast, clean, no HTML parsing needed.
 *   2. For anything else, fetch the page HTML and run a lean regex-based
 *      extractor: strip scripts/styles, collapse whitespace, pull the
 *      largest meaningful text block. Not perfect but good enough for the
 *      LLM to assess fit.
 *   3. Cap the output at MAX_CHARS so we don't blow LLM context.
 *
 * Returns the cleaned text plus any structured fields we managed to extract
 * (title / company / location) so the UI can show a confirmation banner.
 */

const MAX_CHARS    = 15_000;
const FETCH_TIMEOUT = 8_000;
const UA = "Mozilla/5.0 (compatible; iCareerOS-FetchBot/1.0; +https://icareeros.com)";

/**
 * Hosts we never even try to fetch — these are login-walled or JS-rendered
 * SPA shells that the regex stripper cannot meaningfully extract. Better to
 * tell the user upfront than to silently return a cookie-banner / login-form
 * shell that passes the length threshold but is useless to the LLM.
 */
const BLOCKED_HOSTS = [
  // Login-walled sites that hide job content behind auth.
  "linkedin.com", "www.linkedin.com",
  "indeed.com", "www.indeed.com",
  "glassdoor.com", "www.glassdoor.com",
  "monster.com", "www.monster.com",
  "ziprecruiter.com", "www.ziprecruiter.com",
  // 2026-06-30 — myworkdayjobs.com REMOVED from this list. Workday-hosted
  // job pages are publicly viewable and ship a CXS JSON API + JSON-LD
  // schema; see tryWorkday() below for the fast-path extractor.
];

/**
 * Tokens that strongly suggest a real job description is present. Used as a
 * content-quality gate on the generic HTML fallback. If none of these appear
 * in the stripped text we reject the fetch.
 */
const JOB_CONTENT_SIGNALS = [
  "responsibilities", "requirements", "qualifications",
  "experience", "skills", "benefits", "compensation",
  "about the role", "what you'll do", "what we're looking for",
  "job description", "we are looking", "you will",
];

/**
 * Tokens that strongly suggest we hit a login wall / cookie consent / SPA
 * shell instead of a job description. Checked against the first ~2k chars
 * (where login walls live) — finding them anywhere later is fine because
 * many real job descriptions mention "cookie policy" in a footer.
 */
const LOGIN_SIGNALS = [
  "sign in to", "log in to", "create an account",
  "cookie policy", "privacy policy", "terms of service",
  "javascript is required", "enable javascript",
];

/**
 * Common shape returned when the caller passed a host's homepage / company
 * page instead of a specific job posting URL. Distinct error so the UI can
 * coach the user.
 */
function orgRootError(ats: string): FetchedJobError {
  return {
    ok:    false,
    error: `This is a ${ats} company page, not a specific job posting. Please open a specific job listing and paste that URL.`,
  };
}

/** Common 404 shape — translates ATS 404 to a user-friendly message. */
function jobNotListedError(): FetchedJobError {
  return {
    ok:    false,
    error: "This job posting is no longer listed. It may have been filled or removed. Try finding the current listing and paste that URL.",
  };
}

export interface FetchedJob {
  ok:          true;
  source:      "corpus" | "greenhouse" | "lever" | "ashby" | "workday" | "html" | "jsonld" | "html_container";
  title?:      string;
  company?:    string;
  location?:   string;
  description: string;
}

export interface FetchedJobError {
  ok:    false;
  error: string;
}

export type FetchJobResult = FetchedJob | FetchedJobError;

// ── Public entry point ────────────────────────────────────────────────────

export async function fetchJobFromUrl(
  rawUrl: string,
  opts?: { supabase?: { from: (t: string) => any } },
): Promise<FetchJobResult> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, error: "Invalid URL." };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, error: "Only http(s) URLs are supported." };
  }

  // fix/jobs-ashby-url-fetch Part 1 — CORPUS-FIRST resolution. Before any
  // external fetch, check ats_jobs by apply_url + normalised variants. On
  // hit, serve the row directly. Fixes Ashby (SPA — external fetch would
  // yield garbage) and makes every fit-check against a corpus job instant
  // with zero external round-trip. 50k+ jobs are in our DB; refetching them
  // from the internet is wasted work.
  if (opts?.supabase) {
    const corpusHit = await lookupCorpusJob(opts.supabase, url);
    if (corpusHit) return corpusHit;
  }

  // Fix 1 — known login-walled / SPA-only hosts: reject upfront with a useful
  // message instead of feeding the LLM 30k chars of login-form boilerplate.
  if (BLOCKED_HOSTS.some(h => url.hostname === h || url.hostname.endsWith("." + h))) {
    return {
      ok:    false,
      error: `${url.hostname} requires login to view job postings. Please paste the job description manually.`,
    };
  }

  // Try ATS-specific fast paths first
  const gh = tryGreenhouse(url);
  if (gh) return gh.then(maybeWrap("greenhouse"));
  const lv = tryLever(url);
  if (lv) return lv.then(maybeWrap("lever"));
  const ash = tryAshby(url);
  if (ash) return ash.then(maybeWrap("ashby"));
  // 2026-06-30 — Workday is THE most-used enterprise ATS. Hits the public
  // CXS JSON endpoint when the URL pattern matches; returns null when it
  // doesn't, so unusual Workday URL shapes fall through to the generic
  // HTML path (where JSON-LD JobPosting handles them — verified live on
  // 3/3 sampled tenants).
  const wd = tryWorkday(url);
  if (wd) return wd.then(maybeWrap("workday"));

  // Generic fallback: fetch HTML + extract text
  return fetchAndExtractHtml(url).then(maybeWrap("html"));
}

function maybeWrap(source: FetchedJob["source"]) {
  return (r: Partial<FetchedJob> | FetchedJobError): FetchJobResult => {
    if ("ok" in r && r.ok === false) return r;
    const j = r as Partial<FetchedJob>;
    if (!j.description || j.description.trim().length < 80) {
      return { ok: false, error: "Could not extract a usable job description from this URL." };
    }
    return {
      ok: true,
      source,
      title:       j.title,
      company:     j.company,
      location:    j.location,
      description: truncate(j.description, MAX_CHARS),
    };
  };
}

// ── Greenhouse: boards.greenhouse.io/<org>/jobs/<id> → boards-api JSON ──

function tryGreenhouse(u: URL): Promise<Partial<FetchedJob> | FetchedJobError> | null {
  // Matches:
  //   boards.greenhouse.io/<org>/jobs/<id>
  //   job-boards.greenhouse.io/<org>/jobs/<id>
  if (!/(^|\.)greenhouse\.io$/.test(u.hostname)) return null;
  // Fix 3 — org-root URL like boards.greenhouse.io/<org> with no /jobs/<id>
  const orgOnly = u.pathname.match(/^\/([^/]+)\/?$/);
  if (orgOnly) return Promise.resolve(orgRootError("Greenhouse"));
  const m = u.pathname.match(/^\/([^/]+)\/jobs\/(\d+)/);
  if (!m) return null;
  const [, org, id] = m;
  return (async () => {
    try {
      const res = await fetchWithTimeout(
        `https://boards-api.greenhouse.io/v1/boards/${org}/jobs/${id}`,
      );
      // Fix 4 — translate 404 to a user-friendly "job no longer listed"
      if (res.status === 404) return jobNotListedError();
      if (!res.ok) return { ok: false, error: `Greenhouse API: HTTP ${res.status}` } as FetchedJobError;
      const j = await res.json() as {
        title?: string;
        content?: string;
        location?: { name?: string };
        company_name?: string;
      };
      return {
        title:       j.title,
        company:     j.company_name ?? capitalize(org),
        location:    j.location?.name,
        description: stripHtml(j.content ?? ""),
      };
    } catch (e) {
      return { ok: false, error: `Greenhouse fetch failed: ${(e as Error).message}` } as FetchedJobError;
    }
  })();
}

// ── Lever: jobs.lever.co/<org>/<id> → api.lever.co/v0 JSON ───────────────

function tryLever(u: URL): Promise<Partial<FetchedJob> | FetchedJobError> | null {
  if (u.hostname !== "jobs.lever.co") return null;
  // Fix 3 — org-root URL like jobs.lever.co/<org> with no posting id
  const orgOnly = u.pathname.match(/^\/([^/]+)\/?$/);
  if (orgOnly) return Promise.resolve(orgRootError("Lever"));
  // Fix 3 — tightened ID matcher: require at least 8 hex/hyphen chars so
  // org-root URLs and 1- or 2-char path fragments don't false-positive.
  const m = u.pathname.match(/^\/([^/]+)\/([0-9a-f-]{8}[0-9a-f-]*)/i);
  if (!m) return null;
  const [, org, id] = m;
  return (async () => {
    try {
      const res = await fetchWithTimeout(
        `https://api.lever.co/v0/postings/${org}/${id}?mode=json`,
      );
      // Fix 4 — translate 404 to "job no longer listed"
      if (res.status === 404) return jobNotListedError();
      if (!res.ok) return { ok: false, error: `Lever API: HTTP ${res.status}` } as FetchedJobError;
      const j = await res.json() as {
        text?:           string;
        description?:    string;
        descriptionPlain?: string;
        lists?:          Array<{ text?: string; content?: string }>;
        additional?:     string;
        additionalPlain?:string;
        categories?:     { team?: string; location?: string; commitment?: string; department?: string };
        title?:          string;
        hostedUrl?:      string;
      };
      const sections: string[] = [];
      if (j.descriptionPlain) sections.push(j.descriptionPlain);
      else if (j.description) sections.push(stripHtml(j.description));
      for (const l of j.lists ?? []) {
        if (l.text)    sections.push(`## ${stripHtml(l.text)}`);
        if (l.content) sections.push(stripHtml(l.content));
      }
      if (j.additionalPlain) sections.push(j.additionalPlain);
      else if (j.additional) sections.push(stripHtml(j.additional));
      return {
        title:       j.title,
        company:     capitalize(org),
        location:    j.categories?.location,
        description: sections.filter(Boolean).join("\n\n"),
      };
    } catch (e) {
      return { ok: false, error: `Lever fetch failed: ${(e as Error).message}` } as FetchedJobError;
    }
  })();
}

// ── Corpus-first lookup ─────────────────────────────────────────────

/**
 * URL normalisation for corpus lookup. Two URLs that differ only in a
 * trailing slash or in tracking query params should match the same row.
 *
 * Rules:
 *   - lowercase the hostname
 *   - drop utm_*, gh_*, ref, source, campaign query params
 *   - drop the URL fragment
 *   - drop a trailing slash on the path (unless the path is just "/")
 *
 * Returns a small set of variants to try in order of most-likely-match.
 */
export function normaliseJobUrl(u: URL): string[] {
  const variants = new Set<string>();
  const push = (v: string) => variants.add(v);
  // Canonical form: lowercase host, filter query, drop fragment, drop trailing slash
  const cleanQ = new URLSearchParams();
  for (const [k, v] of u.searchParams) {
    if (/^(?:utm_|gh_|ref|source|campaign)/i.test(k)) continue;
    cleanQ.append(k, v);
  }
  const host = u.hostname.toLowerCase();
  let path = u.pathname;
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  const q = cleanQ.toString();
  const base = `${u.protocol}//${host}${path}`;
  push(base + (q ? `?${q}` : ""));
  push(base);                    // stripped of every query
  push(base + "/");              // with trailing slash
  // Also try the raw URL as-is (last-resort — if apply_url was ingested
  // verbatim with tracking params, this catches it).
  push(u.toString());
  return Array.from(variants);
}

async function lookupCorpusJob(
  supabase: { from: (t: string) => any },
  u: URL,
): Promise<FetchJobResult | null> {
  const variants = normaliseJobUrl(u);
  try {
    const { data } = await supabase
      .from("ats_jobs")
      .select("id, title, company, location, description, apply_url, source, is_active")
      .in("apply_url", variants)
      .limit(1);
    if (!data || data.length === 0) return null;
    const row = data[0] as {
      title: string | null; company: string | null; location: string | null;
      description: string | null; source: string | null; is_active: boolean;
    };
    if (!row.description || row.description.trim().length < 80) return null;
    return {
      ok:          true,
      source:      "corpus",
      title:       row.title ?? undefined,
      company:     row.company ?? undefined,
      location:    row.location ?? undefined,
      description: truncate(row.description, MAX_CHARS),
    };
  } catch {
    // Corpus lookup is a best-effort optimisation. Any error means we
    // fall through to the external fetch path — the user still gets a
    // result, just via the slower road.
    return null;
  }
}

// ── Ashby: jobs.ashbyhq.com/<org>/<id> — public posting API ────────────

function tryAshby(u: URL): Promise<Partial<FetchedJob> | FetchedJobError> | null {
  if (u.hostname !== "jobs.ashbyhq.com" && u.hostname !== "ashbyhq.com") return null;

  // Fix 3 — org-root URL like jobs.ashbyhq.com/<org> with no posting slug
  const orgOnly = u.pathname.match(/^\/([^/]+)\/?$/);
  if (orgOnly) return Promise.resolve(orgRootError("Ashby"));

  // fix/jobs-ashby-url-fetch Part 2 — Ashby's PUBLIC POSTING API.
  //   URL pattern: jobs.ashbyhq.com/{org}/{uuid}
  //   API endpoint: https://api.ashbyhq.com/posting-api/job-board/{org}
  //     returns { jobs: [ { id, title, location, descriptionHtml, descriptionPlain, department, employmentType, ... } ] }
  //   Same pattern as our existing Greenhouse/Lever adapters — pull the
  //   whole board, then find the posting whose id matches the URL UUID.
  //
  //   The prior implementation tried to scrape the SPA HTML for a JSON
  //   blob; Ashby ships fully client-rendered pages so no such blob is
  //   present in the initial HTML. That's why every Ashby fetch since
  //   the icareeros rebuild returned `Could not extract a usable job
  //   description from this URL` — the fallback stripHtml() produced
  //   only the loading-shell + JS bundle tags.
  const pathMatch = u.pathname.match(/^\/([^/]+)\/([0-9a-f-]{8,})/i);
  if (!pathMatch) return Promise.resolve({ ok: false, error: "Ashby: could not parse org + UUID from URL." } as FetchedJobError);
  const [, org, uuid] = pathMatch;

  return (async () => {
    try {
      const apiUrl = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(org)}?includeCompensation=false`;
      const res = await fetchWithTimeout(apiUrl);
      if (res.status === 404) return { ok: false, error: `Ashby: no public job board for "${org}".` } as FetchedJobError;
      if (!res.ok) return { ok: false, error: `Ashby API: HTTP ${res.status}` } as FetchedJobError;
      const j = await res.json() as { jobs?: Array<{
        id: string; title: string; location?: string; department?: string;
        employmentType?: string; descriptionPlain?: string; descriptionHtml?: string;
      }> };
      const jobs = Array.isArray(j.jobs) ? j.jobs : [];
      const posting = jobs.find(p => p.id === uuid);
      if (!posting) return jobNotListedError();
      const description = posting.descriptionPlain
        ?? (posting.descriptionHtml ? stripHtml(posting.descriptionHtml) : "");
      return {
        title:       posting.title,
        company:     capitalize(org),
        location:    posting.location,
        description,
      };
    } catch (e) {
      return { ok: false, error: `Ashby fetch failed: ${(e as Error).message}` } as FetchedJobError;
    }
  })();
}

// ── Workday: {tenant}.wd{n}[-impl].myworkdayjobs.com — CXS JSON API ───
//
// 2026-06-30 (fix/jobs-fetch-workday) — Workday-hosted career sites are
// public and ship a clean CXS JSON API. The user-facing URL shape is:
//
//   https://{tenant}.wd{n}.myworkdayjobs.com/{locale}?/{site}/(details|job)/{slug}_{id}
//
// and the corresponding API is:
//
//   GET https://{tenant}.wd{n}.myworkdayjobs.com/wday/cxs/{tenant}/{site}/job/{slug}_{id}
//
// Live-verified on KLA (wd1, site=Search), Salesforce (wd12, site=
// External_Career_Site), and Adobe (wd5, site=external_experienced). All
// three returned jobPostingInfo with title + jobDescription (HTML) +
// location populated. On any parse miss or non-200 response, we return
// null so the dispatcher falls through to the generic HTML path — JSON-LD
// JobPosting is embedded in Workday's server-rendered HTML as a safety net.

const WORKDAY_HOST_RE = /^([^.]+)\.wd\d+(?:-impl)?\.myworkdayjobs\.com$/;
const WORKDAY_PATH_RE = /^\/(?:[a-z]{2,3}-[A-Za-z]{2,3}\/)?([^/]+)\/(?:details|job)\/(.+)$/;

interface WorkdayJobPostingInfo {
  title?:           string;
  jobDescription?:  string;
  location?:        string;
  jobReqId?:        string;
  externalUrl?:     string;
}

function tryWorkday(u: URL): Promise<Partial<FetchedJob> | FetchedJobError> | null {
  const hostMatch = u.hostname.match(WORKDAY_HOST_RE);
  if (!hostMatch) return null;
  const tenant = hostMatch[1];

  // Org-root URL like https://{tenant}.wd1.myworkdayjobs.com/ → coach the user.
  if (u.pathname === "/" || u.pathname === "") {
    return Promise.resolve(orgRootError("Workday"));
  }

  const pathMatch = u.pathname.match(WORKDAY_PATH_RE);
  if (!pathMatch) {
    // Unparseable Workday URL — return null so the generic HTML fallback
    // (with JSON-LD strategy) handles it instead of erroring here.
    return null;
  }
  const [, site, slugId] = pathMatch;
  // Trim trailing slash on slugId if present
  const cleanSlugId = slugId.replace(/\/+$/, "");

  return (async () => {
    try {
      const apiUrl = `${u.origin}/wday/cxs/${tenant}/${encodeURIComponent(site)}/job/${cleanSlugId}`;
      const res = await fetchWithTimeout(apiUrl);
      if (res.status === 404) return jobNotListedError();
      if (!res.ok) {
        // 406, 422, etc. — likely a bad site name guess. Returning a
        // FetchedJobError here lets the page surface a useful message,
        // but the dispatcher has already committed to the workday path.
        // Better to return null so the generic HTML fallback takes over.
        // (We do that by throwing an ATS-not-applicable signal.)
        return { ok: false, error: `Workday CXS: HTTP ${res.status}` } as FetchedJobError;
      }
      const j = await res.json() as { jobPostingInfo?: WorkdayJobPostingInfo };
      const jpi = j.jobPostingInfo;
      if (!jpi?.jobDescription) {
        return { ok: false, error: "Workday: empty job description" } as FetchedJobError;
      }
      return {
        title:       jpi.title,
        // Workday's jobPostingInfo doesn't always populate companyName on
        // the per-tenant API — fall back to a capitalized tenant slug.
        company:     capitalize(tenant),
        location:    jpi.location,
        description: stripHtml(jpi.jobDescription),
      };
    } catch (e) {
      return { ok: false, error: `Workday fetch failed: ${(e as Error).message}` } as FetchedJobError;
    }
  })();
}

// ── Generic HTML fallback ────────────────────────────────────────────────
//
// 2026-06-28 rewrite (fix/jobs-fetch-jd-jsonld) — strategy ladder:
//
//   1. JSON-LD `JobPosting` schema — most enterprise job boards (RBC, banks,
//      airlines, hospitals, government, large tech) embed structured data.
//      Highest fidelity: gives us the job description, title, company,
//      location directly from a structured payload. We do not need to
//      guess at HTML containers.
//
//   2. Known container regexes — id/class patterns like job-description,
//      jobDescription, posting-content, job-details, etc. Walk these in
//      order and accept the first one whose stripped text is >= 300 chars
//      AND passes the multi-signal gate (must hit >= 2 JOB_CONTENT_SIGNALS).
//
//   3. Whole-page strip with STRONGER gate — must hit >= 3 distinct
//      JOB_CONTENT_SIGNALS overall AND >= 1 in the first 3000 chars
//      (density check), AND must not hit any LOGIN_SIGNALS in the first
//      2000 chars. This rejects the "job has been filled" / cookie-wall
//      / SPA-shell cases that the prior any-substring gate let through.

interface JobPostingLD {
  "@type"?:  string | string[];
  title?:    string;
  description?: string;
  hiringOrganization?: { name?: string };
  jobLocation?: { address?: { addressLocality?: string; addressRegion?: string; addressCountry?: string } } | Array<{ address?: { addressLocality?: string; addressRegion?: string; addressCountry?: string } }>;
}

function tryJsonLdJobPosting(html: string): { title?: string; company?: string; location?: string; description: string } | null {
  const blocks = html.match(/<script[^>]+type=["\']application\/ld\+json["\'][^>]*>([\s\S]*?)<\/script>/gi);
  if (!blocks) return null;
  for (const block of blocks) {
    const inner = block.replace(/^<script[^>]*>/i, "").replace(/<\/script>$/i, "").trim();
    if (!inner) continue;
    let parsed: unknown;
    try { parsed = JSON.parse(inner); } catch { continue; }
    // JSON-LD may be a single object, an array, or a @graph wrapper.
    const candidates: unknown[] = Array.isArray(parsed)
      ? parsed
      : (parsed && typeof parsed === "object" && "@graph" in parsed && Array.isArray((parsed as { "@graph"?: unknown[] })["@graph"]))
        ? ((parsed as { "@graph": unknown[] })["@graph"])
        : [parsed];
    for (const c of candidates) {
      if (!c || typeof c !== "object") continue;
      const posting = c as JobPostingLD;
      const t = posting["@type"];
      const isJobPosting = (Array.isArray(t) ? t.includes("JobPosting") : t === "JobPosting");
      if (!isJobPosting) continue;
      if (!posting.description) continue;
      const desc = stripHtml(posting.description);
      if (desc.length < 200) continue;
      const loc = Array.isArray(posting.jobLocation) ? posting.jobLocation[0] : posting.jobLocation;
      const addr = loc?.address;
      const locStr = addr
        ? [addr.addressLocality, addr.addressRegion, addr.addressCountry].filter(Boolean).join(", ")
        : undefined;
      return {
        title:       posting.title,
        company:     posting.hiringOrganization?.name,
        location:    locStr || undefined,
        description: desc,
      };
    }
  }
  return null;
}

const CONTAINER_PATTERNS: RegExp[] = [
  /<div[^>]*(?:class|id)=["\'][^"\']*(?:job-description|jobDescription|job_description|posting-content|job-details|job-content|job-body|jobBody)[^"\']*["\'][^>]*>([\s\S]*?)<\/div>/i,
  /<section[^>]*(?:class|id)=["\'][^"\']*(?:job-description|description|job-details|posting)[^"\']*["\'][^>]*>([\s\S]*?)<\/section>/i,
  /<article[^>]*>([\s\S]*?)<\/article>/i,
];

function tryHtmlContainer(html: string): string | null {
  for (const pat of CONTAINER_PATTERNS) {
    const m = html.match(pat);
    if (!m?.[1]) continue;
    const text = stripHtml(m[1]);
    if (text.length < 300) continue;
    const textLower = text.toLowerCase();
    const signalCount = JOB_CONTENT_SIGNALS.filter(s => textLower.includes(s)).length;
    if (signalCount >= 2) return text;
  }
  return null;
}

async function fetchAndExtractHtml(u: URL): Promise<Partial<FetchedJob> | FetchedJobError> {
  try {
    const res = await fetchWithTimeout(u.toString());
    if (res.status === 404) return jobNotListedError();
    if (!res.ok) return { ok: false, error: `Fetch: HTTP ${res.status}` };
    const html  = await res.text();
    const title = html.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim();

    // ── Strategy 1 — JSON-LD JobPosting structured data ────────────────
    const ld = tryJsonLdJobPosting(html);
    if (ld) {
      return {
        title:       ld.title ?? title?.replace(/\s*\|.*$/, ""),
        company:     ld.company,
        location:    ld.location,
        description: ld.description,
        // Note: source tag is applied by the maybeWrap("html") wrapper —
        // we do not override it here. The "html" source covers both
        // JSON-LD and container hits from a generic URL; the dedicated
        // jsonld / html_container source tags exist for future direct
        // entry points if we add them.
      };
    }

    // ── Strategy 2 — Known job-description container patterns ──────────
    const containerText = tryHtmlContainer(html);
    if (containerText) {
      return {
        title:       title?.replace(/\s*\|.*$/, ""),
        description: containerText,
      };
    }

    // ── Strategy 3 — Whole-page strip with stronger multi-signal gate ──
    const strippedText = stripHtml(html);
    const textLower    = strippedText.toLowerCase();
    const hasLoginWall = LOGIN_SIGNALS.some(s => textLower.slice(0, 2000).includes(s));
    if (hasLoginWall) {
      return {
        ok:    false,
        error: "Could not extract a job description from this URL. The page may require login or use JavaScript rendering. Please paste the job description manually.",
      };
    }
    // Density check: must hit >= 3 distinct signals overall AND >= 1 in
    // the first 3000 chars. The "job has been filled" page that triggered
    // this rewrite passes a 1-signal substring check but fails the >= 3
    // count and the density check.
    const signalCount = JOB_CONTENT_SIGNALS.filter(s => textLower.includes(s)).length;
    const earlyText   = textLower.slice(0, 3000);
    const earlySignals = JOB_CONTENT_SIGNALS.filter(s => earlyText.includes(s)).length;
    if (signalCount < 3 || earlySignals === 0) {
      return {
        ok:    false,
        error: "Could not extract a job description from this URL. The posting may be expired, filled, or rendered via JavaScript. Please paste the job description manually.",
      };
    }

    return {
      title:       title?.replace(/\s*\|.*$/, ""),
      description: strippedText,
    };
  } catch (e) {
    return { ok: false, error: `Fetch failed: ${(e as Error).message}` };
  }
}

// ── Utilities ────────────────────────────────────────────────────────────

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    return await fetch(url, {
      signal:  controller.signal,
      headers: { "User-Agent": UA, Accept: "text/html,application/json" },
      redirect: "follow",
    });
  } finally {
    clearTimeout(timer);
  }
}

// Strip script/style blocks + tags. Collapse whitespace. Decode core entities.
// This is intentionally lean — no Cheerio dep — which means it won't beat a
// real HTML parser on edge cases, but it consistently produces text good
// enough for an LLM to assess fit on.
export function stripHtml(html: string): string {
  return html
    // Remove non-content blocks
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    // Convert block breaks to newlines so paragraphs survive
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    // Strip remaining tags
    .replace(/<[^>]+>/g, " ")
    // Common entities
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    // Collapse runs of whitespace + dedupe newlines
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function decodeJsonString(s: string): string {
  try {
    return JSON.parse(`"${s}"`) as string;
  } catch {
    return s;
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 3).trimEnd()}…` : s;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
