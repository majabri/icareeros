/**
 * Landing page component file-existence tests.
 *
 * Vitest runs in node mode (no JSX transform), so we verify
 * the component files exist and export the expected symbols
 * by reading their source rather than importing JSX.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

const LANDING_DIR = resolve(__dirname, "..");

function src(file: string) {
  return readFileSync(resolve(LANDING_DIR, file), "utf-8");
}

const COMPONENTS = [
  // Root arm — icareeros.com (only landing surface; jobs.* and hire.*
  // unauthenticated `/` are 308-redirected here by middleware Phase 5).
  { file: "LandingNav.tsx", export: "LandingNav" },
  { file: "RootHeroSection.tsx", export: "RootHeroSection" },
  { file: "RootPlatformInnovation.tsx", export: "RootPlatformInnovation" },
  { file: "RootJobSeekerSection.tsx", export: "RootJobSeekerSection" },
  { file: "RootHiringTeamSection.tsx", export: "RootHiringTeamSection" },
  { file: "RootVisionSection.tsx", export: "RootVisionSection" },
  { file: "RootCTASection.tsx", export: "RootCTASection" },
] as const;

describe("Landing page component files", () => {
  for (const { file, export: name } of COMPONENTS) {
    it(`${file} exists and exports ${name}`, () => {
      expect(existsSync(resolve(LANDING_DIR, file))).toBe(true);
      const code = src(file);
      // Named export present
      expect(code).toMatch(new RegExp(`export\\s+(function|const)\\s+${name}`));
    });
  }

  it("root page.tsx imports every landing section", () => {
    const pageSrc = readFileSync(
      resolve(LANDING_DIR, "../../app/page.tsx"),
      "utf-8"
    );
    for (const { export: name } of COMPONENTS) {
      expect(pageSrc).toContain(name);
    }
  });

  it("page.tsx is the single landing render path (Phase 5)", () => {
    const pageSrc = readFileSync(
      resolve(LANDING_DIR, "../../app/page.tsx"),
      "utf-8"
    );
    // Phase 5 — subdomain landings collapsed; page.tsx has a single
    // export with no platform branching. The old x-platform header
    // branch and the JobsLanding/HireLanding render arms are gone.
    expect(pageSrc).not.toContain('"x-platform"');
    expect(pageSrc).not.toMatch(/JobsLanding/);
    expect(pageSrc).not.toMatch(/HireLanding/);
    expect(pageSrc).toMatch(/function LandingPage\(\)/);
  });

  it("page.tsx exports a static root canonical (Phase 5 collapse)", () => {
    const pageSrc = readFileSync(
      resolve(LANDING_DIR, "../../app/page.tsx"),
      "utf-8"
    );
    expect(pageSrc).toContain('"https://icareeros.com"');
    expect(pageSrc).toContain('locale: "en_US"');
    // Per-subdomain canonicals are not generated here anymore; subdomain
    // landings 308-redirect to icareeros.com anchors via middleware.
    expect(pageSrc).not.toContain('"https://jobs.icareeros.com"');
    expect(pageSrc).not.toContain('"https://hire.icareeros.com"');
  });

  it("middleware Phase 5 redirects subdomain `/` to root anchors", () => {
    const mw = readFileSync(
      resolve(LANDING_DIR, "../../middleware.ts"),
      "utf-8"
    );
    // Unauthenticated jobs.* / and hire.* / now 308-redirect into the
    // root landing's per-audience anchors.
    expect(mw).toContain('"https://icareeros.com/#job-seekers"');
    expect(mw).toContain('"https://icareeros.com/#hiring-teams"');
    // Authenticated jobs.* / still routes to the app dashboard, and
    // authed hire.* / still rewrites to /hire/dashboard.
    expect(mw).toMatch(/isJobsHost\s*&&\s*pathname\s*===\s*"\/"/);
    expect(mw).toMatch(/isHireHost\s*&&\s*pathname\s*===\s*"\/"/);
  });
});
