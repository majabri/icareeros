/**
 * Pure per-stage empty-state CTA computation for the Career OS dashboard.
 *
 * Phase 5 Item 2 — see docs/specs/COWORK-BRIEF-phase5-v1.md.
 *
 * Extracted from CareerOsDashboard.tsx so the table-driven mapping can be
 * unit-tested without React. The dashboard imports this and threads the
 * result into each CycleStageCard's emptyStateCta prop.
 *
 * Mapping rules (matching the brief):
 *   evaluate (no profile)  → "Complete your Career Profile first" (disabled)
 *   evaluate (profile ok)  → "Upload your resume to get started →" /mycareer/profile
 *   advise                 → disabled "Complete Evaluate first..."
 *   learn                  → disabled "Complete Advise..."
 *   act                    → "Browse matching opportunities →" /jobs
 *   coach (free)           → "Upgrade to chat with your coach →" /settings/billing
 *   coach (paid)           → "Chat with your coach →" /coach
 *   achieve                → disabled "Your achievements will appear here..."
 */

import type { CareerOsStage } from "@/orchestrator/careerOsOrchestrator";
import type { StageStatus, StageStatusMap } from "./stageStatus";
import type { SubscriptionPlan } from "@/services/billing/types";

export interface EmptyStateCta {
  label:    string;
  href?:    string;
  disabled?: boolean;
  helper?:  string;
}

export interface EmptyStateCtaInput {
  stage:        CareerOsStage;
  /** Per-stage status map computed by buildStageStatus. */
  stageStatus:  StageStatusMap;
  /** The cycle's `current_stage` — that one gets the Run button, no CTA. */
  currentStage?: CareerOsStage;
  /** career_profiles has headline AND skills.length >= 3. */
  profileReady: boolean;
  plan:         SubscriptionPlan;
}

export function emptyStateCta(input: EmptyStateCtaInput): EmptyStateCta | null {
  const { stage, stageStatus, currentStage, profileReady, plan } = input;
  const status: StageStatus = stageStatus[stage];

  if (status === "completed") return null;
  if (currentStage && stage === currentStage) return null; // Run-button territory

  switch (stage) {
    case "evaluate":
      if (!profileReady) {
        return {
          label:    "Complete your Career Profile first",
          disabled: true,
          helper:   "Add a headline and at least 3 skills so Evaluate has material to score.",
        };
      }
      return {
        label: "Upload your resume to get started →",
        href:  "/mycareer/profile",
      };

    case "advise":
      return {
        label:    "Complete Evaluate first to unlock career advice",
        disabled: true,
      };

    case "learn":
      return {
        label:    "Complete Advise to see your learning recommendations",
        disabled: true,
      };

    case "act":
      return {
        label: "Browse matching opportunities →",
        href:  "/jobs",
      };

    case "coach":
      if (plan === "free") {
        return {
          label: "Upgrade to chat with your coach →",
          href:  "/settings/billing",
        };
      }
      return {
        label: "Chat with your coach →",
        href:  "/coach",
      };

    case "achieve":
      return {
        label:    "Your achievements will appear here when you land a role",
        disabled: true,
      };

    default:
      return null;
  }
}
