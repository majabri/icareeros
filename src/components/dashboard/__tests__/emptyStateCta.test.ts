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
  coach:    "pending",
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
  it("disabled 'Complete your profile first' when profileReady=false", () => {
    const cta = emptyStateCta({
      stage: "evaluate",
      stageStatus: ALL_PENDING,
      currentStage: "advise",   // not evaluate
      profileReady: false,
      plan: "free",
    });
    expect(cta).toMatchObject({
      label: "Complete your Career Profile first",
      disabled: true,
    });
    expect(cta?.href).toBeUndefined();
    expect(cta?.helper).toMatch(/headline/);
  });

  it("'Upload your resume' link when profileReady=true and not the current stage", () => {
    const cta = emptyStateCta({
      stage: "evaluate",
      stageStatus: ALL_PENDING,
      currentStage: "advise",
      profileReady: true,
      plan: "free",
    });
    expect(cta).toEqual({
      label: "Upload your resume to get started →",
      href:  "/mycareer/profile",
    });
  });
});

describe("emptyStateCta — Advise / Learn / Achieve are disabled prompts", () => {
  it("Advise: 'Complete Evaluate first' disabled", () => {
    const cta = emptyStateCta({
      stage: "advise",
      stageStatus: ALL_PENDING,
      currentStage: "evaluate",
      profileReady: true,
      plan: "starter",
    });
    expect(cta?.disabled).toBe(true);
    expect(cta?.label).toMatch(/Complete Evaluate first/);
    expect(cta?.href).toBeUndefined();
  });

  it("Learn: 'Complete Advise' disabled", () => {
    const cta = emptyStateCta({
      stage: "learn",
      stageStatus: ALL_PENDING,
      currentStage: "evaluate",
      profileReady: true,
      plan: "starter",
    });
    expect(cta?.disabled).toBe(true);
    expect(cta?.label).toMatch(/Complete Advise/);
  });

  it("Achieve: 'Your achievements will appear here' disabled", () => {
    const cta = emptyStateCta({
      stage: "achieve",
      stageStatus: ALL_PENDING,
      currentStage: "evaluate",
      profileReady: true,
      plan: "starter",
    });
    expect(cta?.disabled).toBe(true);
    expect(cta?.label).toMatch(/achievements will appear here/);
  });
});

describe("emptyStateCta — Act always links to /jobs", () => {
  it("Act → 'Browse matching opportunities' /jobs", () => {
    const cta = emptyStateCta({
      stage: "act",
      stageStatus: ALL_PENDING,
      currentStage: "evaluate",
      profileReady: true,
      plan: "free",
    });
    expect(cta).toEqual({
      label: "Browse matching opportunities →",
      href:  "/jobs",
    });
  });
});

describe("emptyStateCta — Coach branches on plan", () => {
  it("free plan → 'Upgrade to chat...' /settings/billing", () => {
    const cta = emptyStateCta({
      stage: "coach",
      stageStatus: ALL_PENDING,
      currentStage: "evaluate",
      profileReady: true,
      plan: "free",
    });
    expect(cta).toEqual({
      label: "Upgrade to chat with your coach →",
      href:  "/settings/billing",
    });
  });

  it("starter / standard / pro → 'Chat with your coach' /coach", () => {
    for (const plan of ["starter", "standard", "pro"] as const) {
      const cta = emptyStateCta({
        stage: "coach",
        stageStatus: ALL_PENDING,
        currentStage: "evaluate",
        profileReady: true,
        plan,
      });
      expect(cta).toEqual({
        label: "Chat with your coach →",
        href:  "/coach",
      });
    }
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
      currentStage: "coach",
      profileReady: true,
      plan: "starter",
    });
    expect(cta).toEqual({
      label: "Browse matching opportunities →",
      href:  "/jobs",
    });
  });
});
