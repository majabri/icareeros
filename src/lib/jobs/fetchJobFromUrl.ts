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

const MAX_CHARS    = 10_000;
const FETCH_TIMEOUT = 8_000;
const UA = "Mozilla/5.0 (compatible; iCareerOS-FetchBot/1.0; +https://icareeros.com)";

export interface FetchedJob {
  ok:          true;
  source:      "greenhouse" | "lever" | "ashby" | "html";
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

export async function fetchJobFromUrl(rawUrl: string): Promise<FetchJobResult> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, error: "Invalid URL." };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, error: "Only http(s) URLs are supported." };
  }

  // Try ATS-specific fast paths first
  const gh = tryGreenhouse(url);
  if (gh) return gh.then(maybeWrap("greenhouse"));
  const lv = tryLever(url);
  if (lv) return lv.then(maybeWrap("lever"));
  const ash = tryAshby(url);
  if (ash) return ash.then(maybeWrap("ashby"));

  // Generic fallback: fetch HTML + extract text
  return fetchAndExtractHtml(url).then(maybeWrap("html"));
}

function maybeWrap<T extends Omit<FetchedJob, "source" | "ok">>(source: FetchedJob["source"]) {
  return (r: T | FetchedJobError): FetchJobResult => {
    if ("ok" in r && r.ok === false) return r;
    const j = r as T;
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
  const m = u.pathname.match(/^\/([^/]+)\/jobs\/(\d+)/);
  if (!m) return null;
  const [, org, id] = m;
  return (async () => {
    try {
      const res = await fetchWithTimeout(
        `https://boards-api.greenhouse.io/v1/boards/${org}/jobs/${id}`,
      );
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
  const m = u.pathname.match(/^\/([^/]+)\/([0-9a-f-]+)/i);
  if (!m) return null;
  const [, org, id] = m;
  return (async () => {
    try {
      const res = await fetchWithTimeout(
        `https://api.lever.co/v0/postings/${org}/${id}?mode=json`,
      );
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

// ── Ashby: jobs.ashbyhq.com/<org>/<id> — no public API, parse HTML ───────

function tryAshby(u: URL): Promise<Partial<FetchedJob> | FetchedJobError> | null {
  if (u.hostname !== "jobs.ashbyhq.com" && u.hostname !== "ashbyhq.com") return null;
  // Ashby is a SPA; the SSR'd HTML carries the job text inside a script tag
  // as `window.__APP_DATA__ = {...}`. We can pluck it out with a regex.
  return (async () => {
    try {
      const res = await fetchWithTimeout(u.toString());
      if (!res.ok) return { ok: false, error: `Ashby: HTTP ${res.status}` } as FetchedJobError;
      const html = await res.text();
      // Cheap structured extraction: look for a JSON blob containing
      // descriptionHtml or descriptionPlain.
      const titleM = html.match(/<title>([^<]+)<\/title>/i);
      const descM  = html.match(/"descriptionPlain":\s*"([^"\\]*(?:\\.[^"\\]*)*)"/);
      const locM   = html.match(/"locationName":\s*"([^"]+)"/);
      const orgM   = u.pathname.match(/^\/([^/]+)\//);
      const description = descM
        ? decodeJsonString(descM[1])
        : stripHtml(html);   // last-resort: strip the whole HTML
      return {
        title:       titleM?.[1]?.replace(/\s*\|.*$/, "").trim(),
        company:     orgM ? capitalize(orgM[1]) : undefined,
        location:    locM?.[1],
        description,
      };
    } catch (e) {
      return { ok: false, error: `Ashby fetch failed: ${(e as Error).message}` } as FetchedJobError;
    }
  })();
}

// ── Generic HTML fallback ────────────────────────────────────────────────

async function fetchAndExtractHtml(u: URL): Promise<Partial<FetchedJob> | FetchedJobError> {
  try {
    const res = await fetchWithTimeout(u.toString());
    if (!res.ok) return { ok: false, error: `Fetch: HTTP ${res.status}` };
    const html  = await res.text();
    const title = html.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim();
    return {
      title:       title?.replace(/\s*\|.*$/, ""),
      description: stripHtml(html),
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
