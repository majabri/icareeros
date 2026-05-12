/**
 * scoreJobQuality / detectFraudSignals / calculateFraudPenalty tests.
 */
import { describe, it, expect } from "vitest";
import {
  scoreJobQuality,
  detectFraudSignals,
  calculateFraudPenalty,
  hasHighRiskSignals,
  FILTER_THRESHOLD,
} from "../qualityAnalyzer";

const CLEAN_JOB = {
  title: "Senior Software Engineer",
  description:
    "We are looking for a senior backend engineer to join our platform team. " +
    "You will design and ship microservices in Go and TypeScript, mentor " +
    "junior engineers, and own observability for the payments domain.",
  location: "Toronto, ON",
  is_remote: false,
  salary_min: 160_000,
  salary_max: 200_000,
};

describe("qualityAnalyzer — scoreJobQuality", () => {
  it("a clean listing scores at or near 100", () => {
    const r = scoreJobQuality(CLEAN_JOB);
    expect(r.quality_score).toBeGreaterThanOrEqual(FILTER_THRESHOLD);
    expect(r.quality_score).toBeGreaterThanOrEqual(90);
    expect(r.flag_reasons.length).toBe(0);
    expect(r.high_risk).toBe(false);
  });

  it("commission-only listings are penalised and high-risk", () => {
    const r = scoreJobQuality({
      ...CLEAN_JOB,
      description: CLEAN_JOB.description + " Commission only — no base salary.",
    });
    expect(r.flag_reasons).toContain("Commission only");
    expect(r.high_risk).toBe(true);
    expect(r.quality_score).toBeLessThan(80);
  });

  it("urgency language triggers the urgency_keywords penalty", () => {
    const r = scoreJobQuality({ ...CLEAN_JOB, title: "Urgent! Hiring now Software Engineer" });
    expect(r.flag_reasons).toContain("Urgency language");
    expect(r.quality_score).toBeLessThan(100);
  });

  it("missing location AND not-remote AND not-mentioning-remote penalises", () => {
    const r = scoreJobQuality({
      ...CLEAN_JOB,
      location: "",
      is_remote: false,
      description: "We're hiring.",
    });
    expect(r.flag_reasons).toContain("No location info");
  });

  it("payment-required clears the high-risk bar regardless of score", () => {
    const r = scoreJobQuality({
      ...CLEAN_JOB,
      description: CLEAN_JOB.description + " Pay $500 startup cost before training.",
    });
    expect(r.high_risk).toBe(true);
    expect(r.flag_reasons).toContain("Payment required");
  });

  it("survives empty input without throwing", () => {
    const r = scoreJobQuality({
      title: "",
      description: "",
      location: "",
      is_remote: false,
      salary_min: null,
      salary_max: null,
    });
    expect(typeof r.quality_score).toBe("number");
    expect(r.flag_reasons).toContain("Description too short");
  });
});

describe("qualityAnalyzer — penalty math", () => {
  it("multiple signals stack additively up to -100", () => {
    const s = detectFraudSignals({
      title: "Urgent hire — start ASAP",
      description: "Pay upfront fee. Commission only. We're growing fast.",
      location: "",
      is_remote: false,
      salary_min: null,
      salary_max: null,
    });
    const { penalty } = calculateFraudPenalty(s);
    expect(penalty).toBeLessThanOrEqual(-50);
    expect(penalty).toBeGreaterThanOrEqual(-100);
    expect(hasHighRiskSignals(s)).toBe(true);
  });
});
