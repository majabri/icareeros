/**
 * SalaryBadge classification tests.
 */
import { describe, it, expect } from "vitest";
import {
  classifySalary,
  parseSalaryNumber,
  estimateMarketRate,
} from "@/components/jobs/SalaryBadge";

describe("SalaryBadge helpers", () => {
  it("parseSalaryNumber returns midpoint for a range", () => {
    expect(parseSalaryNumber("$120,000 - $160,000")).toBe(140_000);
  });
  it("parseSalaryNumber returns the single number when only one is present", () => {
    expect(parseSalaryNumber("$95,000")).toBe(95_000);
  });
  it("parseSalaryNumber returns null on missing input", () => {
    expect(parseSalaryNumber(null)).toBeNull();
    expect(parseSalaryNumber("")).toBeNull();
  });

  it("estimateMarketRate picks up seniority keywords", () => {
    expect(estimateMarketRate("Senior Software Engineer")).toBe(140_000);
    expect(estimateMarketRate("Entry-Level Analyst")).toBe(65_000);
    expect(estimateMarketRate("VP of Engineering")).toBe(230_000);
  });
  it("estimateMarketRate falls back by role family", () => {
    expect(estimateMarketRate("Software Developer")).toBe(120_000);
    expect(estimateMarketRate("Marketing Manager")).toBe(130_000);
  });
});

describe("classifySalary verdict", () => {
  it("above market — 25% over benchmark", () => {
    expect(classifySalary(180_000, "Mid-Level Software Engineer")).toBe("above");
  });
  it("market — within ±10%", () => {
    expect(classifySalary(125_000, "Software Engineer")).toBe("market");
  });
  it("below market — 25% under benchmark", () => {
    expect(classifySalary(90_000, "Software Engineer")).toBe("below");
  });
  it("unknown — missing inputs", () => {
    expect(classifySalary(null, "Senior")).toBe("unknown");
    expect(classifySalary(100_000, null)).toBe("unknown");
  });
});
