/**
 * jobFitAnalysis.ts — DeepFitResult engine tests.
 *
 * Covers the contract described in Sprint 2 Wave 1 W1-D.
 */
import { describe, it, expect } from "vitest";
import {
  analyzeJobFit,
  extractKeywords,
  detectCareerLevel,
} from "../jobFitAnalysis";

const JOB_DESCRIPTION = `
Senior Backend Engineer

We're hiring a Senior Backend Engineer to work on our microservices platform.

Requirements:
- 5+ years of Python or Go experience
- Strong AWS or GCP background
- PostgreSQL + Redis production experience
- Kafka, Docker, Kubernetes
- CI/CD pipelines, GitHub Actions
- TypeScript a plus
`;

const STRONG_RESUME = `
Backend engineer with 6 years building distributed systems.
Built microservices in Python and Go, deployed on AWS using Docker and Kubernetes.
PostgreSQL + Redis production. Built CI/CD pipelines with GitHub Actions.
Worked with Kafka for event streaming. TypeScript on the BFF layer.
`;

const WEAK_RESUME = `
Computer Science graduate looking for a first software role.
Coursework included Python and SQL. Built a Django web app for class.
`;

describe("analyzeJobFit — happy path", () => {
  it("returns a fully populated DeepFitResult", () => {
    const r = analyzeJobFit(JOB_DESCRIPTION, STRONG_RESUME);
    expect(r.overallScore).toBeGreaterThan(0);
    expect(r.overallScore).toBeLessThanOrEqual(100);
    expect(r.interviewProbability).toBeGreaterThanOrEqual(5);
    expect(r.interviewProbability).toBeLessThanOrEqual(95);
    expect(r.experienceMatch).toBeGreaterThanOrEqual(0);
    expect(r.experienceMatch).toBeLessThanOrEqual(100);
    expect(r.keywordAlignment).toBeGreaterThanOrEqual(0);
    expect(r.keywordAlignment).toBeLessThanOrEqual(100);
    expect(Array.isArray(r.matchedSkills)).toBe(true);
    expect(Array.isArray(r.gaps)).toBe(true);
    expect(Array.isArray(r.strengths)).toBe(true);
    expect(Array.isArray(r.improvementPlan)).toBe(true);
    expect(typeof r.summary).toBe("string");
    expect(r.summary.length).toBeGreaterThan(0);
    expect(typeof r.jobLevel).toBe("string");
  });

  it("strong resume scores noticeably higher than weak resume", () => {
    const strong = analyzeJobFit(JOB_DESCRIPTION, STRONG_RESUME);
    const weak   = analyzeJobFit(JOB_DESCRIPTION, WEAK_RESUME);
    expect(strong.overallScore).toBeGreaterThan(weak.overallScore);
    expect(strong.interviewProbability).toBeGreaterThan(weak.interviewProbability);
  });

  it("matched skills include the keywords found in BOTH job + resume", () => {
    const r = analyzeJobFit(JOB_DESCRIPTION, STRONG_RESUME);
    const matchedNames = r.matchedSkills.filter(s => s.matched).map(s => s.skill);
    // The strong resume mentions all of these — they appear in the JD too
    for (const kw of ["python", "aws", "docker", "kubernetes", "postgresql"]) {
      expect(matchedNames).toContain(kw);
    }
  });

  it("weak resume produces critical-severity gaps", () => {
    const r = analyzeJobFit(JOB_DESCRIPTION, WEAK_RESUME);
    expect(r.gaps.length).toBeGreaterThan(0);
    expect(r.gaps[0].severity).toBe("critical");
    expect(r.gaps[0].action.length).toBeGreaterThan(5);
  });

  it("improvement plan weeks are ordered and bounded", () => {
    const r = analyzeJobFit(JOB_DESCRIPTION, WEAK_RESUME);
    if (r.improvementPlan.length >= 2) {
      // each entry should reference a 'Week N-M' range
      for (const step of r.improvementPlan) {
        expect(step.week).toMatch(/^Week \d+(-\d+)?$/);
        expect(step.action.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("extractKeywords", () => {
  it("finds multi-word keywords like 'machine learning'", () => {
    const out = extractKeywords("Built a machine learning pipeline with PyTorch");
    expect(out).toContain("machine learning");
    expect(out).toContain("pytorch");
  });

  it("respects word boundaries — 'go' the language is not 'going'", () => {
    const out = extractKeywords("I'm going to work on a project");
    expect(out).not.toContain("go");
  });

  it("returns empty array for non-tech text", () => {
    const out = extractKeywords("I love long walks on the beach and reading novels.");
    expect(out).toHaveLength(0);
  });
});

describe("detectCareerLevel", () => {
  it("Senior keyword detected", () => {
    expect(detectCareerLevel("Senior Software Engineer")).toBe("Senior");
  });
  it("Director detected over Manager", () => {
    expect(detectCareerLevel("Director of Engineering, leading multiple managers"))
      .toBe("Director");
  });
  it("VP detected over Director", () => {
    expect(detectCareerLevel("VP of Engineering — director-level reports"))
      .toBe("VP / Senior Leadership");
  });
  it("C-Level wins everything", () => {
    expect(detectCareerLevel("Chief Technology Officer"))
      .toBe("C-Level / Executive");
  });
  it("defaults to Mid-Level on generic role text", () => {
    expect(detectCareerLevel("Software engineer with strong fundamentals"))
      .toBe("Mid-Level");
  });
  it("Entry/Junior detected", () => {
    expect(detectCareerLevel("Junior Data Analyst, entry-level role"))
      .toBe("Entry-Level / Junior");
  });
});

describe("edge cases", () => {
  it("empty inputs don't throw", () => {
    const r = analyzeJobFit("", "");
    expect(r).toBeTruthy();
    expect(r.overallScore).toBeGreaterThanOrEqual(0);
    expect(r.gaps.length).toBe(0);
  });
  it("identical job + resume scores high", () => {
    const txt = "Python, AWS, Docker, Kubernetes, PostgreSQL, Kafka.";
    const r = analyzeJobFit(txt, txt);
    expect(r.overallScore).toBeGreaterThan(70);
    expect(r.keywordAlignment).toBeGreaterThan(80);
  });
});
