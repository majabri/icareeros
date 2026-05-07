/**
 * Stage-status computation for the Career OS dashboard.
 *
 * Pure logic — extracted from CareerOsDashboard.tsx so it can be unit-tested
 * directly. Callers pass the cycle row, the per-stage notes map, and a
 * lightweight `signals` object for the new completion rules added in
 * COWORK-BRIEF-phase2-v1.md (Item 3):
 *
 *   - Advise: complete when notes exist AND there is at least 1
 *     opportunity in the system (the user's match scoring is meaningful
 *     only if there is real job data to match against).
 *
 *   - Act: complete when the user has at least 1 application in the
 *     applications table — the brief's strict definition. Notes alone
 *     do not satisfy Act anymore.
 *
 *   - Other stages (evaluate / learn / coach / achieve): unchanged from
 *     the Phase 1 strict rule — completion requires non-empty notes.
 */

import type { CareerOsStage } from "@/orchestrator/careerOsOrchestrator";

export const STAGE_ORDER: CareerOsStage[] = [
  "evaluate", "advise", "learn", "act", "coach", "achieve",
];

export type StageStatus = "pending" | "in_progress" | "completed" | "skipped";

export interface ActiveCycleSummary {
  current_stage: string;
  status:        string;
}

export type StageStatusMap = Record<CareerOsStage, StageStatus>;
export type StageNotesMap  = Record<CareerOsStage, Record<string, unknown> | null>;

export interface CompletionSignals {
  /** Count of rows in the `applications` table for this user (any cycle). */
  applicationsCount:  number;
  /** Count of active rows in the `opportunities` table (global). */
  opportunitiesCount: number;
}

export const NO_SIGNALS: CompletionSignals = {
  applicationsCount:  0,
  opportunitiesCount: 0,
};

export function emptyNotesMap(): StageNotesMap {
  return {
    evaluate: null, advise: null, learn: null,
    act:      null, coach:  null, achieve: null,
  };
}

function hasContent(notes: Record<string, unknown> | null | undefined): boolean {
  return notes != null && typeof notes === "object" && Object.keys(notes).length > 0;
}

/**
 * Compute per-stage status. Strict rules:
 *
 *   - Evaluate / Learn / Coach / Achieve  →  completed iff notes non-empty
 *   - Advise                              →  completed iff notes non-empty AND
 *                                              opportunitiesCount >= 1
 *   - Act                                 →  completed iff applicationsCount >= 1
 *
 * A stage that the cycle has progressed past but whose completion gate
 * has not been satisfied surfaces as `in_progress` (re-runnable / open
 * CTA), never `completed`. This fixes the prior UX lie where stages
 * claimed completion based purely on `cycle.current_stage` index.
 */
export function buildStageStatus(
  cycle:   ActiveCycleSummary | null,
  notes:   StageNotesMap        = emptyNotesMap(),
  signals: CompletionSignals    = NO_SIGNALS,
): StageStatusMap {
  const result: StageStatusMap = {
    evaluate: "pending", advise: "pending", learn: "pending",
    act:      "pending", coach:  "pending", achieve: "pending",
  };
  if (!cycle) return result;

  const current = cycle.current_stage as CareerOsStage;
  const currentIdx = STAGE_ORDER.indexOf(current);
  if (currentIdx < 0) return result;

  // Per-stage completion gate — see file header for the rules.
  function isComplete(stage: CareerOsStage): boolean {
    switch (stage) {
      case "act":
        return signals.applicationsCount >= 1;
      case "advise":
        return hasContent(notes[stage]) && signals.opportunitiesCount >= 1;
      default:
        return hasContent(notes[stage]);
    }
  }

  for (let i = 0; i < STAGE_ORDER.length; i++) {
    const s = STAGE_ORDER[i];
    if (i < currentIdx) {
      result[s] = isComplete(s) ? "completed" : "in_progress";
    } else if (i === currentIdx) {
      const cycleDone = cycle.status !== "active";
      result[s] = cycleDone
        ? (isComplete(s) ? "completed" : "in_progress")
        : "in_progress";
    }
  }
  return result;
}
