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
 *   - Other stages (evaluate / learn / achieve): unchanged from
 *     the Phase 1 strict rule — completion requires non-empty notes.
 */

import type { CareerOsStage } from "@/orchestrator/careerOsOrchestrator";

export const STAGE_ORDER: CareerOsStage[] = [
  "evaluate", "advise", "learn", "act", "achieve",
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
    act:      null, achieve: null,
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
 * v3 fix (2026-05-17) — Removed the prior `i <= currentIdx` gate. Stages
 * can now show their real status regardless of where the cycle's
 * `current_stage` index points. So if the user runs `/achieve` directly
 * while the cycle says current_stage='evaluate', the dashboard reflects
 * the achievement instead of pretending Achieve is still pending. The
 * current stage on an ACTIVE cycle stays `in_progress` (never auto-
 * graduates to completed), because cycle advancement is the
 * orchestrator's job, not the dashboard's.
 *
 * Decision matrix (in priority order, first match wins):
 *
 *   1. cycle active AND stage === current_stage  →  in_progress
 *      (preserves the invariant — current stage of a live cycle never
 *       auto-graduates to completed via dashboard inference)
 *   2. isComplete(stage)                          →  completed
 *   3. hasContent(notes[stage])                   →  in_progress
 *      (user ran this stage but completion gate not met — Act has
 *       notes but 0 applications, Advise has notes but 0 opps, etc.)
 *   4. past stage (index < currentIdx)            →  in_progress
 *      (cycle progressed past this stage without producing notes —
 *       it can still be re-run, so surface it as actionable)
 *   5. otherwise                                  →  pending
 */
export function buildStageStatus(
  cycle:   ActiveCycleSummary | null,
  notes:   StageNotesMap        = emptyNotesMap(),
  signals: CompletionSignals    = NO_SIGNALS,
): StageStatusMap {
  const result: StageStatusMap = {
    evaluate: "pending", advise: "pending", learn: "pending",
    act:      "pending", achieve: "pending",
  };
  if (!cycle) return result;

  const current     = cycle.current_stage as CareerOsStage;
  const currentIdx  = STAGE_ORDER.indexOf(current);
  if (currentIdx < 0) return result;
  const cycleActive = cycle.status === "active";

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

    // Rule 1 — current stage of an active cycle is always in_progress.
    if (cycleActive && i === currentIdx) {
      result[s] = "in_progress";
      continue;
    }
    // Rule 2 — completion gate satisfied.
    if (isComplete(s)) {
      result[s] = "completed";
      continue;
    }
    // Rule 3 — has some notes (user ran it but gate not satisfied).
    if (hasContent(notes[s])) {
      result[s] = "in_progress";
      continue;
    }
    // Rule 4 — past stage without notes (cycle moved past it).
    if (i < currentIdx) {
      result[s] = "in_progress";
      continue;
    }
    // Rule 5 — future stage, no notes, no signals. Default pending.
  }
  return result;
}
