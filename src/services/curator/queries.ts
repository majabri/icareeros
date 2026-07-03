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

const tokensOf = (s: string) => s.split(/\s+/).filter(Boolean);
const rolesFrag = (roles: string[]) =>
  roles.map(r => {
    const tokens = tokensOf(r);
    return tokens.length === 1 ? tokens[0] : "(" + tokens.join(" & ") + ")";
  }).join(" | ");

export async function queryExactRoleMatches(
  supabase:    SupabaseClient,
  targetRoles: string[],
  limit = 40,
): Promise<OpportunityResult[]> {
  if (targetRoles.length === 0) return [];
  const ts = rolesFrag(targetRoles);
  const { data } = await supabase
    .from("ats_jobs")
    .select(ATS_JOBS_COLS)
    .eq("is_active", true)
    .textSearch("title", ts, { type: "plain", config: "english" })
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
  const ts = rolesFrag(expandedRoles);
  const { data } = await supabase
    .from("ats_jobs")
    .select(ATS_JOBS_COLS)
    .eq("is_active", true)
    .textSearch("title", ts, { type: "plain", config: "english" })
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
  const ts = rolesFrag(cleaned);
  const { data } = await supabase
    .from("ats_jobs")
    .select(ATS_JOBS_COLS)
    .eq("is_active", true)
    .textSearch("title", ts, { type: "plain", config: "english" })
    .order("posted_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  return (data ?? []).map(r => toOpp(r as AtsJobRow));
}
