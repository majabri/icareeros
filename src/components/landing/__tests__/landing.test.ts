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
  { file: "HeroSection.tsx", export: "HeroSection" },
  { file: "LifecycleSection.tsx", export: "LifecycleSection" },
  { file: "FeaturesSection.tsx", export: "FeaturesSection" },
  { file: "CTASection.tsx", export: "CTASection" },
  { file: "LandingNav.tsx", export: "LandingNav" },
  { file: "JobsHeroSection.tsx", export: "JobsHeroSection" },
  { file: "JobsCTASection.tsx", export: "JobsCTASection" },
  { file: "JobsLandingNav.tsx", export: "JobsLandingNav" },
  { file: "HireHeroSection.tsx", export: "HireHeroSection" },
  { file: "HireHowItWorksSection.tsx", export: "HireHowItWorksSection" },
  { file: "HireFeaturesSection.tsx", export: "HireFeaturesSection" },
  { file: "HireFAQSection.tsx", export: "HireFAQSection" },
  { file: "HireLandingNav.tsx", export: "HireLandingNav" },
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

  it("page.tsx branches on the x-platform header", () => {
    const pageSrc = readFileSync(
      resolve(LANDING_DIR, "../../app/page.tsx"),
      "utf-8"
    );
    // Header-driven branching (Option A from COWORK-BRIEF-platform-landing-v1)
    expect(pageSrc).toContain('"x-platform"');
    expect(pageSrc).toMatch(/RootLanding/);
    expect(pageSrc).toMatch(/JobsLanding/);
    expect(pageSrc).toMatch(/HireLanding/);
  });

  it("generateMetadata returns per-host canonical URLs", () => {
    const pageSrc = readFileSync(
      resolve(LANDING_DIR, "../../app/page.tsx"),
      "utf-8"
    );
    expect(pageSrc).toContain('"https://icareeros.com"');
    expect(pageSrc).toContain('"https://jobs.icareeros.com"');
    expect(pageSrc).toContain('"https://hire.icareeros.com"');
    expect(pageSrc).toContain('locale: "en_US"');
  });

  it("middleware leaves unauthenticated hire.* `/` to render src/app/page.tsx", () => {
    const mw = readFileSync(
      resolve(LANDING_DIR, "../../middleware.ts"),
      "utf-8"
    );
    // The general hire.* rewrite must explicitly skip "/" so the request
    // continues to getUser() (Phase 4 split — unauthed lands on HireLanding,
    // authed gets rewritten to /hire/dashboard below).
    expect(mw).toContain('pathname !== "/"');
    expect(mw).toMatch(/isHireHost\s*&&\s*pathname\s*===\s*"\/"\s*&&\s*user/);
  });
});
