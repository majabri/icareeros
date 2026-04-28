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
  reporter: process.env.CI ? "github" : "list",

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

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
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
