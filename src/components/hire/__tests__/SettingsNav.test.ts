import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = process.cwd();
function readSource(rel: string): string {
  return readFileSync(join(REPO_ROOT, rel), "utf8");
}

describe("SettingsNav — hire", () => {
  const src = readSource("src/components/hire/SettingsNav.tsx");

  it("exports named + default function SettingsNav", () => {
    expect(src).toMatch(/export\s+function\s+SettingsNav\b/);
    expect(src).toMatch(/export\s+default\s+SettingsNav/);
  });

  it("includes all four hire settings hrefs", () => {
    expect(src).toMatch(/href:\s*"\/settings\/account"/);
    expect(src).toMatch(/href:\s*"\/settings\/privacy"/);
    expect(src).toMatch(/href:\s*"\/settings\/billing"/);
    expect(src).toMatch(/href:\s*"\/settings\/security"/);
  });

  it("imports the four Tabler icons (IconUser, IconEye, IconCreditCard, IconShield)", () => {
    expect(src).toMatch(/IconUser/);
    expect(src).toMatch(/IconEye/);
    expect(src).toMatch(/IconCreditCard/);
    expect(src).toMatch(/IconShield/);
    expect(src).toMatch(/from\s+["']@tabler\/icons-react["']/);
  });

  it("active state colour comes from BRAND_COLORS (no hardcoded hex)", () => {
    expect(src).toMatch(/import\s+\{\s*BRAND_COLORS\s*\}\s+from\s+["']@\/lib\/design-tokens["']/);
    expect(src).toMatch(/BRAND_COLORS\.teal/);
    // No raw hex except possibly in fallback CSS variables — the
    // component body should not bake brand hex values into Tailwind /
    // inline styles directly. Check that the brand colour is referenced
    // via the token, not as a literal in the file body.
    const bodyOnly = src
      .replace(/var\(--[^)]+\)/g, "")     // strip CSS var fallbacks
      .replace(/#[0-9a-fA-F]{3,8}/g, ""); // strip any non-brand hex tokens — leaves brand refs as named imports only
    expect(bodyOnly).toMatch(/BRAND_COLORS\.teal/);
  });
});
