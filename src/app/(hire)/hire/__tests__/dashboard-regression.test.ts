import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// vitest runs from the repo root in CI (process.cwd() == repo root).
const REPO_ROOT = process.cwd();

function readSource(rel: string): string {
  return readFileSync(join(REPO_ROOT, rel), "utf8");
}

describe("hire dashboard overview — Sprint H1 regression checks", () => {
  it("/dashboard page no longer imports CandidateSearch (search moved to /select)", () => {
    const src = readSource("src/app/(hire)/hire/dashboard/page.tsx");
    expect(src).not.toMatch(/import\s*\{[^}]*CandidateSearch[^}]*\}/);
    expect(src).not.toMatch(/<CandidateSearch\b/);
  });

  it("/dashboard page renders PathwayRing as the iCareerOS overview", () => {
    const src = readSource("src/app/(hire)/hire/dashboard/page.tsx");
    expect(src).toMatch(/PathwayRing/);
    expect(src).toMatch(/iCareerOS Dashboard/);
  });

  it("/select page exists and hosts CandidateSearch", () => {
    const src = readSource("src/app/(hire)/hire/select/page.tsx");
    expect(src).toMatch(/CandidateSearch/);
    expect(src).toMatch(/StageHeader/);
  });

  it("CandidateSearch component lives at src/components/hire/ (moved from dashboard)", () => {
    const src = readSource("src/components/hire/CandidateSearch.tsx");
    expect(src.length).toBeGreaterThan(0);
  });

  it("internal hire links to old /dashboard search target are now pointing at /select", () => {
    for (const rel of [
      "src/app/(hire)/hire/candidates/[id]/page.tsx",
      "src/app/(hire)/hire/profile/page.tsx",
      "src/app/(hire)/hire/jobs/page.tsx",
      "src/app/(hire)/hire/invites/page.tsx",
    ]) {
      const src = readSource(rel);
      expect(src).not.toMatch(/href="\/dashboard"/);
    }
  });

  it("/hire index still redirects to /dashboard (preserved by Sprint H1)", () => {
    const src = readSource("src/app/(hire)/hire/page.tsx");
    expect(src).toMatch(/redirect\(["']\/dashboard["']\)/);
  });
});
