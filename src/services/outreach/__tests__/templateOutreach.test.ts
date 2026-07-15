/**
 * feat/jobs-fit-check-internal Task 4 — outreach template tests.
 */
import { describe, it, expect } from "vitest";
import { generateTemplateOutreach } from "../templateOutreach";

describe("generateTemplateOutreach — output shape", () => {
  it("linkedin note is ≤ 300 chars", () => {
    const r = generateTemplateOutreach({
      jobTitle:  "Senior Security Engineer",
      company:   "Acme Corp",
      jobUrl:    "https://example.com/jobs/123",
      candidateHeadline:  "Sr Security Eng — 8 yrs",
      candidateTopSkills: ["Python", "AWS", "Kubernetes"],
    });
    expect(r.linkedin.message.length).toBeLessThanOrEqual(300);
  });

  it("every slot is filled — no {placeholder} leaks", () => {
    const r = generateTemplateOutreach({
      jobTitle: "CISO", company: "Acme",
      jobUrl:   "https://example.com/jobs/abc",
      candidateHeadline:  "Long-tenure Security Executive",
      candidateTopSkills: ["Cloud Security", "GRC"],
    });
    const allText = [
      r.linkedin.message,
      r.email.subject, r.email.message,
      ...r.variants.map(v => `${v.subject} ${v.message}`),
    ].join(" ");
    expect(allText).not.toMatch(/\{\w+\}/);   // no {placeholder}
    expect(allText).not.toMatch(/\[Name\]|\[Role\]|\[Company\]|\[Your name\]/);   // no bracket leftovers
  });

  it("returns exactly 3 variants with the required ids", () => {
    const r = generateTemplateOutreach({
      jobTitle: "PM", company: "Acme", jobUrl: "https://example.com/jobs/xyz",
    });
    expect(r.variants).toHaveLength(3);
    expect(r.variants.map(v => v.id)).toEqual(["warm_intro", "value_led", "referral"]);
    for (const v of r.variants) {
      expect(v.subject).toBeTruthy();
      expect(v.message).toBeTruthy();
      expect(v.label).toBeTruthy();
      expect(v.tone).toBeTruthy();
    }
  });
});

describe("generateTemplateOutreach — deterministic variant rotation", () => {
  it("same jobUrl → byte-identical result on repeated calls", () => {
    const inputs = {
      jobTitle: "Senior Security Engineer", company: "Acme",
      jobUrl:   "https://example.com/jobs/dupe",
      candidateTopSkills: ["Python", "AWS"],
    };
    const a = generateTemplateOutreach(inputs);
    const b = generateTemplateOutreach(inputs);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("different jobUrls can pick different linkedin templates (rotation works)", () => {
    // Try several distinct URLs — with 3 templates and FNV-1a hashing, at
    // least one pair should differ. If they don't, rotation is broken.
    const outputs = ["a", "b", "c", "d", "e", "f", "g", "h"].map(seed =>
      generateTemplateOutreach({
        jobTitle: "PM", company: "Acme", jobUrl: `https://example.com/${seed}`,
      }),
    );
    const uniqueLI = new Set(outputs.map(o => o.linkedin.message));
    expect(uniqueLI.size).toBeGreaterThan(1);
  });
});

describe("generateTemplateOutreach — resilient to missing profile data", () => {
  it("no candidateTopSkills → LinkedIn still under 300 chars, no dangling 'in and'", () => {
    const r = generateTemplateOutreach({
      jobTitle: "PM", company: "Acme", jobUrl: "https://example.com/jobs/1",
      // no candidateTopSkills — this is the empty-profile case
    });
    expect(r.linkedin.message.length).toBeLessThanOrEqual(300);
    expect(r.linkedin.message).not.toMatch(/in\s+and/);
    expect(r.linkedin.message).not.toMatch(/\bundefined\b/i);
  });
});
