/**
 * iCareerOS — Pinpoint ATS Adapter (feat/jobs-ats-aggregation Phase 1A)
 *
 * Pinpoint exposes per-tenant public jobs at:
 *   GET https://{tenant}.pinpointhq.com/api/v1/jobs
 * Returns { data: Array<...> } shape. Non-existent tenants 404. Never throws.
 */
import type { OpportunityResult, OpportunitySearchFilters } from "@/services/opportunityTypes";
import { PINPOINT_COMPANIES, type AtsCompany } from "./companyList";

const FETCH_TIMEOUT_MS = 6000;

interface PinpointJobAttrs {
  title?:       string;
  location?:    string;
  remote?:      boolean;
  description?: string;
  employment_type?: string;
  posted_at?:   string;
  apply_url?:   string;
  url?:         string;
}

interface PinpointJob {
  id?:         string;
  attributes?: PinpointJobAttrs;
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

function matchesQuery(text: string, query: string): boolean {
  if (!query) return true;
  return text.toLowerCase().includes(query.trim().toLowerCase());
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

async function searchOneTenant(company: AtsCompany, query: string): Promise<OpportunityResult[]> {
  const data = await fetchJson<{ data?: PinpointJob[] }>(
    `https://${encodeURIComponent(company.slug)}.pinpointhq.com/api/v1/jobs`,
  );
  const jobs = data?.data ?? [];
  const out: OpportunityResult[] = [];
  for (const j of jobs) {
    const a = j.attributes ?? {};
    const title = (a.title || "").trim();
    const desc  = stripHtml(a.description || "");
    if (!title) continue;
    if (!matchesQuery(`${title} ${desc}`, query)) continue;
    out.push({
      id:           `pinpoint-${company.slug}-${j.id ?? title}`,
      title,
      company:      company.name,
      location:     (a.location || "").trim(),
      type:         (a.employment_type || "").trim(),
      description:  desc,
      url:          a.apply_url ?? a.url ?? "",
      matchReason:  "",
      source:       "pinpoint",
      first_seen_at: a.posted_at,
      is_remote:    !!a.remote,
    });
  }
  return out;
}

export async function searchPinpoint(filters: OpportunitySearchFilters): Promise<OpportunityResult[]> {
  if (PINPOINT_COMPANIES.length === 0) return [];
  const q = (filters.query || "").trim();
  const results = await Promise.allSettled(
    PINPOINT_COMPANIES.map(c => searchOneTenant(c, q))
  );
  const flat: OpportunityResult[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") flat.push(...r.value);
  }
  return flat;
}
