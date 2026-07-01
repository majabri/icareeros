/**
 * iCareerOS — Workable ATS Adapter (feat/jobs-ats-aggregation Phase 1A)
 *
 * Workable exposes a public widget API at:
 *   GET https://apply.workable.com/api/v1/widget/accounts/{slug}
 * which returns { jobs: Array<...>, account: {...} }.
 *
 * Empty `jobs` is common — the widget serves a minimal payload for many
 * accounts. The adapter degrades to empty results in that case; the
 * aggregator merges with other sources so this is never a hard failure.
 */
import type { OpportunityResult, OpportunitySearchFilters } from "@/services/opportunityTypes";
import { WORKABLE_COMPANIES, type AtsCompany } from "./companyList";

const FETCH_TIMEOUT_MS = 6000;

interface WorkableJob {
  id?:          string;
  title?:       string;
  location?:    { city?: string; region?: string; country?: string } | string;
  description?: string;
  shortcode?:   string;
  url?:         string;
  application_url?: string;
  created_at?:  string;
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

function locationString(loc: WorkableJob["location"]): string {
  if (!loc) return "";
  if (typeof loc === "string") return loc;
  return [loc.city, loc.region, loc.country].filter(Boolean).join(", ");
}

function matchesQuery(text: string, query: string): boolean {
  if (!query) return true;
  return text.toLowerCase().includes(query.trim().toLowerCase());
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

async function searchOneAccount(company: AtsCompany, query: string): Promise<OpportunityResult[]> {
  const data = await fetchJson<{ jobs?: WorkableJob[] }>(
    `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(company.slug)}`,
  );
  const jobs = data?.jobs ?? [];
  const out: OpportunityResult[] = [];
  for (const j of jobs) {
    const title = (j.title || "").trim();
    const desc  = stripHtml(j.description || "");
    if (!title) continue;
    if (!matchesQuery(`${title} ${desc}`, query)) continue;
    out.push({
      id:           `workable-${company.slug}-${j.id ?? j.shortcode ?? title}`,
      title,
      company:      company.name,
      location:     locationString(j.location),
      type:         "",
      description:  desc,
      url:          j.url ?? j.application_url ?? `https://apply.workable.com/${company.slug}/j/${j.shortcode ?? ""}`,
      matchReason:  "",
      source:       "workable",
      first_seen_at: j.created_at,
    });
  }
  return out;
}

/**
 * Fan out across the WORKABLE_COMPANIES list. Failures per-account are
 * silently degraded to empty via Promise.allSettled. Never throws.
 */
export async function searchWorkable(filters: OpportunitySearchFilters): Promise<OpportunityResult[]> {
  if (WORKABLE_COMPANIES.length === 0) return [];
  const q = (filters.query || "").trim();
  const results = await Promise.allSettled(
    WORKABLE_COMPANIES.map(c => searchOneAccount(c, q))
  );
  const flat: OpportunityResult[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") flat.push(...r.value);
  }
  return flat;
}
