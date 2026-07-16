/**
 * feat/jobs-opportunity-scoring — Task 2
 * Extracts a UserProfile from career_profiles for use by profileScorer.
 * In-memory cached per (userId) call — the extractor is cheap but each
 * request that scores 50 jobs would otherwise re-hit the DB per job.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { inferSeniority, type UserProfile, type Seniority } from "./profileScorer";
import { normalizeSkills } from "./skillsNormalizer";

interface CareerProfileRow {
  target_roles?:    string[] | null;
  skills?:          string[] | null;
  summary?:         string | null;
  headline?:        string | null;
  work_experience?: Array<Record<string, unknown>> | null;
}

// Module-level cache keyed on userId. Fresh each cold-start of the
// Next.js function; that lifecycle matches request-batching well enough
// without introducing an explicit LRU.
const CACHE = new Map<string, { at: number; profile: UserProfile | null }>();
const TTL_MS = 60_000;

export async function extractUserProfile(
  supabase: SupabaseClient,
  userId: string,
): Promise<UserProfile | null> {
  const cached = CACHE.get(userId);
  const now = Date.now();
  if (cached && (now - cached.at) < TTL_MS) return cached.profile;

  try {
    // fix/jobs-opportunity-quality-p0 — target_roles lives on user_profiles,
    // not career_profiles. Fetch both in parallel and merge.
    const [cpRes, upRes] = await Promise.all([
      supabase
        .from("career_profiles")
        .select("skills, summary, headline, work_experience")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("user_profiles")
        .select("target_roles")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);
    const cp = (cpRes?.data ?? {}) as CareerProfileRow;
    const up = (upRes?.data ?? null) as { target_roles?: string[] | null } | null;
    // Return null only when BOTH sources are effectively empty. A user with
    // target_roles but no career_profile row still gets a UserProfile.
    if (!cpRes?.data && (!up || !up.target_roles || up.target_roles.length === 0)) {
      CACHE.set(userId, { at: now, profile: null });
      return null;
    }
    const row: CareerProfileRow = {
      ...cp,
      target_roles: (up?.target_roles ?? []) as string[],
    };
    const profile = rowToProfile(row);
    CACHE.set(userId, { at: now, profile });
    return profile;
  } catch {
    return null;
  }
}

export function rowToProfile(row: CareerProfileRow): UserProfile {
  const targetRoles = (row.target_roles ?? []).filter(Boolean);
  // fix/jobs-skills-normalization — split punctuation-glued compounds
  //   like "NIST CSF 2.0 · ISO/IEC 27001 · NIST 800-53" into ["NIST CSF",
  //   "ISO 27001", "NIST 800-53"] and alias-map to canonical forms.
  //   Every downstream consumer (curator, scorer, fit-check, opportunity
  //   scoring) gets the same normalized list. Original raw list stays
  //   available on the row for display purposes if needed.
  const skillsRaw = (row.skills ?? []).filter(Boolean);
  const skills    = normalizeSkills(skillsRaw);
  const summary = row.summary ?? "";
  const headline = row.headline ?? "";

  const workExp = Array.isArray(row.work_experience) ? row.work_experience : [];
  const mostRecent = workExp[0] as { title?: string } | undefined;
  const currentTitle = mostRecent?.title ?? headline ?? "";

  // Years of experience — sum the (endDate - startDate) months across all
  // entries. Present/current entries use "today" as end. Format is per
  // /careerprofile shape: { startDate: "YYYY-MM" | "YYYY", endDate: "YYYY-MM"|"Present" }.
  let months = 0;
  for (const raw of workExp) {
    const e = raw as { startDate?: string; endDate?: string; period?: string };
    const start = parseYearMonth(e.startDate ?? e.period?.split(/[-–—]/)[0]);
    const end   = e.endDate && /present/i.test(e.endDate) ? nowYm() : parseYearMonth(e.endDate ?? e.period?.split(/[-–—]/)[1]);
    if (start && end) months += Math.max(0, end - start);
  }
  const yearsExperience = Math.round(months / 12);

  // Target seniority — infer from the highest-seniority target role.
  let targetSeniority: Seniority = "unknown";
  for (const role of targetRoles) {
    const s = inferSeniority(role);
    if (rank(s) > rank(targetSeniority)) targetSeniority = s;
  }

  // Keywords — pick words length >= 4, alpha only, from summary + all
  // experience bullets. Dedupe + lowercase. Cap at 40.
  const bag = new Set<string>();
  const push = (t: string) => {
    for (const w of t.split(/[^A-Za-z]+/)) {
      const lw = w.trim().toLowerCase();
      if (lw.length >= 4 && !STOP_WORDS.has(lw)) bag.add(lw);
    }
  };
  push(summary);
  push(headline);
  for (const raw of workExp) {
    const e = raw as { description?: string; bullets?: string[] };
    if (e.description) push(e.description);
    if (Array.isArray(e.bullets)) e.bullets.forEach(push);
  }
  const keywords = Array.from(bag).slice(0, 40);

  return { skills, targetRoles, targetSeniority, currentTitle, yearsExperience, summary, keywords };
}

const STOP_WORDS = new Set([
  "with","from","that","this","have","been","were","will","which","their","other","would","about",
  "over","into","also","more","some","most","many","when","where","what","while","than","then",
  "these","those","them","they","your","team","teams","work","working","across","using",
  "including","various","strong","excellent","ability","able","company","role","position",
]);

// fix/jobs-seniority-wiring — "unknown" is the LOWEST rank (most
// uncertain), not the highest. The prior placement at the end made
// rank("unknown") === 10, higher than rank("executive") === 9, so
// the derivation loop `if (rank(s) > rank(targetSeniority))` could
// never advance past the initial "unknown" seed and every user's
// targetSeniority came back as "unknown" regardless of target_roles.
// This is the true root cause of the PR #382 "seniorityFit unknown"
// residual — not adapter wiring, not a Vercel deploy issue.
const SENIORITY_ORDER = ["unknown","intern","junior","associate","mid","senior","staff","principal","director","vp","executive"];
function rank(s: Seniority): number { return SENIORITY_ORDER.indexOf(s); }

function parseYearMonth(v: string | undefined): number | null {
  if (!v) return null;
  const m = v.match(/(\d{4})(?:[-/](\d{1,2}))?/);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const month = m[2] ? Math.max(1, Math.min(12, parseInt(m[2], 10))) : 1;
  return year * 12 + (month - 1);
}
function nowYm(): number {
  const d = new Date();
  return d.getFullYear() * 12 + d.getMonth();
}
