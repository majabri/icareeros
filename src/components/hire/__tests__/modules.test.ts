import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// vitest runs from the repo root in CI (process.cwd() === repo root).
// File-content checks rather than dynamic imports — the repo's vitest
// setup runs with environment: "node" and no vite-JSX plugin, so
// dynamically importing a .tsx file containing JSX trips
// vite:import-analysis with "If you use tsconfig.json, make sure to
// not set jsx to preserve." That's a non-starter to fix at the test
// level (Next.js needs jsx=preserve in tsconfig). File-content checks
// give the same signal — module exists, exports a named function,
// imports from the single-source-of-truth stage config — without
// pulling JSX through vite's import-analysis.
//
// Authenticated-render + click-through verification of the components
// belongs to the Vercel-preview / production smoke tests, per the
// brief.

const REPO_ROOT = process.cwd();

function readSource(rel: string): string {
  return readFileSync(join(REPO_ROOT, rel), "utf8");
}

describe("hire/* components — file presence + export shape", () => {
  it("PathwayRing exports a named + default function and imports from pathway-stages", () => {
    const src = readSource("src/components/hire/PathwayRing.tsx");
    expect(src).toMatch(/export\s+function\s+PathwayRing\b/);
    expect(src).toMatch(/export\s+default\s+PathwayRing/);
    expect(src).toMatch(/from\s+["']@\/lib\/hire\/pathway-stages["']/);
  });

  it("StageHeader exports a named + default function and imports from pathway-stages", () => {
    const src = readSource("src/components/hire/StageHeader.tsx");
    expect(src).toMatch(/export\s+function\s+StageHeader\b/);
    expect(src).toMatch(/export\s+default\s+StageHeader/);
    expect(src).toMatch(/from\s+["']@\/lib\/hire\/pathway-stages["']/);
  });

  it("StageLocked exports a named + default function, imports pathway-stages, and links to /settings/billing", () => {
    const src = readSource("src/components/hire/StageLocked.tsx");
    expect(src).toMatch(/export\s+function\s+StageLocked\b/);
    expect(src).toMatch(/export\s+default\s+StageLocked/);
    expect(src).toMatch(/from\s+["']@\/lib\/hire\/pathway-stages["']/);
    // Upgrade CTA target — locked decision #5 in ADR-HIRE-001 v3.
    expect(src).toMatch(/href=["']\/settings\/billing["']/);
  });

  it("StageComingSoon exports a named + default function, imports pathway-stages, and does NOT link to /settings/billing (free stage)", () => {
    const src = readSource("src/components/hire/StageComingSoon.tsx");
    expect(src).toMatch(/export\s+function\s+StageComingSoon\b/);
    expect(src).toMatch(/export\s+default\s+StageComingSoon/);
    expect(src).toMatch(/from\s+["']@\/lib\/hire\/pathway-stages["']/);
    // Per strategy-chat directive 2026-05-21: do NOT render the
    // Upgrade CTA for Free-plan stages.
    expect(src).not.toMatch(/href=["']\/settings\/billing["']/);
  });
});
