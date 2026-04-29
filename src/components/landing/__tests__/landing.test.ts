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
  { file: "StatsSection.tsx", export: "StatsSection" },
  { file: "CTASection.tsx", export: "CTASection" },
  { file: "LandingNav.tsx", export: "LandingNav" },
  { file: "LandingFooter.tsx", export: "LandingFooter" },
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

  it("root page.tsx imports all landing sections", () => {
    const pageSrc = readFileSync(
      resolve(LANDING_DIR, "../../app/page.tsx"),
      "utf-8"
    );
    for (const { export: name } of COMPONENTS) {
      expect(pageSrc).toContain(name);
    }
  });
});
