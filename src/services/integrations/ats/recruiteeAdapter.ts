/**
 * iCareerOS — Recruitee ATS Adapter (feat/jobs-ats-aggregation Phase 1A)
 *
 * Recruitee exposes a public per-tenant API at:
 *   GET https://{tenant}.recruitee.com/api/offers
 * which returns { offers: Array<...>, offers_total: number }.
 *
 * Non-existent tenants return 404 with a small error JSON. Never throws.
 */
import type { OpportunityResult, OpportunitySearchFilters } from "@/services/opportunityTypes";
import { RECRUITEE_COMPANIES, type AtsCompany } from "./companyList";

const FETCH_TIMEOUT_MS = 6000;

interface RecruiteeOffer {
  id?:            number;
  title?:         string;
  slug?:          string;
  location?:      string;
  city?:          string;
  country_code?:  string;
  description?:   string;
  requirements?: string;
  careers_url?:   string;
  careers_apply_url?: string;
  created_at?:    string;
  min_hours?:     number;
  max_hours?:     number;
  employment_type_code?: string;
  salary?: { min?: number; max?: number; currency?: string };
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
  const data = await fetchJson<{ offers?: RecruiteeOffer[] }>(
    `https://${encodeURIComponent(company.slug)}.recruitee.com/api/offers`,
  );
  const offers = data?.offers ?? [];
  const out: OpportunityResult[] = [];
  for (const o of offers) {
    const title = (o.title || "").trim();
    const desc  = stripHtml((o.description || "") + " " + (o.requirements || ""));
    if (!title) continue;
    if (!matchesQuery(`${title} ${desc}`, query)) continue;
    out.push({
      id:           `recruitee-${company.slug}-${o.id ?? o.slug ?? title}`,
      title,
      company:      company.name,
      location:     [o.city, o.location, o.country_code].filter(Boolean).join(", "),
      type:         (o.employment_type_code || "").trim(),
      description:  desc,
      url:          o.careers_url ?? o.careers_apply_url ?? "",
      matchReason:  "",
      source:       "recruitee",
      first_seen_at: o.created_at,
      salary_min:   o.salary?.min ?? null,
      salary_max:   o.salary?.max ?? null,
      salary_currency: o.salary?.currency ?? null,
    });
  }
  return out;
}

export async function searchRecruitee(filters: OpportunitySearchFilters): Promise<OpportunityResult[]> {
  if (RECRUITEE_COMPANIES.length === 0) return [];
  const q = (filters.query || "").trim();
  const results = await Promise.allSettled(
    RECRUITEE_COMPANIES.map(c => searchOneTenant(c, q))
  );
  const flat: OpportunityResult[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") flat.push(...r.value);
  }
  return flat;
}
