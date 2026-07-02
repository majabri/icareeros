/**
 * feat/jobs-search-db (Task 3) — DB-first adapter.
 *
 * Queries the `public.ats_jobs` table populated by the ingest-ats-direct
 * edge function (~every 4h). Returns fresh, quality-gated results in one
 * DB roundtrip instead of fanning out to 60+ live ATS endpoints.
 *
 * Design contract (parallel to the other adapters in this folder):
 *   - Never throws. On any Supabase error, returns { opportunities: [] }.
 *   - Applies keyword filter via websearch_to_tsquery on title (indexed).
 *   - Client-side re-filters description as a fallback if the tsquery
 *     misses (matches how the live adapters filter).
 *   - Rows map 1:1 from ats_jobs columns to OpportunityResult fields.
 *   - Uses the anon client because the aggregator runs under user auth
 *     and RLS on ats_jobs is open-read.
 */

import { createClient } from "@/lib/supabase";
import type { OpportunityResult, OpportunitySearchFilters } from "@/services/opportunityTypes";
import { isValidApplyUrl } from "./applyUrlValidator";

export interface DatabaseSearchResult {
  opportunities: OpportunityResult[];
  fallback:      boolean;
  /** Max last_seen_at across returned rows — surfaces freshness on the page. */
  freshestAt:    string | null;
  /** Per-source count for the sources indicator. */
  perSource:     Record<string, number>;
}

interface AtsJobRow {
  id:               string;
  source:           string;
  external_id:      string | null;
  company:          string;
  title:            string;
  location:         string | null;
  description:      string | null;
  apply_url:        string;
  salary_min:       number | null;
  salary_max:       number | null;
  salary_currency:  string | null;
  department:       string | null;
  employment_type:  string | null;
  remote:           boolean | null;
  posted_at:        string | null;
  last_seen_at:     string | null;
}

function rowToOpportunity(row: AtsJobRow): OpportunityResult {
  return {
    id:              `ats-${row.source}-${row.id}`,
    title:           row.title,
    company:         row.company,
    location:        row.location ?? "",
    type:            row.employment_type ?? "",
    description:     row.description ?? "",
    url:             row.apply_url,
    matchReason:     "",
    salary_min:      row.salary_min,
    salary_max:      row.salary_max,
    salary_currency: row.salary_currency,
    is_remote:       !!row.remote,
    source:          row.source,
    first_seen_at:   row.posted_at ?? row.last_seen_at ?? undefined,
  };
}

/**
 * Fan-in adapter for the ats_jobs table. Filters, orders by recency, and
 * caps at 200 rows (enough for pagination + dedupe headroom).
 */
export async function searchFromDatabase(
  filters: OpportunitySearchFilters,
  limit = 200,
): Promise<DatabaseSearchResult> {
  const empty: DatabaseSearchResult = { opportunities: [], fallback: true, freshestAt: null, perSource: {} };
  try {
    const supabase = createClient();
    let q = supabase
      .from("ats_jobs")
      .select("id, source, external_id, company, title, location, description, apply_url, salary_min, salary_max, salary_currency, department, employment_type, remote, posted_at, last_seen_at")
      .eq("is_active", true)
      .order("posted_at", { ascending: false, nullsFirst: false })
      .limit(Math.min(200, Math.max(1, limit)));

    // Postgres websearch tsquery on title. Cheap + indexed via the
    // job_postings_title_idx GIN index the migration created.
    const query = (filters.query || "").trim();
    if (query) {
      q = q.textSearch("title", query, { type: "websearch", config: "english" });
    }
    const location = (filters.location || "").trim();
    if (location && location.toLowerCase() !== "remote") {
      q = q.ilike("location", `%${location}%`);
    }
    // Some callers pass 'remote' as the location. Map to the boolean column.
    if (location.toLowerCase() === "remote") {
      q = q.eq("remote", true);
    }

    const { data, error } = await q;
    if (error) return empty;
    const rows = (data ?? []) as AtsJobRow[];

    // Client-side keyword fallback — catches jobs that match the query in
    // description but not title. Cheap because we only query when the FTS
    // returned 0 rows.
    let matched = rows;
    if (query && rows.length < 5) {
      const supabase2 = createClient();
      const { data: descRows } = await supabase2
        .from("ats_jobs")
        .select("id, source, external_id, company, title, location, description, apply_url, salary_min, salary_max, salary_currency, department, employment_type, remote, posted_at, last_seen_at")
        .eq("is_active", true)
        .ilike("description", `%${query}%`)
        .order("posted_at", { ascending: false, nullsFirst: false })
        .limit(50);
      if (descRows && descRows.length > 0) {
        const seen = new Set(rows.map(r => r.id));
        for (const r of (descRows as AtsJobRow[])) {
          if (!seen.has(r.id)) matched.push(r);
        }
      }
    }

    if (matched.length === 0) return empty;

    // fix/jobs-ux-feedback Fix 3 — filter rows whose apply_url looks
    // like a company-level career page rather than a specific posting.
    const opportunities = matched
      .filter(r => isValidApplyUrl(r.apply_url))
      .map(rowToOpportunity);
    const perSource: Record<string, number> = {};
    let freshestAt: string | null = null;
    for (const r of matched) {
      perSource[r.source] = (perSource[r.source] ?? 0) + 1;
      if (r.last_seen_at && (!freshestAt || r.last_seen_at > freshestAt)) {
        freshestAt = r.last_seen_at;
      }
    }
    return {
      opportunities,
      fallback: false,
      freshestAt,
      perSource,
    };
  } catch {
    return empty;
  }
}
