import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Settings-pages brief (COWORK-BRIEF-hire-settings-pages-v1) tests.
 *
 * File-content checks, matching the repo's existing node-env vitest
 * convention (no jsdom / @testing-library; dynamic-importing JSX-bearing
 * .tsx files trips vite:import-analysis when tsconfig has jsx=preserve).
 * Verification of authenticated render + form submission belongs to the
 * post-merge / CP smoke tests.
 */

const REPO_ROOT = process.cwd();
function readSource(rel: string): string {
  return readFileSync(join(REPO_ROOT, rel), "utf8");
}

describe("/settings/privacy — hire", () => {
  const src = readSource("src/app/(hire)/hire/settings/privacy/page.tsx");

  it("renders without crashing — module compiles and exports a default function", () => {
    expect(src).toMatch(/export\s+default\s+function\s+HirePrivacySettingsPage\b/);
  });

  it("page title reads 'Privacy & Discoverability'", () => {
    expect(src).toMatch(/Privacy &amp; Discoverability|Privacy & Discoverability/);
  });

  it("reads + writes career_profiles.is_discoverable (CP1 Option 1 routing)", () => {
    expect(src).toMatch(/\.from\(["']career_profiles["']\)/);
    expect(src).toMatch(/is_discoverable/);
  });

  it("does NOT touch user_profiles for discoverability (no migration needed)", () => {
    // Privacy page must not write is_discoverable to user_profiles.
    expect(src).not.toMatch(/\.from\(["']user_profiles["']\)[^;]*is_discoverable/);
  });

  it("renders the discoverability toggle with role=switch", () => {
    expect(src).toMatch(/role=["']switch["']/);
  });

  it("renders the SettingsNav sub-nav at top", () => {
    expect(src).toMatch(/import\s+\{\s*SettingsNav\s*\}/);
    expect(src).toMatch(/<SettingsNav\s*\/?>/);
  });

  it("blocked-employers section displays 'You have not blocked any employers.' when empty", () => {
    expect(src).toMatch(/You have not blocked any employers\./);
  });
});

describe("/settings/billing — hire", () => {
  const src = readSource("src/app/(hire)/hire/settings/billing/page.tsx");

  it("renders without crashing — module compiles and exports a default function", () => {
    expect(src).toMatch(/export\s+default\s+function\s+HireBillingSettingsPage\b/);
  });

  it("page title reads 'Plan & Billing'", () => {
    expect(src).toMatch(/Plan &amp; Billing|Plan & Billing/);
  });

  it("uses hire.* pricing tiers — Free / $49 Starter / $149 Growth / $399 Enterprise", () => {
    // These are the locked hire.* tiers, NOT the job-seeker tiers.
    expect(src).toMatch(/\$0 \/ mo/);
    expect(src).toMatch(/\$49 \/ mo/);
    expect(src).toMatch(/\$149 \/ mo/);
    expect(src).toMatch(/\$399 \/ mo/);
    expect(src).toMatch(/\bStarter\b/);
    expect(src).toMatch(/\bGrowth\b/);
    expect(src).toMatch(/\bEnterprise\b/);
  });

  it("does NOT contain job-seeker tier names ($9.99 / $18.99 / $29.99 / Standard / Pro)", () => {
    expect(src).not.toMatch(/\$9\.99/);
    expect(src).not.toMatch(/\$18\.99/);
    expect(src).not.toMatch(/\$29\.99/);
  });

  it("Upgrade CTA is a mailto for now + TODO for Stripe wire-up", () => {
    expect(src).toMatch(/mailto:support@icareeros\.com\?subject=Upgrade%20Request/);
    expect(src).toMatch(/TODO.*Stripe/);
  });

  it("renders the SettingsNav sub-nav at top", () => {
    expect(src).toMatch(/<SettingsNav\s*\/?>/);
  });

  it("does NOT integrate Stripe in this PR", () => {
    expect(src).not.toMatch(/stripe\.checkout|stripe\.session|@stripe\//i);
  });
});

describe("/settings/security — hire", () => {
  const src = readSource("src/app/(hire)/hire/settings/security/page.tsx");

  it("renders without crashing — module compiles and exports a default function", () => {
    expect(src).toMatch(/export\s+default\s+function\s+HireSecuritySettingsPage\b/);
  });

  it("page title reads 'Security'", () => {
    expect(src).toMatch(/>\s*Security\s*</);
  });

  it("password change submits via supabase.auth.updateUser({ password })", () => {
    expect(src).toMatch(/supabase\.auth\.updateUser\(\s*\{\s*password/);
  });

  it("validates min 8 chars + confirmation match", () => {
    expect(src).toMatch(/least 8 characters/);
    expect(src).toMatch(/do not match/);
  });

  it("renders connected-accounts list for Google / GitHub / LinkedIn", () => {
    expect(src).toMatch(/\bGoogle\b/);
    expect(src).toMatch(/\bGitHub\b/);
    expect(src).toMatch(/\bLinkedIn\b/);
  });

  it("renders the SettingsNav sub-nav at top", () => {
    expect(src).toMatch(/<SettingsNav\s*\/?>/);
  });
});

describe("/settings/account — hire (extended)", () => {
  const src = readSource("src/app/(hire)/hire/settings/account/page.tsx");

  it("imports + renders SettingsNav in all 3 render paths", () => {
    expect(src).toMatch(/import\s+\{\s*SettingsNav\s*\}\s+from\s+["']@\/components\/hire\/SettingsNav["']/);
    // 3 render branches: loading, !user, main return — each gets a SettingsNav.
    const matches = src.match(/<SettingsNav\s*\/?>/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(3);
  });

  it("still writes only the 3-column subset (full_name, phone, avatar_url) to user_profiles", () => {
    // Regression — Sprint H1's CP1 decision #5 stays valid.
    expect(src).toMatch(/full_name:/);
    expect(src).toMatch(/phone:/);
    expect(src).toMatch(/avatar_url:/);
    // No location_country / location_state / location_city sneaks back in.
    expect(src).not.toMatch(/location_country:/);
  });
});
