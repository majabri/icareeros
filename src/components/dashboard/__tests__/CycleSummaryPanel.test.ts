import { describe, it, expect } from "vitest";
import { pickNextCycleFocus } from "../cycleSummaryUtils";
import type { NextCycleRecommendation } from "@/services/ai/achieveService";

describe("pickNextCycleFocus", () => {
  it("returns undefined when recommendations are undefined", () => {
    expect(pickNextCycleFocus(undefined)).toBeUndefined();
  });

  it("returns undefined when recommendations array is empty", () => {
    expect(pickNextCycleFocus([])).toBeUndefined();
  });

  it("returns the first high-priority focus", () => {
    const recs: NextCycleRecommendation[] = [
      { focus: "Medium focus", priority: "medium" },
      { focus: "High focus A", priority: "high" },
      { focus: "High focus B", priority: "high" },
    ];
    expect(pickNextCycleFocus(recs)).toBe("High focus A");
  });

  it("falls back to first recommendation when none are high priority", () => {
    const recs: NextCycleRecommendation[] = [
      { focus: "Low focus", priority: "low" },
      { focus: "Medium focus", priority: "medium" },
    ];
    expect(pickNextCycleFocus(recs)).toBe("Low focus");
  });

  it("returns focus from single high-priority recommendation", () => {
    const recs: NextCycleRecommendation[] = [
      { focus: "Build product-led growth skills", priority: "high" },
    ];
    expect(pickNextCycleFocus(recs)).toBe("Build product-led growth skills");
  });

  it("prefers high over medium over low", () => {
    const recs: NextCycleRecommendation[] = [
      { focus: "Low thing", priority: "low" },
      { focus: "Medium thing", priority: "medium" },
      { focus: "High thing", priority: "high" },
    ];
    expect(pickNextCycleFocus(recs)).toBe("High thing");
  });
});
