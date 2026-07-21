/**
 * fix/jobs-paste-mode-title — server-side JD → title inference tests.
 *
 * Governance: this suite MUST include a Cohere-CISO regression case. That
 * exact prose ("Cohere seeks a Chief Information Security Officer") is the
 * live-proof example from the 2026-07-18 UI acceptance — it must land as
 * "Chief Information Security Officer".
 *
 * The "no-title-at-all" cases are equally load-bearing: a wrong inferred
 * title is strictly worse than an empty string (see module docstring), so
 * we assert that on ambiguous input the extractor returns "".
 */
import { describe, it, expect } from "vitest";
import { inferJobTitleFromJD } from "../inferJobTitleFromJD";

describe("inferJobTitleFromJD — explicit labels (tier 1, highest confidence)", () => {
  it("recovers 'Job Title: X'", () => {
    expect(inferJobTitleFromJD(
      "About Us\nGreat company.\nJob Title: Staff Engineer\nDetails follow."
    )).toBe("Staff Engineer");
  });

  it("recovers 'Position: X'", () => {
    expect(inferJobTitleFromJD(
      "Position: Senior Product Manager\nWe're hiring."
    )).toBe("Senior Product Manager");
  });

  it("recovers 'Role: X'", () => {
    expect(inferJobTitleFromJD(
      "Role: Head of Growth\nRemote friendly."
    )).toBe("Head of Growth");
  });

  it("recovers 'Title: X'", () => {
    expect(inferJobTitleFromJD(
      "Title — Chief Marketing Officer\nAbout the company…"
    )).toBe("Chief Marketing Officer");
  });
});

describe("inferJobTitleFromJD — prose patterns (tier 2)", () => {
  // ── The regression case — MUST NOT REGRESS ──
  it("Cohere CISO regression: 'Cohere seeks a Chief Information Security Officer'", () => {
    const jd = `Who are we? Cohere is the leading security-first enterprise AI company.

The Opportunity
Cohere seeks a Chief Information Security Officer who can help shape Cohere's security strategy at scale.`;
    expect(inferJobTitleFromJD(jd)).toBe("Chief Information Security Officer");
  });

  it("'seeking a Senior Software Engineer'", () => {
    expect(inferJobTitleFromJD(
      "About the team. We're seeking a Senior Software Engineer to join our platform group."
    )).toBe("Senior Software Engineer");
  });

  it("'hiring a Head of Product'", () => {
    expect(inferJobTitleFromJD(
      "Company XYZ is hiring a Head of Product to lead our zero-to-one team."
    )).toBe("Head of Product");
  });

  it("'looking for a Staff Data Engineer'", () => {
    expect(inferJobTitleFromJD(
      "We're looking for a Staff Data Engineer with 8+ years experience."
    )).toBe("Staff Data Engineer");
  });

  it("'for the role of Director of Security'", () => {
    expect(inferJobTitleFromJD(
      "Apply now for the role of Director of Security based in Toronto."
    )).toBe("Director of Security");
  });

  it("'for the position of VP of Engineering'", () => {
    expect(inferJobTitleFromJD(
      "Consider yourself for the position of VP of Engineering at our growing startup."
    )).toBe("VP of Engineering");
  });

  it("'as our next CTO'", () => {
    expect(inferJobTitleFromJD(
      "Join us as our next CTO reporting to the CEO."
    )).toBe("CTO");
  });
});

describe("inferJobTitleFromJD — first-line fallback (tier 3, lowest confidence)", () => {
  it("recovers a bare title on line 1 (Greenhouse-style header)", () => {
    expect(inferJobTitleFromJD(
      "Business Information Security Officer (BISO)\nToronto, ON\n\nAbout Us\n…"
    )).toBe("Business Information Security Officer");
  });

  it("recovers a simple 2-word title", () => {
    expect(inferJobTitleFromJD(
      "Staff Engineer\n\nRemote — US only\n"
    )).toBe("Staff Engineer");
  });
});

describe("inferJobTitleFromJD — refuses low-confidence guesses (returns '')", () => {
  it("empty JD → ''", () => {
    expect(inferJobTitleFromJD("")).toBe("");
    expect(inferJobTitleFromJD("   \n\n  ")).toBe("");
  });

  it("prose-only intro with no verb-led hint (would have inferred wrong) → ''", () => {
    // NO "seeks/hiring/etc." — nothing to lock onto.
    expect(inferJobTitleFromJD(
      "Who are we? Cohere is the leading security-first enterprise AI company. Great things happen here."
    )).toBe("");
  });

  it("first line is a question → ''", () => {
    expect(inferJobTitleFromJD(
      "Are you ready to change the world?\n\nWe're building tomorrow's tech."
    )).toBe("");
  });

  it("first line starts with a stop-verb (Come/Join/Build etc.) → ''", () => {
    expect(inferJobTitleFromJD(
      "Come join our team\n\nOur mission is bold."
    )).toBe("");
    expect(inferJobTitleFromJD(
      "Build the future with us\n\nSee open roles below."
    )).toBe("");
    expect(inferJobTitleFromJD(
      "At our company we value curiosity\n\nBenefits include RRSP…"
    )).toBe("");
  });

  it("first line is a full sentence → ''", () => {
    expect(inferJobTitleFromJD(
      "The BISO acts as liaison between the CISO and business lines. It is a great role."
    )).toBe("");
  });

  it("single-word non-acronym first line → ''", () => {
    expect(inferJobTitleFromJD(
      "Cohere\n\nAbout the company."
    )).toBe("");
  });

  it("first line > 80 chars → ''", () => {
    const longLine = "This is a very long marketing sentence that goes on and on and describes the company vision at length before ever getting to the actual job details";
    expect(inferJobTitleFromJD(longLine + "\n\nWe're a company.")).toBe("");
  });
});

describe("inferJobTitleFromJD — cleanup / defensive", () => {
  it("strips trailing 'who…' clause", () => {
    // seeks a Chief Information Security Officer who can help shape…
    // ⇒ "Chief Information Security Officer"
    expect(inferJobTitleFromJD(
      "Cohere seeks a Chief Information Security Officer who can help shape strategy."
    )).toBe("Chief Information Security Officer");
  });

  it("prefers label over prose when both present", () => {
    // Label is tier 1 → wins.
    expect(inferJobTitleFromJD(
      "Job Title: Staff Product Manager\nWe are hiring a Junior Engineer."
    )).toBe("Staff Product Manager");
  });

  it("safe on non-string input (defensive)", () => {
    // @ts-expect-error — testing defensive path
    expect(inferJobTitleFromJD(null)).toBe("");
    // @ts-expect-error — testing defensive path
    expect(inferJobTitleFromJD(undefined)).toBe("");
    // @ts-expect-error — testing defensive path
    expect(inferJobTitleFromJD(42)).toBe("");
  });
});
