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

  // 3. 3 parallel queries
  const [exactRaw, adjacentRaw, skillRaw] = await Promise.all([
    queryExactRoleMatches(supabase, profile.targetRoles),
    queryAdjacentTitles(supabase, expandedRoles),
    querySkillBasedMatches(supabase, skills.coreSkills.slice(0, 5)),
  ]);

  // 4. Tag with query origin + de-dupe by url (exact wins on collision)
  const tagged = new Map<string, ScoredOpportunity>();
  const add = (list: typeof exactRaw, origin: "exact" | "adjacent" | "skills") => {
    for (const j of list) {
      if (!j.url) continue;
      if (!tagged.has(j.url)) tagged.set(j.url, { ...j, queryOrigin: origin });
    }
  };
  add(exactRaw, "exact");
  add(adjacentRaw, "adjacent");
  add(skillRaw, "skills");

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

  // 7. Tier classification
  const tiers = classifyIntoTiers(scored);

  // 8. Explanations
  const tierExplanations = {
    strongMatch:      generateTierExplanation("strongMatch",      tiers.strongMatch,      profile, skills),
    worthConsidering: generateTierExplanation("worthConsidering", tiers.worthConsidering, profile, skills),
    stretch:          generateTierExplanation("stretch",          tiers.stretch,          profile, skills),
  };

  return {
    ...tiers,
    tierExplanations,
    totalCandidates: scored.length,
    metadata: {
      expandedRoles,
      skillsUsed:        skills.coreSkills,
      exclusionsApplied: exclusions.excludeCompanies.length + exclusions.excludeTitleKeywords.length,
    },
  };
}

// ── Tier classifier ─────────────────────────────────────────────────────
function classifyIntoTiers(scored: ScoredOpportunity[]) {
  const takenUrls = new Set<string>();

  const strongMatch = scored.filter(s => {
    const senFits = (s as ScoredOpportunity & { _senFits?: boolean })._senFits !== false;
    return s.queryOrigin === "exact" && (s.fit_score ?? 0) >= 75 && senFits;
  }).sort((a, b) => (b.fit_score ?? 0) - (a.fit_score ?? 0)).slice(0, 20);
  strongMatch.forEach(s => s.url && takenUrls.add(s.url));

  const worthConsidering = scored.filter(s => {
    if (s.url && takenUrls.has(s.url)) return false;
    const fs = s.fit_score ?? 0;
    return fs >= 55 && fs < 75;
  }).sort((a, b) => (b.fit_score ?? 0) - (a.fit_score ?? 0)).slice(0, 15);
  worthConsidering.forEach(s => s.url && takenUrls.add(s.url));

  const stretch = scored.filter(s => {
    if (s.url && takenUrls.has(s.url)) return false;
    const fs = s.fit_score ?? 0;
    const roleSig = s.profileFitScore?.signals.targetRoleSignal;
    const roleFits = roleSig === "adjacent" || roleSig === "stretch" || roleSig === "exact";
    return fs >= 40 && roleFits;
  }).sort((a, b) => (b.fit_score ?? 0) - (a.fit_score ?? 0)).slice(0, 10);

  return { strongMatch, worthConsidering, stretch };
}

// Delegates to profileScorer.inferSeniority (imported statically).
function inferJobSeniority(title: string): ReturnType<typeof inferSeniority> {
  return inferSeniority(title);
}
