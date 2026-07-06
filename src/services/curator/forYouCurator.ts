/**
 * feat/jobs-for-you-curator Task 4 — Multi-query fan-out + tier classifier.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { extractUserProfile } from "@/services/scoring/profileExtractor";
import { scoreOpportunityAgainstProfile, inferSeniority } from "@/services/scoring/profileScorer";
import { expandTargetRoles } from "./roleFamilies";
import { extractSkillsFingerprint, type WorkEntry } from "./skillsFingerprint";
import { buildExclusions, seniorityIndex } from "./exclusions";
import {
  queryExactRoleMatches, queryAdjacentTitles, querySkillBasedMatches,
  queryByRoleFamilies, queryJobsForRole,
} from "./queries";
import {
  generateTierExplanation, generateJobReasoning, type ScoredOpportunity,
} from "./explanations";

export interface CuratorResult {
  strongMatch:      ScoredOpportunity[];
  worthConsidering: ScoredOpportunity[];
  stretch:          ScoredOpportunity[];
  tierExplanations: {
    strongMatch:      string;
    worthConsidering: string;
    stretch:          string;
  };
  totalCandidates: number;
  metadata: {
    expandedRoles:     string[];
    skillsUsed:        string[];
    exclusionsApplied: number;
  };
}

function emptyResult(): CuratorResult {
  return {
    strongMatch: [], worthConsidering: [], stretch: [],
    tierExplanations: { strongMatch: "", worthConsidering: "", stretch: "" },
    totalCandidates: 0,
    metadata: { expandedRoles: [], skillsUsed: [], exclusionsApplied: 0 },
  };
}

export async function curateForYou(
  userId:   string,
  supabase: SupabaseClient,
): Promise<CuratorResult> {
  // 1. Load profile + raw work_experience for skills inference
  const profile = await extractUserProfile(supabase, userId);
  if (!profile || !profile.targetRoles?.length) return emptyResult();

  const { data: cpRow } = await supabase
    .from("career_profiles")
    .select("work_experience")
    .eq("user_id", userId)
    .maybeSingle();
  const workExperience = Array.isArray((cpRow as { work_experience?: unknown } | null)?.work_experience)
    ? ((cpRow as { work_experience: unknown[] }).work_experience as WorkEntry[])
    : [];

  // 2. Expansion + fingerprint + exclusions
  const { expanded: expandedRoles } = expandTargetRoles(profile.targetRoles);
  const skills                       = extractSkillsFingerprint(profile, workExperience);
  const exclusions                   = await buildExclusions(userId, profile, skills, supabase);

  // 3. fix/jobs-per-role-scoring Task 2 — one INDEPENDENT query per
  //    target role, plus one adjacent + one skill-based fallback query.
  //    Each per-role result carries a matchedRole tag that
  //    scoreTargetRoleMatch reads to boost that specific role's score.
  const { families } = expandTargetRoles(profile.targetRoles);
  const perRoleQueries = profile.targetRoles.map(role =>
    queryJobsForRole(supabase, role, 30)
  );
  const [perRoleResults, adjacentRaw, skillRaw] = await Promise.all([
    Promise.all(perRoleQueries),
    families.length > 0
      ? queryByRoleFamilies(supabase, families)
      : queryAdjacentTitles(supabase, expandedRoles),
    querySkillBasedMatches(supabase, skills.coreSkills.slice(0, 5)),
  ]);

  // 4. Task 4 — merge per-role result sets first (they carry matchedRole
  //    tags). Then layer in adjacent + skills as additional origins. On
  //    URL collision, PREFER the exact per-role hit — it has the query
  //    origin signal that scoreTargetRoleMatch trusts.
  const tagged = new Map<string, ScoredOpportunity & { matchedRole?: string }>();
  const addExact = (list: Array<import("@/services/opportunityTypes").OpportunityResult & { matchedRole?: string }>, origin: "exact") => {
    for (const j of list) {
      if (!j.url) continue;
      // First-writer wins is fine here because per-role results are the
      // strongest signal; later per-role queries for OTHER target roles
      // that also happen to match this job add nothing new.
      if (!tagged.has(j.url)) tagged.set(j.url, { ...j, queryOrigin: origin });
    }
  };
  const addSecondary = (list: typeof adjacentRaw, origin: "adjacent" | "skills") => {
    for (const j of list) {
      if (!j.url) continue;
      if (!tagged.has(j.url)) tagged.set(j.url, { ...j, queryOrigin: origin });
    }
  };
  for (const per of perRoleResults) addExact(per, "exact");
  addSecondary(adjacentRaw, "adjacent");
  addSecondary(skillRaw, "skills");

  // 5. Client-side exclusion pass
  const titleExc = exclusions.excludeTitleKeywords.map(k => k.toLowerCase());
  const descExc  = exclusions.excludeDescriptionKeywords.map(k => k.toLowerCase());
  const compExc  = new Set(exclusions.excludeCompanies.map(c => c.toLowerCase()));
  const filtered = [...tagged.values()].filter(o => {
    const title = (o.title ?? "").toLowerCase();
    const desc  = (o.description ?? "").toLowerCase();
    const comp  = (o.company ?? "").toLowerCase();
    if (titleExc.some(k => title.includes(k))) return false;
    if (descExc.some(k => desc.includes(k)))   return false;
    if (compExc.has(comp))                     return false;
    return true;
  });

  // 6. Score every candidate
  const scored: ScoredOpportunity[] = filtered.map(job => {
    const pfs = scoreOpportunityAgainstProfile(job, profile);
    const jobSeniorityIdx = seniorityIndex(inferJobSeniority(job.title ?? ""));
    // Seniority band filter — allow within ±1 of target
    const seniorityFits = jobSeniorityIdx >= exclusions.minSeniorityLevel &&
                          jobSeniorityIdx <= exclusions.maxSeniorityLevel;
    return {
      ...job,
      profileFitScore: pfs,
      fit_score:       pfs.total,
      fit_breakdown: {
        targetRole:          pfs.breakdown.targetRoleMatch,
        skills:              pfs.breakdown.skillsMatch,
        seniority:           pfs.breakdown.seniorityMatch,
        experience:          pfs.breakdown.experienceMatch,
        keywords:            pfs.breakdown.keywordDensity,
        targetRoleBestMatch: pfs.signals.targetRoleBestMatch,
      },
      matchReason: generateJobReasoning({ ...job, profileFitScore: pfs }, profile),
      // Silently demote off-band seniority so it drops out of Strong Match
      _senFits: seniorityFits,
    } as ScoredOpportunity & { _senFits?: boolean };
  });

  // 7. Task 4 — dedupe by URL keeping highest fit_score. When the same
  //    job matched via multiple per-role queries, only the strongest
  //    signal survives so tier classification isn't polluted with dupes.
  const deduped = dedupeByUrlKeepHighestScore(scored);

  // 8. Tier classification
  const tiers = classifyIntoTiers(deduped);

  // 8. Explanations
  const tierExplanations = {
    strongMatch:      generateTierExplanation("strongMatch",      tiers.strongMatch,      profile, skills),
    worthConsidering: generateTierExplanation("worthConsidering", tiers.worthConsidering, profile, skills),
    stretch:          generateTierExplanation("stretch",          tiers.stretch,          profile, skills),
  };

  return {
    ...tiers,
    tierExplanations,
    totalCandidates: deduped.length,
    metadata: {
      expandedRoles,
      skillsUsed:        skills.coreSkills,
      exclusionsApplied: exclusions.excludeCompanies.length + exclusions.excludeTitleKeywords.length,
    },
  };
}

// ── fix/jobs-per-role-scoring Task 4 — dedupe helper ────────────────────
/**
 * When multiple per-role queries return the same job URL, keep the row
 * whose fit_score is highest so the best signal wins.
 */
export function dedupeByUrlKeepHighestScore<T extends { url?: string; fit_score?: number | null }>(jobs: T[]): T[] {
  const map = new Map<string, T>();
  for (const j of jobs) {
    if (!j.url) continue;
    const existing = map.get(j.url);
    if (!existing || (j.fit_score ?? 0) > (existing.fit_score ?? 0)) {
      map.set(j.url, j);
    }
  }
  return Array.from(map.values());
}

// ── Tier classifier ─────────────────────────────────────────────────────
function classifyIntoTiers(scored: ScoredOpportunity[]) {
  const takenUrls = new Set<string>();

  // fix/jobs-curator-relaxation Fix 4 — lowered thresholds so a small
  // ats_jobs corpus with mostly-adjacent matches still populates tiers.
  //   Strong Match:      fit >= 65 (was 75), still requires queryOrigin='exact'
  //   Worth Considering: fit in [45, 65) (was [55, 75))
  //   Stretch:           fit >= 30 (was 40)
  const strongMatch = scored.filter(s => {
    const senFits = (s as ScoredOpportunity & { _senFits?: boolean })._senFits !== false;
    return s.queryOrigin === "exact" && (s.fit_score ?? 0) >= 65 && senFits;
  }).sort((a, b) => (b.fit_score ?? 0) - (a.fit_score ?? 0)).slice(0, 20);
  strongMatch.forEach(s => s.url && takenUrls.add(s.url));

  const worthConsidering = scored.filter(s => {
    if (s.url && takenUrls.has(s.url)) return false;
    const fs = s.fit_score ?? 0;
    return fs >= 45 && fs < 65;
  }).sort((a, b) => (b.fit_score ?? 0) - (a.fit_score ?? 0)).slice(0, 15);
  worthConsidering.forEach(s => s.url && takenUrls.add(s.url));

  const stretch = scored.filter(s => {
    if (s.url && takenUrls.has(s.url)) return false;
    const fs = s.fit_score ?? 0;
    const roleSig = s.profileFitScore?.signals.targetRoleSignal;
    const roleFits = roleSig === "adjacent" || roleSig === "stretch" || roleSig === "exact";
    return fs >= 30 && roleFits;
  }).sort((a, b) => (b.fit_score ?? 0) - (a.fit_score ?? 0)).slice(0, 10);

  return { strongMatch, worthConsidering, stretch };
}

// Delegates to profileScorer.inferSeniority (imported statically).
function inferJobSeniority(title: string): ReturnType<typeof inferSeniority> {
  return inferSeniority(title);
}
