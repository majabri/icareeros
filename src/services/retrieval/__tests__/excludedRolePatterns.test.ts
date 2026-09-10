import { describe, expect, it } from "vitest";
import { filterExcludedRolePatterns } from "../../../../supabase/functions/curate-user-recommendations/lib";

const jobs = [
  { title: "Pfizer CISO Marketing" },
  { title: "Sales Engineer" },
  { title: "Salesforce Director" },
  { title: "Director of Security" },
];

describe("curated recommendation role-pattern exclusions", () => {
  it("drops a matching Pfizer Marketing CISO row", () => {
    expect(filterExcludedRolePatterns(jobs, ["marketing"])).toEqual([
      jobs[1], jobs[2], jobs[3],
    ]);
  });

  it("returns all rows unchanged when exclusions are empty", () => {
    expect(filterExcludedRolePatterns(jobs, [])).toEqual(jobs);
  });

  it("matches case-insensitively", () => {
    expect(filterExcludedRolePatterns(jobs, ["MARKETING"])).toEqual([
      jobs[1], jobs[2], jobs[3],
    ]);
  });

  it("uses intentional partial-word substring matching", () => {
    expect(filterExcludedRolePatterns(jobs, ["sales"])).toEqual([
      jobs[0], jobs[3],
    ]);
  });
});
