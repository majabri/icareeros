/**
 * feat/jobs-for-you-curator — Task 4 helper: parallel ats_jobs queries.
 *
 * Three targeted queries whose union forms the candidate pool the curator
 * scores + classifies:
 *   • Exact — match against user.targetRoles verbatim
 *   • Adjacent — match against expandTargetRoles() bag
 *   • Skills-based — match against top-N core skills in the title
 *
 * All three run in parallel and are de-duplicated by url downstream.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { OpportunityResult } from "@/services/opportunityTypes";

const ATS_JOBS_COLS = "id, source, external_id, company, title, location, description, apply_url, salary_min, salary_max, salary_currency, employment_type, remote, posted_at, last_seen_at";

interface AtsJobRow {
  id:              string;
  source:          string;
  external_id:     string | null;
  company:         string;
  title:           string;
  location:        string | null;
  description:     string | null;
  apply_url:       string;
  salary_min:      number | null;
  salary_max:      number | null;
  salary_currency: string | null;
  employment_type: string | null;
  remote:          boolean;
  posted_at:       string | null;
  last_seen_at:    string | null;
}

function toOpp(row: AtsJobRow): OpportunityResult {
  return {
    id:              `db-${row.id}`,
    title:           row.title,
    company:         row.company,
    location:        row.location ?? "",
    type:            row.employment_type ?? "",
    description:     row.description ?? "",
    url:             row.apply_url,
    matchReason:     "",
    salary_min:      row.salary_min,
    salary_max:      row.salary_max,
    salary_currency: row.salary_currency ?? undefined,
    is_remote:       !!row.remote,
    source:          row.source,
    first_seen_at:   row.posted_at ?? row.last_seen_at ?? undefined,
  };
}

/**
 * fix/jobs-curator-relaxation Fix 1 — quoted-phrase OR string that
 * websearch_to_tsquery natively understands.
 *
 *   Input:  ["Director of Security", "CISO", "Head of Security"]
 *   Output: '"director of security" OR "ciso" OR "head of security"'
 *
 * Postgres websearch mode handles stemming + word-order variations, so
 * "director of security" also matches "Security Director" and "Directors
 * of Security". Single-token roles are left unquoted so they lemmatise.
 */
function toWebsearchQuery(roles: string[]): string {
  return roles
    .map(r => r.trim().toLowerCase())
    .filter(Boolean)
    .map(r => {
      const isSingleToken = !/\s/.test(r);
      // Escape any embedded double quotes defensively
      const safe = r.replace(/"/g, '');
      return isSingleToken ? safe : `"${safe}"`;
    })
    .join(" OR ");
}

/**
 * feat/jobs-multi-industry-coverage — fast-path using the new
 * ats_jobs.role_families gin index. Overlaps takes O(log N) with the
 * index vs the tsquery which scales linearly in title token count.
 *
 * Caller can pass ["director_of_security", "ciso", "biso"] to match
 * any job whose role_families array intersects with those keys.
 */
export async function queryByRoleFamilies(
  supabase: SupabaseClient,
  families: string[],
  limit = 40,
): Promise<OpportunityResult[]> {
  if (families.length === 0) return [];
  const { data } = await supabase
    .from("ats_jobs")
    .select(ATS_JOBS_COLS)
    .eq("is_active", true)
    .eq("enrichment_status", "complete")
    .overlaps("role_families", families)
    .order("posted_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  return (data ?? []).map(r => toOpp(r as AtsJobRow));
}

/**
 * Filter by seniority band using the indexed seniority_tier column.
 */
export async function queryBySeniorityTier(
  supabase: SupabaseClient,
  tiers: string[],
  limit = 40,
): Promise<OpportunityResult[]> {
  if (tiers.length === 0) return [];
  const { data } = await supabase
    .from("ats_jobs")
    .select(ATS_JOBS_COLS)
    .eq("is_active", true)
    .eq("enrichment_status", "complete")
    .in("seniority_tier", tiers)
    .order("posted_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  return (data ?? []).map(r => toOpp(r as AtsJobRow));
}

export async function queryExactRoleMatches(
  supabase:    SupabaseClient,
  targetRoles: string[],
  limit = 40,
): Promise<OpportunityResult[]> {
  if (targetRoles.length === 0) return [];
  const cappedTargets = targetRoles.slice(0, 8);
  const ts = toWebsearchQuery(cappedTargets);
  const { data } = await supabase
    .from("ats_jobs")
    .select(ATS_JOBS_COLS)
    .eq("is_active", true)
    .textSearch("title", ts, { type: "websearch", config: "english" })
    .order("posted_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  return (data ?? []).map(r => toOpp(r as AtsJobRow));
}

export async function queryAdjacentTitles(
  supabase:      SupabaseClient,
  expandedRoles: string[],
  limit = 40,
): Promise<OpportunityResult[]> {
  if (expandedRoles.length === 0) return [];
  // hotfix/curator-cap-expanded-roles — cap at 15 phrases. websearch_to_tsquery
  // hangs on 100+ ORed phrases in prod. Family expansion still runs (families
  // remain intact); we just cap the query surface.
  const cappedRoles = expandedRoles.slice(0, 15);
  const ts = toWebsearchQuery(cappedRoles);
  const { data } = await supabase
    .from("ats_jobs")
    .select(ATS_JOBS_COLS)
    .eq("is_active", true)
    .textSearch("title", ts, { type: "websearch", config: "english" })
    .order("posted_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  return (data ?? []).map(r => toOpp(r as AtsJobRow));
}

export async function querySkillBasedMatches(
  supabase: SupabaseClient,
  skills:   string[],
  limit = 40,
): Promise<OpportunityResult[]> {
  if (skills.length === 0) return [];
  const cleaned = skills
    .map(s => (s ?? "").trim())
    .filter(s => s.length >= 2 && /^[A-Za-z0-9 .+#/-]+$/.test(s))
    .slice(0, 5);
  if (cleaned.length === 0) return [];

  // OR the skills at the title level. Multi-word skills become
  // (word & word) fragments; single words stand alone.
  const ts = toWebsearchQuery(cleaned);
  const { data } = await supabase
    .from("ats_jobs")
    .select(ATS_JOBS_COLS)
    .eq("is_active", true)
    .textSearch("title", ts, { type: "websearch", config: "english" })
    .order("posted_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  return (data ?? []).map(r => toOpp(r as AtsJobRow));
}
