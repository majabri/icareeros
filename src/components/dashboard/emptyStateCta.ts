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
 *   evaluate (no profile)  → "Complete your Career Profile" /mycareer/profile (warning-only, clickable)
 *   evaluate (profile ok)  → "Open Evaluate →" /evaluate
 *   advise                 → "Open Career Advice →" /advise (no longer a hard block on Evaluate)
 *   learn                  → "Open Learning Plan →" /learn (no longer a hard block on Advise)
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
      // Sprint 5 fix-pack — profile-not-ready is now a soft warning, not a
      // blocker. The actual stage page (/evaluate) already shows an amber
      // banner if the profile is incomplete and still lets the user run.
      if (!profileReady) {
        return {
          label:  "Complete your Career Profile →",
          href:   "/mycareer/profile",
          helper: "Add a headline and at least 3 skills so Evaluate has material to score.",
        };
      }
      return {
        label: "Open Evaluate →",
        href:  "/evaluate",
      };

    case "advise":
      // Sprint 5 fix-pack — was a disabled blocker telling the user to do
      // Evaluate first. Now a clickable link to /advise. The stage page
      // surfaces the actual error if Evaluate notes are missing.
      return {
        label: "Open Career Advice →",
        href:  "/advise",
      };

    case "learn":
      // Sprint 5 fix-pack — was a disabled blocker. Now a clickable link
      // to the stage page so the user can try.
      return {
        label: "Open Learning Plan →",
        href:  "/learn",
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
      // Sprint 5 fix-pack — clickable link to /achieve so users can record
      // milestones without waiting for the full cycle.
      return {
        label: "Open Achieve →",
        href:  "/achieve",
        helper: "Record a milestone or wrap up the cycle.",
      };

    default:
      return null;
  }
}
