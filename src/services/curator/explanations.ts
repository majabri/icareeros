/**
 * feat/jobs-for-you-curator Task 5 — Deterministic explanation generator.
 *
 * All strings are built from score breakdowns + profile fields — no LLM.
 */

import type { OpportunityResult } from "@/services/opportunityTypes";
import type { UserProfile, ProfileFitScore } from "@/services/scoring/profileScorer";
import type { SkillsFingerprint } from "./skillsFingerprint";

export interface ScoredOpportunity extends OpportunityResult {
  profileFitScore?: ProfileFitScore;
  queryOrigin?: "exact" | "adjacent" | "skills";
}

export function generateTierExplanation(
  tier:    "strongMatch" | "worthConsidering" | "stretch",
  jobs:    ScoredOpportunity[],
  profile: UserProfile,
  skills:  SkillsFingerprint,
): string {
  if (jobs.length === 0) return "";
  const targetRole = profile.targetRoles[0] ?? "your target role";
  const topSkills  = skills.coreSkills.slice(0, 3).filter(Boolean);
  const skillStr   = topSkills.length ? topSkills.join(", ") : "your background";
  const seniority  = (profile.targetSeniority && profile.targetSeniority !== "unknown")
    ? profile.targetSeniority
    : "target";

  switch (tier) {
    case "strongMatch":
      return `${jobs.length} ${jobs.length === 1 ? "role" : "roles"} closely aligned with your ${targetRole} target. ` +
             `They leverage your ${skillStr} background at the ${seniority} level.`;
    case "worthConsidering": {
      const stems = commonTitleStems(jobs).slice(0, 2);
      const stemStr = stems.length ? stems.join(" and ") : "adjacent";
      return `${jobs.length} adjacent ${jobs.length === 1 ? "opportunity" : "opportunities"} worth exploring. ` +
             `These ${stemStr} roles share overlap with your target but may take you in a related direction.`;
    }
    case "stretch":
      return `${jobs.length} stretch ${jobs.length === 1 ? "opportunity" : "opportunities"} that push toward more senior or specialised roles. ` +
             `They may require additional experience but align with your trajectory toward ${targetRole}.`;
  }
}

/**
 * Per-job reasoning line. Combines the 3 most informative signals from
 * ProfileFitScore into a compact phrase for the card.
 */
export function generateJobReasoning(job: ScoredOpportunity, profile: UserProfile): string {
  const parts: string[] = [];
  const sig = job.profileFitScore?.signals;
  if (!sig) return "";

  // Role signal
  if (sig.targetRoleSignal === "exact" && sig.targetRoleBestMatch) {
    parts.push(`Exact match for ${sig.targetRoleBestMatch}`);
  } else if (sig.targetRoleSignal === "adjacent") {
    parts.push(`Adjacent to your ${profile.targetRoles[0] ?? "target"}`);
  } else if (sig.targetRoleSignal === "stretch") {
    parts.push("Stretch role");
  }

  // Skills signal
  const matched = sig.matchedSkills?.length ?? 0;
  const missing = sig.missingSkills?.length ?? 0;
  const total   = matched + missing;
  if (total > 0) parts.push(`${matched} of ${total} required skills match`);

  // Seniority signal
  if (sig.senioritySignal === "match") parts.push("Right seniority level");
  else if (sig.senioritySignal === "overqualified") parts.push("You may be overqualified");
  else if (sig.senioritySignal === "underqualified") parts.push("Stretch — one level up");

  return parts.join(" · ");
}

function commonTitleStems(jobs: ScoredOpportunity[]): string[] {
  const counts = new Map<string, number>();
  for (const j of jobs) {
    for (const w of (j.title ?? "").toLowerCase().split(/\s+/)) {
      const t = w.replace(/[^a-z]/g, "");
      if (t.length >= 4 && !STOP.has(t)) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .filter(([, n]) => n >= 2)
    .slice(0, 4)
    .map(([w]) => w);
}
const STOP = new Set(["senior", "junior", "staff", "principal", "with", "from", "that", "this", "role", "team", "the", "and", "for", "director", "manager"]);
