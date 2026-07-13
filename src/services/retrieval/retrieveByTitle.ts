/**
 * fix/jobs-curation-family-precision — the ONE title-relevance retrieval
 * engine that both Search and Curation use.
 *
 * Design (from docs/ANALYSIS_2026-07-06_unify_search_curation.md):
 *   Search  = retrieveByTitle([userQuery]) → rank → display
 *   Curation = retrieveByTitle(expandQueries(targetRoles)) → score → tier
 *
 * NO enrichment_status filter, NO role_families overlap, NO matchedRole
 * tag, NO score floor. The retrieval layer's only guarantee: every
 * returned row's title matches at least one of the input queries via
 * Postgres full-text search. The scoring layer (profileScorer) sits on
 * top.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { OpportunityResult } from "@/services/opportunityTypes";

const ATS_JOBS_COLS = "id, source, external_id, company, title, location, description, apply_url, direct_apply_url, salary_min, salary_max, salary_currency, employment_type, remote, posted_at, last_seen_at, extracted_skills, extracted_seniority, seniority_tier";

interface AtsJobRow {
  id: string; source: string; external_id: string | null;
  company: string; title: string; location: string | null;
  description: string | null; apply_url: string;
  direct_apply_url: string | null;
  salary_min: number | null; salary_max: number | null;
  salary_currency: string | null; employment_type: string | null;
  remote: boolean; posted_at: string | null; last_seen_at: string | null;
  extracted_skills: string[] | null; extracted_seniority: string | null;
  seniority_tier: string | null;
}

export interface Candidate extends OpportunityResult {
  /** The user-facing target title(s) this candidate was retrieved for.
   *  Populated only in queryGroups mode; a job matching multiple groups
   *  keeps every label. Empty array in flat titleQueries mode. */
  retrievedFor?: string[];
  extractedSkills?: string[];
  extractedSeniority?: string | null;
  seniorityTier?: string | null;
}

export interface RetrieveFilters {
  isActive?: boolean;
  remote?: boolean;
  location?: string;
  sources?: string[];
  seniorityBand?: string[];
  minPostedAt?: string;
}

/**
 * Two modes:
 *   - titleQueries: flat list. Runs ONE tsquery over their union.
 *   - queryGroups:  { label, queries }[]. Runs one tsquery per group in
 *                   parallel, dedupes by url, keeps every group's label
 *                   as retrievedFor on each candidate.
 */
export interface RetrieveInput {
  titleQueries?: string[];
  queryGroups?:  Array<{ label: string; queries: string[] }>;
}

/**
 * Cap on the number of phrases fed into a single tsquery. websearch_to_tsquery
 * hangs on very large disjunctions — this is the PR #354 lesson baked in.
 */
export const MAX_PHRASES_PER_TSQUERY = 15;

/**
 * Build a Postgres full-text search argument from a list of title phrases.
 * Rules:
 *   - Single phrase → return it as-is (Search's websearch mode is applied
 *     by the caller via `type: "websearch"`).
 *   - Multiple phrases → construct plain OR-joined tsquery in the form
 *     `(word & word) | (word & word) | word`.
 *   - Empty input → returns empty string; caller skips the textSearch.
 *
 * The caller decides whether to pass `type: "websearch"` (single) or
 * `type: "plain"` (multi). Exposed for tests.
 */
export function buildTsqueryArg(phrases: string[]): { arg: string; mode: "websearch" | "plain" } {
  const cleaned = phrases
    .map(p => (p ?? "").trim().toLowerCase())
    .filter(Boolean)
    .slice(0, MAX_PHRASES_PER_TSQUERY);
  if (cleaned.length === 0) return { arg: "", mode: "websearch" };
  if (cleaned.length === 1) return { arg: cleaned[0], mode: "websearch" };
  const tokensOf = (s: string) => s.split(/\s+/).filter(Boolean);
  const arg = cleaned
    .map(p => {
      const tokens = tokensOf(p);
      return tokens.length === 1 ? tokens[0] : "(" + tokens.join(" & ") + ")";
    })
    .join(" | ");
  return { arg, mode: "plain" };
}

function toCandidate(row: AtsJobRow, retrievedFor: string[] = []): Candidate {
  return {
    id:              `db-${row.id}`,
    title:           row.title,
    company:         row.company,
    location:        row.location ?? "",
    type:            row.employment_type ?? "",
    description:     row.description ?? "",
    // Prefer direct_apply_url over the raw apply_url (adapter chain preference)
    url:             row.direct_apply_url ?? row.apply_url,
    matchReason:     "",
    salary_min:      row.salary_min,
    salary_max:      row.salary_max,
    salary_currency: row.salary_currency ?? undefined,
    is_remote:       !!row.remote,
    source:          row.source,
    first_seen_at:   row.posted_at ?? row.last_seen_at ?? undefined,
    retrievedFor:    retrievedFor.length > 0 ? retrievedFor : undefined,
    extractedSkills: row.extracted_skills ?? undefined,
    extractedSeniority: row.extracted_seniority,
    seniorityTier:   row.seniority_tier,
  };
}

async function runOne(
  supabase: SupabaseClient,
  phrases: string[],
  filters: RetrieveFilters,
  limit: number,
): Promise<AtsJobRow[]> {
  const { arg, mode } = buildTsqueryArg(phrases);
  let q = supabase
    .from("ats_jobs")
    .select(ATS_JOBS_COLS)
    .eq("is_active", filters.isActive ?? true);
  if (filters.remote) q = q.eq("remote", true);
  if (filters.location && filters.location.toLowerCase() !== "remote")
    q = q.ilike("location", `%${filters.location}%`);
  if (filters.location?.toLowerCase() === "remote") q = q.eq("remote", true);
  if (filters.sources?.length)                       q = q.in("source", filters.sources);
  if (filters.seniorityBand?.length)                 q = q.in("seniority_tier", filters.seniorityBand);
  if (filters.minPostedAt)                           q = q.gte("posted_at", filters.minPostedAt);
  if (arg) q = q.textSearch("title", arg, { type: mode, config: "english" });
  q = q.order("posted_at", { ascending: false, nullsFirst: false }).limit(limit);
  const { data } = await q;
  return (data ?? []) as AtsJobRow[];
}

/**
 * The engine. Search calls this with { titleQueries: [userInput] }.
 * Curation calls this with { queryGroups: expandQueries(targetRoles) }.
 */
export async function retrieveByTitle(
  supabase: SupabaseClient,
  input:    RetrieveInput,
  filters:  RetrieveFilters = {},
  limit    = 100,
): Promise<Candidate[]> {
  // Mode A — flat
  if (input.titleQueries && input.titleQueries.length > 0) {
    const rows = await runOne(supabase, input.titleQueries, filters, limit);
    return rows.map(r => toCandidate(r));
  }

  // Mode B — grouped (multi-title first-class per R2)
  if (input.queryGroups && input.queryGroups.length > 0) {
    // Run one tsquery per group in parallel. Each group's phrases are
    // capped at 15 by expandQueries; we cap again defensively.
    const results = await Promise.all(
      input.queryGroups.map(async g => {
        const phrases = (g.queries ?? []).slice(0, MAX_PHRASES_PER_TSQUERY);
        const rows = await runOne(supabase, phrases, filters, limit);
        return { label: g.label, rows };
      })
    );
    // Union + dedupe by url, accumulating retrievedFor labels
    const byUrl = new Map<string, { row: AtsJobRow; labels: Set<string> }>();
    for (const { label, rows } of results) {
      for (const row of rows) {
        const key = (row.direct_apply_url ?? row.apply_url ?? "").toLowerCase();
        if (!key) continue;
        const existing = byUrl.get(key);
        if (existing) {
          existing.labels.add(label);
        } else {
          byUrl.set(key, { row, labels: new Set([label]) });
        }
      }
    }
    // Preserve newest-first ordering by re-sorting the merged pool
    const merged: Array<{ row: AtsJobRow; labels: string[] }> = Array.from(byUrl.values())
      .map(({ row, labels }) => ({ row, labels: Array.from(labels) }))
      .sort((a, b) => {
        const ta = a.row.posted_at ?? a.row.last_seen_at ?? "";
        const tb = b.row.posted_at ?? b.row.last_seen_at ?? "";
        return tb.localeCompare(ta);
      });
    return merged.slice(0, limit).map(m => toCandidate(m.row, m.labels));
  }

  // No input queries → empty result
  return [];
}
