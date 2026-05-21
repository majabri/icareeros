import { describe, it, expect } from "vitest";
import { STAGE_COLORS, stageTint } from "@/lib/career-os/stage-colors";

describe("STAGE_COLORS", () => {
  it("has exactly one entry per stage in the documented order", () => {
    expect(Object.keys(STAGE_COLORS)).toEqual([
      "evaluate", "advise", "learn", "act", "coach", "achieve",
    ]);
  });

  it("matches the platform palette from landing CareerCycleSVG", () => {
    expect(STAGE_COLORS.evaluate).toBe("#00B8A9");
    expect(STAGE_COLORS.advise).toBe("#FF6B6B");
    expect(STAGE_COLORS.learn).toBe("#F5A623");
    expect(STAGE_COLORS.act).toBe("#10B981");
    expect(STAGE_COLORS.coach).toBe("#7B9AC0");
    expect(STAGE_COLORS.achieve).toBe("#40C9C0");
  });

  it("stageTint produces a 10%-opacity overlay for each color", () => {
    expect(stageTint("evaluate")).toBe("#00B8A91A");
    expect(stageTint("achieve")).toBe("#40C9C01A");
  });
});
