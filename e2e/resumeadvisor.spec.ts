/**
 * E2E tests for the Resume Advisor page (/resumeadvisor)
 *
 * All tests are probe-guarded: they skip automatically when E2E credentials
 * are not available (CI without secrets, local dev, etc.)
 *
 * The full Resume Builder test suite was retired in PR #106 when the page
 * was rebuilt as Resume Advisor v2 with a new UI. Smoke tests below verify
 * the page mounts and the primary controls render.
 */

import { test, expect } from "@playwright/test";

const HAS_CREDS =
  !!process.env.E2E_TEST_EMAIL && !!process.env.E2E_TEST_PASSWORD;

// ── Auth helper ────────────────────────────────────────────────────────────────

async function loginIfNeeded(page: import("@playwright/test").Page) {
  await page.goto("/auth/login");
  await page.fill('input[type="email"]', process.env.E2E_TEST_EMAIL!);
  await page.fill('input[type="password"]', process.env.E2E_TEST_PASSWORD!);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard/, { timeout: 15000 });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

test("Resume Advisor nav link is visible in AppNav", async ({ page }) => {
  test.skip(!HAS_CREDS, "E2E credentials not set");
  await loginIfNeeded(page);
  // AppNav uses translation key t.nav.resume — visible label may vary by locale,
  // but in en it renders as "Resume". We assert the link target instead.
  await expect(page.locator('nav a[href="/resumeadvisor"]')).toBeVisible();
});

test("Resume Advisor page renders heading", async ({ page }) => {
  test.skip(!HAS_CREDS, "E2E credentials not set");
  await loginIfNeeded(page);
  await page.goto("/resumeadvisor");
  // Heading is "🎯 Resume Advisor" — match on "Resume Advisor" substring
  await expect(page.getByRole("heading", { name: /resume advisor/i })).toBeVisible();
});

test("Resume Advisor page shows Step 1 (resume) and Step 2 (job)", async ({ page }) => {
  test.skip(!HAS_CREDS, "E2E credentials not set");
  await loginIfNeeded(page);
  await page.goto("/resumeadvisor");
  await expect(page.getByText(/step 1/i)).toBeVisible();
  await expect(page.getByText(/step 2/i)).toBeVisible();
});

test("Old /resume route returns 404 (route was deleted in PR #106)", async ({ page }) => {
  test.skip(!HAS_CREDS, "E2E credentials not set");
  await loginIfNeeded(page);
  const response = await page.goto("/resume");
  expect(response?.status()).toBe(404);
});
