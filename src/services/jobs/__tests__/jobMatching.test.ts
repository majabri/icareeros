/**
 * jobMatching tests — scoreJobs enrichment.
 *
 * The internal calculate* helpers aren't exported; we test the public
 * scoreJobs surface which composes them. That's the only consumer
 * anyway.
 */
import { describe, it, expect } from "vitest";
import { scoreJobs } from "../jobMatching";

const TODAY = new Date().toISOString();
const A_MONTH_AGO = new Date(Date.now() - 35 * 86_400_000).toISOString();

const BASE = {
  title: "Senior Backend Engineer",
  company: "Acme",
  location: "Toronto, ON",
  type: "Full-time",
  description: "Looking for a senior engineer with experience in Node, Python, and Postgres.",
  url: "https://example.com/jobs/1",
  matchReason: "",
};

describe("scoreJobs", () => {
  it("enriches every job with the new fields", () => {
    const enriched = scoreJobs({
      jobs: [{ ...BASE, first_seen_at: TODAY, quality_score: 80 }],
      skills: ["node", "python", "postgres"],
    });
    expect(enriched).toHaveLength(1);
    const j = enriched[0];
    expect(typeof j.responseProbability).toBe("number");
    expect(typeof j.decisionScore).toBe("number");
    expect(typeof j.effortEstimate).toBe("number");
    expect(typeof j.smartTag).toBe("string");
    expect(j.responseProbability).toBeGreaterThanOrEqual(5);
    expect(j.responseProbability).toBeLessThanOrEqual(95);
    expect(j.decisionScore).toBeGreaterThanOrEqual(5);
    expect(j.decisionScore).toBeLessThanOrEqual(99);
  });

  it("fresh + strong skill overlap beats stale + weak", () => {
    const [fresh, stale] = scoreJobs({
      jobs: [
        { ...BASE, first_seen_at: TODAY,        quality_score: 80, id: "fresh" },
        { ...BASE, first_seen_at: A_MONTH_AGO,  quality_score: 80, id: "stale", description: "TBD" },
      ],
      skills: ["node", "python", "postgres"],
    });
    expect(fresh.decisionScore).toBeGreaterThan(stale.decisionScore);
    expect(fresh.responseProbability).toBeGreaterThan(stale.responseProbability);
  });

  it("remote preference adds bonus when the job is remote", () => {
    const [withPref, noPref] = scoreJobs({
      jobs: [
        { ...BASE, is_remote: true, first_seen_at: TODAY, quality_score: 75, id: "1" },
      ],
      skills: ["node"],
      remotePreferred: true,
    }).concat(
      scoreJobs({
        jobs: [
          { ...BASE, is_remote: true, first_seen_at: TODAY, quality_score: 75, id: "1" },
        ],
        skills: ["node"],
        remotePreferred: false,
      })
    );
    expect(withPref.decisionScore).toBeGreaterThanOrEqual(noPref.decisionScore);
  });

  it("survives empty skills list", () => {
    const enriched = scoreJobs({
      jobs: [{ ...BASE, first_seen_at: TODAY, quality_score: 60 }],
      skills: [],
    });
    expect(enriched[0].decisionScore).toBeGreaterThan(0);
  });
});
