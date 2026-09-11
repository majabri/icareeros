import { defineConfig, devices } from "@playwright/test";

/**
 * E2E tests run against the live staging deployment on Vercel.
 *
 * Staging URL: https://icareeros.vercel.app
 * Supabase project: kuneabeiwcxavvyyfjkx (dev/staging)
 *
 * Run locally:  npx playwright test
 * Run with UI:  npx playwright test --ui
 *
 * Dashboard content tests require a real Supabase session.
 * They are skipped in CI until STAGING_SUPABASE_ANON_KEY is added as a secret
 * and a test user is created in the staging Supabase project.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  // CI emits three things: "github" for inline PR annotations, "html" for a
  // browsable report uploaded as an artifact, and "json" for the failure digest
  // the workflow prints at the end of the log (scripts/e2e-failure-digest.mjs).
  // Before this, CI kept only "github", so a failed run told you WHICH tests
  // failed and never WHY — the report was never written or uploaded anywhere.
  reporter: process.env.CI
    ? [
        ["github"],
        ["html", { open: "never" }],
        ["json", { outputFile: "test-results/results.json" }],
      ]
    : [["list"]],

  use: {
    // In CI: test against the live Vercel deployment (no local server needed)
    // Locally: test against localhost:3000 (or override with PLAYWRIGHT_BASE_URL)
    baseURL:
      process.env.PLAYWRIGHT_BASE_URL ??
      (process.env.CI
        ? "https://icareeros.vercel.app"
        : "http://localhost:3000"),
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  // Chromium-engine projects only. The CI workflow installs the chromium
  // browser alone, so the firefox / webkit / mobile-safari projects added in
  // Sprint 4 W2-C had no binary to launch and failed every test in CI — see
  // issue #429. They are removed rather than papered over: with workers: 1 and
  // fullyParallel: false, five real engines do not fit the job's time budget.
  // To restore cross-browser coverage, add the projects back AND install their
  // browsers in .github/workflows/e2e.yml, ideally on a separate nightly job.
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    // Mobile viewport, Chrome engine on Android — same binary as chromium.
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 7"] },
    },
  ],

  // Only start local dev server when NOT in CI (CI uses the live Vercel deployment)
  webServer: process.env.CI
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:3000",
        reuseExistingServer: true,
        timeout: 60_000,
      },
});
