/**
 * Sprint 2 W5-B — RSS / aggregator-JSON adapters for job discovery.
 *
 * Three sources, all license-clean for aggregation:
 *   • WeWorkRemotely — RSS, attribution-required
 *   • Remotive       — JSON API (preferred over their RSS)
 *   • HN Who-is-Hiring — via hnrss.org (community-stable for ~10y)
 *
 * Each adapter returns a normalized DiscoveredJob[]. The cron at
 * /api/cron/discover-rss fans these out, dedupes by URL hash against
 * opportunities.raw_url_hash, and inserts new rows.
 */

import { canonicalizeUrl, hashUrl } from "./canonicalize";

export interface DiscoveredJob {
  source:       "wwr_rss" | "remotive" | "hn_hiring" | "perplexity";
  source_type:  "rss" | "aggregator_api" | "llm_discovery";
  external_id:  string | null;
  title:        string;
  company:      string | null;
  description:  string | null;
  raw_url:      string;
  canonical_url: string;
  raw_url_hash: string;
  location:     string | null;
  posted_date:  string | null;   // ISO date
  raw_payload:  Record<string, unknown>;
}

/** Tiny RSS parser — extracts <item><title/link/pubDate/description/> */
export function parseRssItems(xml: string): Array<{
  title?: string; link?: string; pubDate?: string; description?: string; category?: string;
}> {
  const items: ReturnType<typeof parseRssItems> = [];
  const itemRe = /<item\b[^>]*>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml))) {
    const body = m[1];
    const grab = (tag: string): string | undefined => {
      const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
      const mm = body.match(re);
      if (!mm) return undefined;
      let s = mm[1].trim();
      s = s.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "");
      return s.trim();
    };
    items.push({
      title:       grab("title"),
      link:        grab("link"),
      pubDate:     grab("pubDate"),
      description: grab("description"),
      category:    grab("category"),
    });
  }
  return items;
}

// ── WeWorkRemotely ───────────────────────────────────────────────────────

export async function fetchWeWorkRemotely(): Promise<DiscoveredJob[]> {
  const url = "https://weworkremotely.com/remote-jobs.rss";
  const res = await fetch(url, { headers: { "User-Agent": "iCareerOS-discovery/1.0 (+https://icareeros.com)" } });
  if (!res.ok) throw new Error(`WWR fetch ${res.status}`);
  const xml = await res.text();
  const items = parseRssItems(xml);
  const out: DiscoveredJob[] = [];
  for (const it of items) {
    if (!it.link || !it.title) continue;
    const canonical = canonicalizeUrl(it.link);
    // WWR title format: "Company: Role Name"
    const split = it.title.split(":");
    const company = split.length > 1 ? split[0].trim() : null;
    const title   = split.length > 1 ? split.slice(1).join(":").trim() : it.title;
    out.push({
      source: "wwr_rss",
      source_type: "rss",
      external_id: null,
      title,
      company,
      description: it.description ?? null,
      raw_url: it.link,
      canonical_url: canonical,
      raw_url_hash: hashUrl(it.link),
      location: "Remote",
      posted_date: it.pubDate ? new Date(it.pubDate).toISOString().slice(0, 10) : null,
      raw_payload: it as Record<string, unknown>,
    });
  }
  return out;
}

// ── Remotive (JSON, preferred) ───────────────────────────────────────────

interface RemotiveJob {
  id: number;
  url: string;
  title: string;
  company_name: string;
  description: string;
  job_type: string;
  category: string;
  candidate_required_location: string;
  publication_date: string;
}

export async function fetchRemotive(): Promise<DiscoveredJob[]> {
  const url = "https://remotive.com/api/remote-jobs?limit=80";
  const res = await fetch(url, { headers: { "User-Agent": "iCareerOS-discovery/1.0" } });
  if (!res.ok) throw new Error(`Remotive fetch ${res.status}`);
  const data = await res.json() as { jobs: RemotiveJob[] };
  return (data.jobs ?? []).map(j => ({
    source: "remotive" as const,
    source_type: "aggregator_api" as const,
    external_id: `remotive-${j.id}`,
    title: j.title,
    company: j.company_name,
    description: j.description,
    raw_url: j.url,
    canonical_url: canonicalizeUrl(j.url),
    raw_url_hash: hashUrl(j.url),
    location: j.candidate_required_location || "Remote",
    posted_date: j.publication_date ? j.publication_date.slice(0, 10) : null,
    raw_payload: j as unknown as Record<string, unknown>,
  }));
}

// ── HN Who-is-Hiring (via hnrss.org) ─────────────────────────────────────

export async function fetchHnHiring(): Promise<DiscoveredJob[]> {
  const url = "https://hnrss.org/whoishiring/jobs?points=1";
  const res = await fetch(url, { headers: { "User-Agent": "iCareerOS-discovery/1.0" } });
  if (!res.ok) throw new Error(`HN fetch ${res.status}`);
  const xml = await res.text();
  const items = parseRssItems(xml);
  const out: DiscoveredJob[] = [];
  for (const it of items) {
    if (!it.link || !it.title) continue;
    // hnrss link is a comment permalink, the actual job URL is inside the description;
    // we still store the comment link so the user can read the full context.
    out.push({
      source: "hn_hiring",
      source_type: "rss",
      external_id: null,
      title: it.title,
      company: null,    // HN posts are free-form text; parsing is downstream
      description: it.description ?? null,
      raw_url: it.link,
      canonical_url: canonicalizeUrl(it.link),
      raw_url_hash: hashUrl(it.link),
      location: null,
      posted_date: it.pubDate ? new Date(it.pubDate).toISOString().slice(0, 10) : null,
      raw_payload: it as Record<string, unknown>,
    });
  }
  return out;
}
