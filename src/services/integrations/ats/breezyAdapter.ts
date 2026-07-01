/**
 * iCareerOS — Breezy HR ATS Adapter (feat/jobs-ats-aggregation Phase 1A)
 *
 * Breezy exposes a per-tenant /json endpoint. In practice it 302-redirects
 * to an HTML page for many tenants, so the adapter follows redirects and
 * only accepts JSON responses. Never throws.
 */
import type { OpportunityResult, OpportunitySearchFilters } from "@/services/opportunityTypes";
import { BREEZY_COMPANIES, type AtsCompany } from "./companyList";

const FETCH_TIMEOUT_MS = 6000;

interface BreezyPosition {
  _id?:         string;
  name?:        string;
  location?:    { name?: string; city?: string; state?: string; country?: string; is_remote?: boolean };
  description?: string;
  url?:         string;
  application_url?: string;
  published_date?: string;
  type?:        string;
  department?:  { name?: string };
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "iCareerOS/1.0" },
      signal: ctl.signal,
      redirect: "follow",
    });
    clearTimeout(t);
    if (!res.ok) return null;
    // Only accept a JSON body — many tenants 302 to an HTML page.
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("application/json")) return null;
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
  const positions = (await fetchJson<BreezyPosition[]>(
    `https://${encodeURIComponent(company.slug)}.breezy.hr/json`,
  )) ?? [];
  const out: OpportunityResult[] = [];
  for (const p of positions) {
    const title = (p.name || "").trim();
    const desc  = stripHtml(p.description || "");
    if (!title) continue;
    if (!matchesQuery(`${title} ${desc}`, query)) continue;
    const loc = p.location;
    out.push({
      id:           `breezy-${company.slug}-${p._id ?? title}`,
      title,
      company:      company.name,
      location:     loc ? [loc.city ?? loc.name, loc.state, loc.country].filter(Boolean).join(", ") : "",
      type:         (p.type || "").trim(),
      description:  desc,
      url:          p.url ?? p.application_url ?? "",
      matchReason:  "",
      source:       "breezy",
      first_seen_at: p.published_date,
      is_remote:    !!loc?.is_remote,
    });
  }
  return out;
}

export async function searchBreezy(filters: OpportunitySearchFilters): Promise<OpportunityResult[]> {
  if (BREEZY_COMPANIES.length === 0) return [];
  const q = (filters.query || "").trim();
  const results = await Promise.allSettled(
    BREEZY_COMPANIES.map(c => searchOneTenant(c, q))
  );
  const flat: OpportunityResult[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") flat.push(...r.value);
  }
  return flat;
}
