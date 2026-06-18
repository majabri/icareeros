/**
 * emptyStateCta — pure-function unit tests for the per-stage CTA mapping
 * surfaced on the Career OS dashboard ring.
 *
 * Phase 5 Item 2 — see docs/specs/COWORK-BRIEF-phase5-v1.md.
 */

import { describe, it, expect } from "vitest";
import { emptyStateCta } from "../emptyStateCta";
import type { StageStatusMap } from "../stageStatus";

const ALL_PENDING: StageStatusMap = {
  evaluate: "pending",
  advise:   "pending",
  learn:    "pending",
  act:      "pending",
  achieve:  "pending",
};

describe("emptyStateCta — base rules", () => {
  it("returns null when the stage is already completed", () => {
    const status: StageStatusMap = { ...ALL_PENDING, advise: "completed" };
    const cta = emptyStateCta({
      stage: "advise",
      stageStatus: status,
      currentStage: "advise",
      profileReady: true,
      plan: "starter",
    });
    expect(cta).toBeNull();
  });

  it("returns null when the stage IS the current stage (Run button takes over)", () => {
    const cta = emptyStateCta({
      stage: "evaluate",
      stageStatus: ALL_PENDING,
      currentStage: "evaluate",
      profileReady: true,
      plan: "starter",
    });
    expect(cta).toBeNull();
  });
});

describe("emptyStateCta — Evaluate", () => {
  it("Evaluate (profileReady=false) — clickable link to /mycareer/profile with helper", () => {
    // Sprint 5 fix-pack — was a disabled blocker; now a clickable link.
    const cta = emptyStateCta({
      stage: "evaluate",
      stageStatus: ALL_PENDING,
      currentStage: "advise",   // not evaluate
      profileReady: false,
      plan: "free",
    });
    expect(cta).toMatchObject({
      label: "Complete your Career Profile →",
      href:  "/careerprofile/profile",
    });
    expect(cta?.disabled).toBeFalsy();
    expect(cta?.helper).toMatch(/headline/);
  });

  it("Evaluate (profileReady=true, not current) — 'Open Evaluate' link to /evaluate", () => {
    // Sprint 5 fix-pack — was "Upload your resume" → /mycareer/profile.
    // Now sends the user to the actual stage page where they can Run.
    const cta = emptyStateCta({
      stage: "evaluate",
      stageStatus: ALL_PENDING,
      currentStage: "advise",
      profileReady: true,
      plan: "free",
    });
    expect(cta).toEqual({
      label: "Open Evaluate →",
      href:  "/evaluate",
    });
  });
});

describe("emptyStateCta — Advise / Learn / Achieve now soft-link to their stage pages", () => {
  // Sprint 5 fix-pack — these three were previously disabled blockers.
  // They now link to the stage page so the user can attempt to run.

  it("Advise → 'Open Career Advice →' /advise (no longer disabled)", () => {
    const cta = emptyStateCta({
      stage: "advise",
      stageStatus: ALL_PENDING,
      currentStage: "evaluate",
      profileReady: true,
      plan: "starter",
    });
    expect(cta).toEqual({
      label: "Open Career Advice →",
      href:  "/advise",
    });
    expect(cta?.disabled).toBeFalsy();
  });

  it("Learn → 'Open Learning Plan →' /learn (no longer disabled)", () => {
    const cta = emptyStateCta({
      stage: "learn",
      stageStatus: ALL_PENDING,
      currentStage: "evaluate",
      profileReady: true,
      plan: "starter",
    });
    expect(cta).toEqual({
      label: "Open Learning Plan →",
      href:  "/learn",
    });
    expect(cta?.disabled).toBeFalsy();
  });

  it("Achieve → 'Open Achieve →' /achieve with helper (no longer disabled)", () => {
    const cta = emptyStateCta({
      stage: "achieve",
      stageStatus: ALL_PENDING,
      currentStage: "evaluate",
      profileReady: true,
      plan: "starter",
    });
    expect(cta).toMatchObject({
      label: "Open Achieve →",
      href:  "/achieve",
    });
    expect(cta?.disabled).toBeFalsy();
    expect(cta?.helper).toMatch(/milestone/i);
  });
});

describe("emptyStateCta — Act always links to /jobs", () => {
  it("Act → 'Browse matching opportunities' /opportunities", () => {
    const cta = emptyStateCta({
      stage: "act",
      stageStatus: ALL_PENDING,
      currentStage: "evaluate",
      profileReady: true,
      plan: "free",
    });
    expect(cta).toEqual({
      label: "Browse matching opportunities →",
      href:  "/opportunities",
    });
  });
});

describe("emptyStateCta — pending vs in_progress vs skipped", () => {
  it("non-completed statuses still return a CTA (in_progress)", () => {
    const cta = emptyStateCta({
      stage: "advise",
      stageStatus: { ...ALL_PENDING, advise: "in_progress" },
      currentStage: "evaluate",
      profileReady: true,
      plan: "starter",
    });
    expect(cta).not.toBeNull();
  });

  it("skipped status still returns a CTA (re-runnable)", () => {
    const cta = emptyStateCta({
      stage: "act",
      stageStatus: { ...ALL_PENDING, act: "skipped" },
      currentStage: "achieve",
      profileReady: true,
      plan: "starter",
    });
    expect(cta).toEqual({
      label: "Browse matching opportunities →",
      href:  "/opportunities",
    });
  });
});
