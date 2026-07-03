/**
 * feat/jobs-for-you-curator Task 3 — Anti-pattern exclusion builder.
 *
 * Derives a blocklist of title keywords, description keywords, and
 * companies based on (a) profile background heuristics and (b) the
 * user's negative feedback history from opportunity_feedback.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserProfile, Seniority } from "@/services/scoring/profileScorer";
import type { SkillsFingerprint } from "./skillsFingerprint";

export interface Exclusions {
  excludeTitleKeywords:       string[];
  excludeDescriptionKeywords: string[];
  excludeCompanies:           string[];
  excludeIndustries:          string[];
  minSeniorityLevel:          number;
  maxSeniorityLevel:          number;
}

const SENIORITY_ORDER: Seniority[] = [
  "intern", "junior", "associate", "mid", "senior",
  "staff", "principal", "director", "vp", "executive",
];

export function seniorityIndex(s: Seniority | undefined | null): number {
  if (!s || s === "unknown") return 4; // default to "mid" bucket
  const i = SENIORITY_ORDER.indexOf(s);
  return i === -1 ? 4 : i;
}

export async function buildExclusions(
  userId:   string,
  profile:  UserProfile,
  skills:   SkillsFingerprint,
  supabase: SupabaseClient,
): Promise<Exclusions> {
  const excludeTitleKeywords:       string[] = [];
  const excludeDescriptionKeywords: string[] = [];

  const all = skills.allKeywords.map(k => k.toLowerCase());
  const has = (needle: string) => all.some(k => k.includes(needle));

  // ── Anti-pattern: cyber security profile should not surface physical
  //    security roles that share the "security" keyword. ─────────────────
  const isCyberSecurity =
    has("cyber") || has("infosec") || has("information security") ||
    has("siem") || has("soc operations") || has("threat");
  if (isCyberSecurity) {
    excludeTitleKeywords.push(
      "physical security", "security guard", "unarmed security",
      "armed security", "loss prevention", "security officer only",
    );
    excludeDescriptionKeywords.push(
      "security guard duties", "foot patrol", "access control officer",
    );
  }

  // ── Anti-pattern: technical profile should not surface pure sales roles ─
  const isTechnical =
    has("engineering") || has("developer") || has("architect") ||
    has("infrastructure") || has("devops") || has("sre");
  if (isTechnical) {
    excludeTitleKeywords.push(
      "sales development representative", "sdr", "bdr",
      "account executive", "business development representative",
    );
  }

  // ── Feedback: companies the user has dismissed ─────────────────────────
  const excludeCompanies = new Set<string>();
  try {
    const { data } = await supabase
      .from("opportunity_feedback")
      .select("company, signal")
      .eq("user_id", userId)
      .eq("signal", "negative")
      .limit(200);
    for (const row of (data ?? []) as Array<{ company: string | null }>) {
      if (row.company) excludeCompanies.add(row.company);
    }
  } catch { /* best-effort — never fail curator on feedback lookup */ }

  // ── Seniority bounds: allow ±1 level around the target ─────────────────
  const targetIdx = seniorityIndex(profile.targetSeniority);
  const minSeniorityLevel = Math.max(0, targetIdx - 1);
  const maxSeniorityLevel = Math.min(SENIORITY_ORDER.length - 1, targetIdx + 1);

  return {
    excludeTitleKeywords,
    excludeDescriptionKeywords,
    excludeCompanies: Array.from(excludeCompanies),
    excludeIndustries: [],
    minSeniorityLevel,
    maxSeniorityLevel,
  };
}
