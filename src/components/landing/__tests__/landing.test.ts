/**
 * Landing page component file-existence tests.
 *
 * Vitest runs in node mode (no JSX transform), so we verify the
 * component files exist and export the expected symbols by reading
 * their source rather than importing JSX.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

const LANDING_DIR = resolve(__dirname, "..");

function src(file: string) {
  return readFileSync(resolve(LANDING_DIR, file), "utf-8");
}

// Components imported by root page.tsx.
// Per COWORK-BRIEF-platform-subdomain-landings-v2 (2026-06-17): the two
// audience deep-dive sections (RootJobSeekerSection, RootHiringTeamSection)
// are no longer imported by root — they live only inside JobsLanding /
// HireLanding now. Their files still exist (SECTION_COMPONENTS below).
const ROOT_COMPONENTS = [
  { file: "LandingNav.tsx",             export: "LandingNav" },
  { file: "RootHeroSection.tsx",        export: "RootHeroSection" },
  { file: "RootPlatformInnovation.tsx", export: "RootPlatformInnovation" },
  { file: "RootVisionSection.tsx",      export: "RootVisionSection" },
  { file: "RootCTASection.tsx",         export: "RootCTASection" },
] as const;

// Audience deep-dive sections — files must still exist and export their
// component (embedded inside JobsLanding / HireLanding), but root no
// longer imports them.
const SECTION_COMPONENTS = [
  { file: "RootJobSeekerSection.tsx",  export: "RootJobSeekerSection" },
  { file: "RootHiringTeamSection.tsx", export: "RootHiringTeamSection" },
] as const;

// Per COWORK-BRIEF-platform-subdomain-landings-v1 (2026-05-27): the
// Phase 5 collapse is reversed. jobs.* and hire.* now serve their own
// standalone landings; each has its own nav and a wrapper component
// that composes the audience section. The back-link to root that the
// subdomain navs originally carried was removed per Strategy 2026-06-20
// (feat/platform-nav-freeze) — the logo click is now the only
// affordance back to icareeros.com root.
const SUBDOMAIN_COMPONENTS = [
  { file: "JobsLandingNav.tsx", export: "JobsLandingNav" },
  { file: "HireLandingNav.tsx", export: "HireLandingNav" },
  { file: "JobsLanding.tsx",    export: "JobsLanding" },
  { file: "HireLanding.tsx",    export: "HireLanding" },
] as const;

describe("Landing page component files", () => {
  for (const { file, export: name } of [...ROOT_COMPONENTS, ...SECTION_COMPONENTS, ...SUBDOMAIN_COMPONENTS]) {
    it(`${file} exists and exports ${name}`, () => {
      expect(existsSync(resolve(LANDING_DIR, file))).toBe(true);
      const code = src(file);
      expect(code).toMatch(new RegExp(`export\\s+(function|const)\\s+${name}`));
    });
  }

  it("root page.tsx imports every root landing section", () => {
    const pageSrc = readFileSync(
      resolve(LANDING_DIR, "../../app/page.tsx"),
      "utf-8"
    );
    for (const { export: name } of ROOT_COMPONENTS) {
      expect(pageSrc).toContain(name);
    }
  });

  it("root page.tsx no longer imports or renders the two audience deep-dive sections (v2 2026-06-17)", () => {
    // Per COWORK-BRIEF-platform-subdomain-landings-v2: RootJobSeekerSection
    // and RootHiringTeamSection live ONLY inside JobsLanding / HireLanding.
    // Root surface is now a thin front door (hero + platform overview +
    // vision + CTA).
    //
    // Asserting on import statements + JSX render (not arbitrary string
    // mention) so the doc comment is free to reference the symbols.
    const pageSrc = readFileSync(
      resolve(LANDING_DIR, "../../app/page.tsx"),
      "utf-8"
    );
    for (const { export: name } of SECTION_COMPONENTS) {
      const importRe = new RegExp(`import\\s*\\{\\s*${name}\\s*\\}`);
      const renderRe = new RegExp(`<${name}\\s*/?>`);
      expect(pageSrc).not.toMatch(importRe);
      expect(pageSrc).not.toMatch(renderRe);
    }
  });

  it("page.tsx branches on x-platform and renders subdomain landings", () => {
    const pageSrc = readFileSync(
      resolve(LANDING_DIR, "../../app/page.tsx"),
      "utf-8"
    );
    // Rev 2026-05-27 — subdomain landings restored. page.tsx now reads
    // the x-platform middleware header and dispatches to JobsLanding /
    // HireLanding / RootLanding accordingly.
    expect(pageSrc).toContain('"x-platform"');
    expect(pageSrc).toMatch(/JobsLanding/);
    expect(pageSrc).toMatch(/HireLanding/);
    expect(pageSrc).toMatch(/function LandingPage\(\)/);
  });

  it("page.tsx exports the root canonical (subdomain canonicals not duplicated here)", () => {
    const pageSrc = readFileSync(
      resolve(LANDING_DIR, "../../app/page.tsx"),
      "utf-8"
    );
    expect(pageSrc).toContain('"https://icareeros.com"');
    expect(pageSrc).toContain('locale: "en_US"');
  });

  it("middleware no longer 308-redirects unauth subdomain `/` to root anchors", () => {
    const mw = readFileSync(
      resolve(LANDING_DIR, "../../middleware.ts"),
      "utf-8"
    );
    // Phase 5 unauth-redirect blocks removed. The auth-path rewrites
    // remain — authed jobs.* `/` → /dashboard; authed hire.* `/` is
    // rewritten to /hire/dashboard via Phase 4.
    expect(mw).not.toContain('"https://icareeros.com/#job-seekers"');
    expect(mw).not.toContain('"https://icareeros.com/#hiring-teams"');
    expect(mw).toMatch(/isJobsHost\s*&&\s*pathname\s*===\s*"\/"\s*&&\s*user/);
    expect(mw).toMatch(/isHireHost\s*&&\s*pathname\s*===\s*"\/"\s*&&\s*user/);
  });

  it("LandingNav 'For Job Seekers' / 'For Hiring Teams' link to subdomains", () => {
    const navSrc = src("LandingNav.tsx");
    expect(navSrc).toContain('"https://jobs.icareeros.com"');
    expect(navSrc).toContain('"https://hire.icareeros.com"');
    // The old in-page scroll anchors for those audiences are no longer
    // in the nav (the section anchors themselves still exist on the
    // root page for direct linking from email/etc.).
    expect(navSrc).not.toMatch(/"#job-seekers"/);
    expect(navSrc).not.toMatch(/"#hiring-teams"/);
  });

  it("subdomain landing nav components no longer contain the back-link (removed per Strategy 2026-06-20)", () => {
    for (const file of ["JobsLandingNav.tsx", "HireLandingNav.tsx"]) {
      const code = src(file);
      // The literal "← iCareerOS" string must not appear anywhere (text, attribute, or import).
      expect(code).not.toMatch(/← iCareerOS/);
      // The Logo still links to icareeros.com — that's the new home affordance (PR #306).
      expect(code).toContain('href="https://icareeros.com"');
    }
  });

  it("subdomain landing nav components have sticky positioning with backdrop blur", () => {
    for (const file of ["JobsLandingNav.tsx", "HireLandingNav.tsx", "LandingNav.tsx"]) {
      const code = src(file);
      expect(code).toMatch(/position: "sticky"/);
      expect(code).toMatch(/top: 0/);
      expect(code).toMatch(/backdropFilter: "blur\(8px\)"/);
    }
  });
});
