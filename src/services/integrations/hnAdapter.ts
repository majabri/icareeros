/**
 * iCareerOS — Hacker News "Who is Hiring?" adapter
 *
 * Brief: feat/jobs-intelligence-suite Task 6.
 *
 * 1. Find the latest "Ask HN: Who is hiring?" thread via the Algolia search API.
 * 2. Fetch its top-level comments via the HN Firebase API.
 * 3. Heuristically parse each comment into an Opportunity (company, role,
 *    location, remote-status, description, apply URL).
 * 4. Filter to comments matching the query (job title keyword).
 *
 * The HN thread itself is unstructured English so the parser is permissive:
 * we look for "Company | Role | Location" patterns and bare URLs. Comments
 * without a usable URL OR description ≥300 chars get dropped (the
 * quality gate will reject them anyway).
 */

import type { OpportunityResult, OpportunitySearchFilters } from "@/services/opportunityTypes";

const HN_ALGOLIA = "https://hn.algolia.com/api/v1";
const HN_FIREBASE = "https://hacker-news.firebaseio.com/v0";
const FETCH_TIMEOUT_MS = 8000;
const MAX_COMMENTS_TO_PARSE = 200;

interface AlgoliaSearchResult {
  hits?: Array<{ objectID: string; title?: string; story_text?: string; created_at?: string }>;
}

interface HNItem {
  id: number;
  by?: string;
  type?: string;
  text?: string;
  time?: number;
  kids?: number[];
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

async function findLatestWhoIsHiringThreadId(): Promise<number | null> {
  // Algolia search for the most recent "Who is hiring" Ask HN.
  const url = `${HN_ALGOLIA}/search?query=Ask+HN+Who+is+hiring&tags=story&hitsPerPage=5`;
  const data = await fetchJson<AlgoliaSearchResult>(url);
  if (!data?.hits?.length) return null;
  // Prefer hits whose title starts with the canonical phrasing.
  const ranked = [...data.hits].sort((a, b) => {
    const aGood = /^Ask HN: Who is hiring/i.test(a.title ?? "");
    const bGood = /^Ask HN: Who is hiring/i.test(b.title ?? "");
    if (aGood !== bGood) return aGood ? -1 : 1;
    return 0;
  });
  return Number(ranked[0].objectID);
}

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/\s+/g, " ")
    .trim();
}

function extractUrl(text: string): string | undefined {
  const m = text.match(/https?:\/\/[^\s<>"')]+/i);
  return m ? m[0] : undefined;
}

function parseCompanyRole(firstLine: string): { company: string; title: string; location: string; isRemote: boolean } {
  // Common patterns:
  //   "Company | Role | Location"
  //   "Company (Location) | Role"
  //   "Role at Company"
  //   "Company: Role - Location"
  const parts = firstLine.split(/\s*[|·]\s*/).map((s) => s.trim());
  let company = "", title = "", location = "";
  if (parts.length >= 2) {
    company = parts[0] || "";
    title   = parts[1] || "";
    location = parts.slice(2).join(", ");
  } else {
    const atMatch = firstLine.match(/^(.*?)\s+at\s+(.*?)(?:\s*[-–]\s*(.*))?$/i);
    if (atMatch) {
      title    = atMatch[1].trim();
      company  = atMatch[2].trim();
      location = (atMatch[3] ?? "").trim();
    } else {
      company = firstLine;
    }
  }
  // Strip surrounding parentheses' location off the company name.
  const locMatch = company.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (locMatch) {
    company  = locMatch[1].trim();
    location = location || locMatch[2].trim();
  }
  const isRemote = /\bremote\b|\bwfh\b|\bwork[- ]from[- ]home\b|\banywhere\b/i.test(firstLine);
  return { company, title, location, isRemote };
}

function commentToOpportunity(threadId: number, c: HNItem): OpportunityResult | null {
  if (!c.text) return null;
  const plain = stripHtml(c.text);
  if (plain.length < 60) return null;
  const firstLine = plain.split(/[\.\n]/)[0]?.trim() ?? "";
  const { company, title, location, isRemote } = parseCompanyRole(firstLine);
  if (!company) return null;

  const url = extractUrl(plain) || `https://news.ycombinator.com/item?id=${c.id}`;
  return {
    id:           `hn-${threadId}-${c.id}`,
    title:        title || "Hiring (see post)",
    company,
    location,
    type:         "",
    description:  plain.slice(0, 4000),
    url,
    matchReason:  "",
    source:       "hackernews",
    first_seen_at: c.time ? new Date(c.time * 1000).toISOString() : undefined,
    is_remote:    isRemote,
  };
}

export interface HNSearchResult {
  opportunities: OpportunityResult[];
  total: number;
  fallback: boolean;
}

export async function searchHackerNews(
  filters: OpportunitySearchFilters,
): Promise<HNSearchResult> {
  const threadId = await findLatestWhoIsHiringThreadId();
  if (!threadId) {
    return { opportunities: [], total: 0, fallback: true };
  }

  const thread = await fetchJson<HNItem>(`${HN_FIREBASE}/item/${threadId}.json`);
  const childIds = (thread?.kids ?? []).slice(0, MAX_COMMENTS_TO_PARSE);
  if (childIds.length === 0) {
    return { opportunities: [], total: 0, fallback: true };
  }

  const children = await Promise.allSettled(
    childIds.map((id) => fetchJson<HNItem>(`${HN_FIREBASE}/item/${id}.json`)),
  );

  const opportunities: OpportunityResult[] = [];
  for (const r of children) {
    if (r.status !== "fulfilled" || !r.value) continue;
    const opp = commentToOpportunity(threadId, r.value);
    if (!opp) continue;
    opportunities.push(opp);
  }

  // Apply title-keyword filter.
  const query = (filters.query
    || filters.targetTitles?.[0]
    || filters.skills?.[0]
    || "").trim().toLowerCase();
  const filtered = query
    ? opportunities.filter((o) =>
        `${o.title} ${o.description}`.toLowerCase().includes(query),
      )
    : opportunities;

  return {
    opportunities: filtered,
    total:         filtered.length,
    fallback:      false,
  };
}
