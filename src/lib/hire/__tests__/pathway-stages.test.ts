import { describe, it, expect } from "vitest";
import {
  PATHWAY_STAGES,
  STAGE_DETAILS,
  getStage,
  type StageId,
} from "@/lib/hire/pathway-stages";

describe("PATHWAY_STAGES (single source of truth)", () => {
  it("has exactly 6 stages", () => {
    expect(PATHWAY_STAGES).toHaveLength(6);
  });

  it("stage ids are in canonical order — design, select, integrate, support, develop, retain", () => {
    expect(PATHWAY_STAGES.map((s) => s.id)).toEqual([
      "design",
      "select",
      "integrate",
      "support",
      "develop",
      "retain",
    ]);
  });

  it("Select stage URL is /select (not /dashboard) — locked by ADR-HIRE-001 v3 A2", () => {
    expect(getStage("select")?.route).toBe("/select");
    expect(getStage("select")?.route).not.toBe("/dashboard");
  });

  it("position 2 (Select) color is coral #FF6B6B per ADR v3 A3", () => {
    expect(PATHWAY_STAGES[1].id).toBe("select");
    expect(PATHWAY_STAGES[1].color.toUpperCase()).toBe("#FF6B6B");
  });

  it("colour map matches iCareerOS positional parity (PR #272)", () => {
    expect(PATHWAY_STAGES.map((s) => s.color.toUpperCase())).toEqual([
      "#00B8A9", // 1 teal
      "#FF6B6B", // 2 coral
      "#F5A623", // 3 gold
      "#10B981", // 4 green
      "#7B9AC0", // 5 slate blue
      "#40C9C0", // 6 light teal
    ]);
  });

  it("does NOT include deep purple #6B48FF (dropped by ADR v3 A6)", () => {
    const purples = PATHWAY_STAGES.filter(
      (s) => s.color.toUpperCase() === "#6B48FF",
    );
    expect(purples).toEqual([]);
  });

  it("Design + Select are free; Integrate / Support / Develop / Retain are starter+", () => {
    expect(getStage("design")?.billing).toBe("free");
    expect(getStage("select")?.billing).toBe("free");
    for (const id of ["integrate", "support", "develop", "retain"] as StageId[]) {
      expect(getStage(id)?.billing).toBe("starter");
    }
  });

  it("live stages reflect the current sprint set", () => {
    // Sprint H1 shipped Select live; Sprint H2 (PR #294) ships Design
    // live too with the JD builder + AI agent + write path to
    // opportunities. Future sprints will add Integrate / Support /
    // Develop / Retain to this set as each stage's full build merges.
    const live = PATHWAY_STAGES.filter((s) => s.status === "live").map((s) => s.id);
    expect(live).toContain("select");
    expect(live).toContain("design");
  });

  it("STAGE_DETAILS covers every stage with description + 4 actions", () => {
    for (const stage of PATHWAY_STAGES) {
      const detail = STAGE_DETAILS[stage.id];
      expect(detail).toBeDefined();
      expect(detail.description.length).toBeGreaterThan(20);
      expect(detail.actions).toHaveLength(4);
    }
  });

  it("Design action 4 publishes to the iCareerOS job board (cross-side spec, ADR v3 A7)", () => {
    const actions = STAGE_DETAILS.design.actions;
    expect(actions.some((a) => /iCareerOS/.test(a))).toBe(true);
  });

  it("getStage returns null for unknown ids", () => {
    expect(getStage("nope")).toBeNull();
    expect(getStage("")).toBeNull();
  });
});
