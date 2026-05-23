import { BRAND_COLORS } from "@/lib/design-tokens";

/**
 * iCareerOS People Retention Pathway — stage configuration.
 *
 * Single source of truth for the six pathway stages on hire.icareeros.com:
 * Design → Select → Integrate → Support → Develop → Retain.
 *
 * Locked by ADR-HIRE-001 v3 (Drive: `19XMEdoY_AJvqJQ-rns0sUXFA2H33JOdG`)
 * + COWORK-BRIEF-hire-pathway-shell-v2 (Drive: `1_3sNmfuTQKPFkayTA-k_JUftIN2NoxSh`).
 *
 * Colours are positionally matched to the iCareerOS career-cycle ring
 * (`src/lib/career-os/stage-colors.ts`) so both subdomains' cycles use
 * the same 6 colours in the same positions; only the stage labels differ.
 *
 *   01 Design     teal       #00B8A9
 *   02 Select     coral      #FF6B6B
 *   03 Integrate  gold       #F5A623
 *   04 Support    green      #10B981
 *   05 Develop    slate blue #7B9AC0
 *   06 Retain     light teal #40C9C0
 *
 * Every component that needs stage data imports from this file. No
 * stage colour, route, label, or copy is hardcoded inside a component.
 */

export type StageId =
  | "design"
  | "select"
  | "integrate"
  | "support"
  | "develop"
  | "retain";

export type StageBilling = "free" | "starter";
export type StageStatus = "live" | "planned";

export interface PathwayStage {
  id:       StageId;
  number:   string;     // "01", "02", … (visual identity)
  label:    string;
  tagline:  string;
  icon:     string;     // single-char unicode glyph; visual identity only
  color:    string;     // hex; matches iCareerOS ring positional parity
  route:    string;     // /design, /select, /integrate, …
  billing:  StageBilling;
  status:   StageStatus;
}

export const PATHWAY_STAGES: readonly PathwayStage[] = [
  {
    id:      "design",
    number:  "01",
    label:   "Design",
    tagline: "Define the need before the hire",
    icon:    "⬡",
    color:   BRAND_COLORS.teal,   // teal — position 1, matches iCareerOS ring
    route:   "/design",
    billing: "free",
    status:  "live",   // Sprint H2 ships JD builder + AI agent + write path to job_postings
  },
  {
    id:      "select",
    number:  "02",
    label:   "Select",
    tagline: "Find and choose the best fit",
    icon:    "◈",
    color:   BRAND_COLORS.coral,   // coral — position 2, matches iCareerOS ring
    route:   "/select",
    billing: "free",
    status:  "live",
  },
  {
    id:      "integrate",
    number:  "03",
    label:   "Integrate",
    tagline: "Accelerate time-to-productivity",
    icon:    "◎",
    color:   BRAND_COLORS.gold,   // gold — position 3, matches iCareerOS ring
    route:   "/integrate",
    billing: "starter",
    status:  "planned",
  },
  {
    id:      "support",
    number:  "04",
    label:   "Support",
    tagline: "Remove friction, strengthen engagement",
    icon:    "◉",
    color:   BRAND_COLORS.green,   // green — position 4, matches iCareerOS ring
    route:   "/support",
    billing: "starter",
    status:  "planned",
  },
  {
    id:      "develop",
    number:  "05",
    label:   "Develop",
    tagline: "Build capability and future readiness",
    icon:    "◆",
    color:   BRAND_COLORS.slateBlue,   // slate blue — position 5, matches iCareerOS ring
    route:   "/develop",
    billing: "starter",
    status:  "planned",
  },
  {
    id:      "retain",
    number:  "06",
    label:   "Retain",
    tagline: "Protect your talent investment",
    icon:    "★",
    color:   BRAND_COLORS.tealLight,   // light teal — position 6, matches iCareerOS ring
    route:   "/retain",
    billing: "starter",
    status:  "planned",
  },
] as const;

/** Look up a stage by id; returns null if unknown. */
export function getStage(id: string): PathwayStage | null {
  return PATHWAY_STAGES.find((s) => s.id === id) ?? null;
}

/**
 * Long-form copy for each stage — description + the 4 actions a recruiter
 * unlocks. Used by StageLocked / DesignComingSoon / dashboard overview
 * cards. Kept here (not inline in components) so editorial changes can
 * be made in one place.
 */
export interface StageDetail {
  description: string;
  actions:     readonly [string, string, string, string];
}

export const STAGE_DETAILS: Record<StageId, StageDetail> = {
  design: {
    description:
      "Define the business need before hiring begins — workforce planning, role scoping, job description creation, and success measures.",
    actions: [
      "AI-assisted job description builder",
      "Role scorecard & success metrics",
      "Workforce gap analysis",
      "Publish to iCareerOS job board",
    ],
  },
  select: {
    description:
      "Find and choose the best candidate fit — AI matching, structured interviewing, and clear expectation-setting before the offer.",
    actions: [
      "AI candidate matching and ranking",
      "Structured interview kits",
      "Candidate pipeline (Kanban)",
      "Invite and outreach tools",
    ],
  },
  integrate: {
    description:
      "Accelerate time-to-productivity by making new hires feel informed, equipped, and connected from day one.",
    actions: [
      "30-60-90 day onboarding templates",
      "Check-in reminder system",
      "New hire progress tracker",
      "Culture integration checklist",
    ],
  },
  support: {
    description:
      "Remove daily friction, strengthen engagement, and prevent dissatisfaction from becoming turnover.",
    actions: [
      "Engagement pulse surveys",
      "Recognition & feedback tools",
      "Manager effectiveness dashboard",
      "Workload balance alerts",
    ],
  },
  develop: {
    description:
      "Build capability and future readiness so employees see growth, internal mobility, and meaningful development.",
    actions: [
      "Career pathing visualiser",
      "Training completion tracker",
      "Internal mobility board",
      "Leadership pipeline reports",
    ],
  },
  retain: {
    description:
      "Actively protect institutional knowledge, lower replacement costs, and maintain performance continuity.",
    actions: [
      "Retention risk dashboard",
      "Stay interview templates",
      "Compensation benchmarking",
      "Regretted loss tracker",
    ],
  },
};
