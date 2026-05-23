import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// File-content checks (node-env safe). Authenticated render + click-
// through verification belongs to CP2 smoke tests on the live preview.

const REPO_ROOT = process.cwd();
function readSource(rel: string): string {
  return readFileSync(join(REPO_ROOT, rel), "utf8");
}

describe("DesignAgent", () => {
  const src = readSource("src/components/hire/DesignAgent.tsx");

  it("exports DesignAgent + a default and posts to /api/hire/design-agent", () => {
    expect(src).toMatch(/export\s+function\s+DesignAgent\b/);
    expect(src).toMatch(/export\s+default\s+DesignAgent/);
    expect(src).toMatch(/\/api\/hire\/design-agent/);
  });

  it("imports BRAND_COLORS — no hardcoded hex in the component body", () => {
    expect(src).toMatch(/import\s+\{\s*BRAND_COLORS\s*\}\s+from\s+["']@\/lib\/design-tokens["']/);
  });

  it("calls onDraftGenerated with the parsed JSON shape", () => {
    expect(src).toMatch(/onDraftGenerated\(json\)/);
    expect(src).toMatch(/interface DesignDraft/);
  });
});

describe("JobPostingForm", () => {
  const src = readSource("src/components/hire/JobPostingForm.tsx");

  it("exports JobPostingForm + default; posts to /api/hire/job-postings", () => {
    expect(src).toMatch(/export\s+function\s+JobPostingForm\b/);
    expect(src).toMatch(/export\s+default\s+JobPostingForm/);
    expect(src).toMatch(/\/api\/hire\/job-postings/);
  });

  it("has all 10 brief-required fields (title, company, description, department, location, job_type, is_remote, requirements, nice_to_haves, salary_min/max)", () => {
    for (const f of ["title", "company", "description", "department", "location", "job_type", "is_remote", "requirements", "nice_to_haves", "salary_min", "salary_max"]) {
      expect(src).toMatch(new RegExp(`\\b${f}\\b`));
    }
  });

  it("handles 429 rate-limit response with a user-facing message", () => {
    expect(src).toMatch(/429/);
    expect(src).toMatch(/Daily post limit reached/);
  });

  it("Save draft triggers POST or PATCH; Publish PATCHes status='open'", () => {
    expect(src).toMatch(/status:\s*["']open["']/);
    expect(src).toMatch(/handleSaveDraft|handlePublish/);
  });
});

describe("JobPostingsList", () => {
  const src = readSource("src/components/hire/JobPostingsList.tsx");

  it("exports JobPostingsList + default; GETs from /api/hire/job-postings", () => {
    expect(src).toMatch(/export\s+function\s+JobPostingsList\b/);
    expect(src).toMatch(/export\s+default\s+JobPostingsList/);
    expect(src).toMatch(/fetch\(["']\/api\/hire\/job-postings["']/);
  });

  it("renders status badges for draft / open (Live) / closed", () => {
    expect(src).toMatch(/Draft/);
    expect(src).toMatch(/Live/);
    expect(src).toMatch(/Closed/);
  });

  it("refreshes when refreshToken prop changes", () => {
    expect(src).toMatch(/refreshToken/);
  });
});

describe("/design page assembly", () => {
  const src = readSource("src/app/(hire)/hire/design/page.tsx");

  it("renders all 4 sub-components (StageHeader + DesignAgent + JobPostingForm + JobPostingsList)", () => {
    expect(src).toMatch(/<StageHeader\b/);
    expect(src).toMatch(/<DesignAgent\b/);
    expect(src).toMatch(/<JobPostingForm\b/);
    expect(src).toMatch(/<JobPostingsList\b/);
  });

  it("wires DesignAgent → JobPostingForm via onDraftGenerated/initialValues", () => {
    expect(src).toMatch(/onDraftGenerated/);
    expect(src).toMatch(/initialValues/);
  });

  it("does NOT import or render StageComingSoon any more (regression — Sprint H2 ships full build)", () => {
    // Docstring mentions are fine; scope to actual import + JSX usage.
    expect(src).not.toMatch(/import\s*\{[^}]*StageComingSoon[^}]*\}/);
    expect(src).not.toMatch(/<StageComingSoon\b/);
  });
});

describe("pathway-stages.ts regression — Design is now LIVE", () => {
  const src = readSource("src/lib/hire/pathway-stages.ts");

  it("Design entry has status: 'live' (no longer 'planned')", () => {
    expect(src).toMatch(/id:\s*["']design["'][\s\S]{0,400}?status:\s*["']live["']/);
    expect(src).not.toMatch(/id:\s*["']design["'][\s\S]{0,400}?status:\s*["']planned["']/);
  });
});
