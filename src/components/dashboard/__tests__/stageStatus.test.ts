/**
 * stageStatus unit tests
 *
 * Phase 2 Item 3 — see docs/specs/COWORK-BRIEF-phase2-v1.md
 *
 * Verifies the strict per-stage completion rules:
 *   - Evaluate / Learn / Coach / Achieve  →  notes-based (Phase 1)
 *   - Advise                              →  notes AND opportunitiesCount >= 1 (Phase 2)
 *   - Act                                 →  applicationsCount >= 1 (Phase 2 — strict)
 */

import { describe, it, expect } from "vitest";
import {
  buildStageStatus,
  emptyNotesMap,
  STAGE_ORDER,
  type StageNotesMap,
  type ActiveCycleSummary,
} from "../stageStatus";

const NO_NOTES = emptyNotesMap();
const SIG_ZERO = { applicationsCount: 0, opportunitiesCount: 0 };

function activeCycle(current_stage: string, status: string = "active"): ActiveCycleSummary {
  return { current_stage, status };
}

function notesWith(map: Partial<StageNotesMap>): StageNotesMap {
  return { ...emptyNotesMap(), ...map };
}

describe("buildStageStatus — null cycle", () => {
  it("returns all pending when cycle is null", () => {
    const status = buildStageStatus(null);
    for (const s of STAGE_ORDER) expect(status[s]).toBe("pending");
  });
});

describe("buildStageStatus — Phase 1 strict notes rule (unchanged for evaluate/learn/coach/achieve)", () => {
  it("past stage with notes → completed; without notes → in_progress", () => {
    const cycle = activeCycle("learn"); // currentIdx = 2 (past = evaluate, advise)
    const notes = notesWith({
      evaluate: { score: 80 },           // past + has notes → completed
      // advise:  null (past, no notes)  → in_progress
    });
    const sig = { applicationsCount: 0, opportunitiesCount: 1 }; // give advise the opp signal
    const status = buildStageStatus(cycle, notes, sig);
    expect(status.evaluate).toBe("completed");
    expect(status.advise).toBe("in_progress"); // no notes → still in_progress
    expect(status.learn).toBe("in_progress");  // current
    expect(status.act).toBe("pending");        // future
  });

  it("Achieve with notes on inactive cycle → completed; current stage on active cycle is always in_progress", () => {
    const cycle = activeCycle("achieve", "completed");
    const notes = notesWith({
      evaluate: { x: 1 }, advise: { x: 1 }, learn: { x: 1 },
      act:      { x: 1 }, coach:  { x: 1 }, achieve: { x: 1 },
    });
    const sig = { applicationsCount: 5, opportunitiesCount: 5 };
    const status = buildStageStatus(cycle, notes, sig);
    for (const s of STAGE_ORDER) expect(status[s]).toBe("completed");
  });
});

describe("buildStageStatus — Advise: notes AND opportunitiesCount >= 1", () => {
  it("notes present + opps >= 1 → completed", () => {
    const cycle = activeCycle("learn");
    const notes = notesWith({ advise: { score: 90 } });
    const sig = { applicationsCount: 0, opportunitiesCount: 5 };
    expect(buildStageStatus(cycle, notes, sig).advise).toBe("completed");
  });

  it("notes present BUT opps = 0 → in_progress (the 'fresh data' gate)", () => {
    const cycle = activeCycle("learn");
    const notes = notesWith({ advise: { score: 90 } });
    const sig = { applicationsCount: 0, opportunitiesCount: 0 };
    expect(buildStageStatus(cycle, notes, sig).advise).toBe("in_progress");
  });

  it("notes empty + opps >= 1 → in_progress (still need real notes)", () => {
    const cycle = activeCycle("learn");
    const sig = { applicationsCount: 0, opportunitiesCount: 5 };
    expect(buildStageStatus(cycle, NO_NOTES, sig).advise).toBe("in_progress");
  });
});

describe("buildStageStatus — Act: applications >= 1 is the strict signal", () => {
  it("apps >= 1 → completed regardless of notes", () => {
    const cycle = activeCycle("coach"); // act is past
    const sig = { applicationsCount: 1, opportunitiesCount: 0 };
    expect(buildStageStatus(cycle, NO_NOTES, sig).act).toBe("completed");
  });

  it("apps = 0 + notes present → in_progress (notes alone do NOT satisfy Act)", () => {
    const cycle = activeCycle("coach");
    const notes = notesWith({ act: { strategy: "applied to 5 jobs" } });
    const sig = { applicationsCount: 0, opportunitiesCount: 0 };
    expect(buildStageStatus(cycle, notes, sig).act).toBe("in_progress");
  });

  it("apps = 0 + no notes + Act is the current stage → in_progress (CTA)", () => {
    const cycle = activeCycle("act");
    const sig = { applicationsCount: 0, opportunitiesCount: 0 };
    expect(buildStageStatus(cycle, NO_NOTES, sig).act).toBe("in_progress");
  });
});

describe("buildStageStatus — current stage on an active cycle", () => {
  it("is always in_progress, even when notes + signals satisfy completion", () => {
    const cycle = activeCycle("act"); // current stage
    const notes = notesWith({ act: { x: 1 } });
    const sig = { applicationsCount: 5, opportunitiesCount: 5 };
    // Strict: while the cycle is active, we never auto-graduate the current
    // stage to "completed" — that's controlled by the orchestrator's
    // advance/complete actions.
    expect(buildStageStatus(cycle, notes, sig).act).toBe("in_progress");
  });
});

describe("buildStageStatus — defaults", () => {
  it("works without explicit signals (NO_SIGNALS = zeros)", () => {
    const cycle = activeCycle("learn");
    const status = buildStageStatus(cycle); // all default args
    expect(status.act).toBe("pending");     // future
    expect(status.evaluate).toBe("in_progress"); // past, no notes
  });
});
