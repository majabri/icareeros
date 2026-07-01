/**
 * iCareerOS — SmartRecruiters ATS Adapter (feat/jobs-ats-aggregation Phase 1A)
 *
 * SmartRecruiters exposes:
 *   GET https://api.smartrecruiters.com/v1/companies/{id}/postings?limit=100
 * List endpoint returns summaries. For full description we optionally fetch:
 *   GET https://api.smartrecruiters.com/v1/companies/{id}/postings/{postingId}
 *
 * The list endpoint returns a `content` array of postings. Many companies
 * expose zero postings publicly; the adapter degrades to empty in that case.
 * Never throws.
 */
import type { OpportunityResult, OpportunitySearchFilters } from "@/services/opportunityTypes";
import { SMARTRECRUITERS_COMPANIES, type AtsCompany } from "./companyList";

const FETCH_TIMEOUT_MS = 6000;

interface SRPosting {
  id?:       string;
  uuid?:     string;
  name?:     string;
  refNumber?: string;
  location?: { city?: string; region?: string; country?: string; remote?: boolean };
  jobAd?:    { sections?: { jobDescription?: { text?: string } } };
  createdOn?: string;
  releasedDate?: string;
  ref?: string;
  applyUrl?: string;
  postingUrl?: string;
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

async function searchOneCompany(company: AtsCompany, query: string): Promise<OpportunityResult[]> {
  const data = await fetchJson<{ content?: SRPosting[] }>(
    `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(company.slug)}/postings?limit=100`,
  );
  const postings = data?.content ?? [];
  const out: OpportunityResult[] = [];
  for (const p of postings) {
    const title = (p.name || "").trim();
    const desc  = stripHtml(p.jobAd?.sections?.jobDescription?.text || "");
    if (!title) continue;
    if (!matchesQuery(`${title} ${desc}`, query)) continue;
    const loc = p.location;
    out.push({
      id:           `smartrecruiters-${company.slug}-${p.id ?? p.uuid ?? title}`,
      title,
      company:      company.name,
      location:     loc ? [loc.city, loc.region, loc.country].filter(Boolean).join(", ") : "",
      type:         "",
      description:  desc,
      url:          p.postingUrl ?? p.applyUrl ?? `https://jobs.smartrecruiters.com/${company.slug}/${p.id ?? ""}`,
      matchReason:  "",
      source:       "smartrecruiters",
      first_seen_at: p.releasedDate ?? p.createdOn,
      is_remote:    !!loc?.remote,
    });
  }
  return out;
}

export async function searchSmartRecruiters(filters: OpportunitySearchFilters): Promise<OpportunityResult[]> {
  if (SMARTRECRUITERS_COMPANIES.length === 0) return [];
  const q = (filters.query || "").trim();
  const results = await Promise.allSettled(
    SMARTRECRUITERS_COMPANIES.map(c => searchOneCompany(c, q))
  );
  const flat: OpportunityResult[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") flat.push(...r.value);
  }
  return flat;
}
