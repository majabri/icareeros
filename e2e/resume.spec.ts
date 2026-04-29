/**
 * E2E tests for the Resume Builder page (/resume)
 *
 * All tests are probe-guarded: they skip automatically when E2E credentials
 * are not available (CI without secrets, local dev, etc.)
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

test("Resume nav link is visible in AppNav", async ({ page }) => {
  test.skip(!HAS_CREDS, "E2E credentials not set");
  await loginIfNeeded(page);
  await expect(page.locator("nav").getByText("Resume")).toBeVisible();
});

test("Resume page renders heading and tabs", async ({ page }) => {
  test.skip(!HAS_CREDS, "E2E credentials not set");
  await loginIfNeeded(page);
  await page.goto("/resume");
  await expect(page.getByRole("heading", { name: /resume builder/i })).toBeVisible();
  await expect(page.getByText(/paste text/i)).toBeVisible();
  await expect(page.getByText(/upload file/i)).toBeVisible();
});

test("Parse button is disabled when paste tab is empty", async ({ page }) => {
  test.skip(!HAS_CREDS, "E2E credentials not set");
  await loginIfNeeded(page);
  await page.goto("/resume");
  const btn = page.getByRole("button", { name: /parse resume/i });
  await expect(btn).toBeDisabled();
});

test("Parse button enables when text is typed", async ({ page }) => {
  test.skip(!HAS_CREDS, "E2E credentials not set");
  await loginIfNeeded(page);
  await page.goto("/resume");
  await page.fill("textarea", "John Smith\njohn@example.com\nSoftware Engineer at Acme Inc\nBuilt scalable microservices");
  const btn = page.getByRole("button", { name: /parse resume/i });
  await expect(btn).toBeEnabled();
});

test("Upload tab switches input area", async ({ page }) => {
  test.skip(!HAS_CREDS, "E2E credentials not set");
  await loginIfNeeded(page);
  await page.goto("/resume");
  await page.getByText(/upload file/i).click();
  await expect(page.getByText(/drop your resume here/i)).toBeVisible();
});

test("Saved Versions section is visible", async ({ page }) => {
  test.skip(!HAS_CREDS, "E2E credentials not set");
  await loginIfNeeded(page);
  await page.goto("/resume");
  await expect(page.getByText(/saved versions/i)).toBeVisible();
});
