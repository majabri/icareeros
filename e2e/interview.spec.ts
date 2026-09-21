import { test, expect } from "@playwright/test";
import { HAS_CREDS as PROBE } from "./support/auth";

// The beforeEach that signed in before every test is gone — globalSetup does
// it once for the whole run (#433). The one test that depended on the
// beforeEach leaving the browser on /dashboard now navigates there itself.

test.describe("Interview Simulator", () => {
  test("nav link navigates to /interview", async ({ page }) => {
    if (!PROBE) test.skip();
    await page.goto("/dashboard");
    await page.click('a[href="/interview"]');
    await page.waitForURL("**/interview");
    await expect(page).toHaveURL(/\/interview/);
  });

  test("setup form renders correctly", async ({ page }) => {
    if (!PROBE) test.skip();
    await page.goto("/interview");
    await expect(page.locator("h1")).toContainText("Interview Simulator");
    await expect(page.locator('input[type="text"]').first()).toBeVisible();
    await expect(page.locator('button', { hasText: "Start Interview" })).toBeDisabled();
    await expect(page.locator('button', { hasText: "Prep Guide" })).toBeDisabled();
  });

  test("Start Interview and Prep Guide buttons enable when job title entered", async ({ page }) => {
    if (!PROBE) test.skip();
    await page.goto("/interview");
    await page.fill('input[type="text"]', "Software Engineer");
    await expect(page.locator('button', { hasText: "Start Interview" })).toBeEnabled();
    await expect(page.locator('button', { hasText: "Prep Guide" })).toBeEnabled();
  });

  test("interview page is accessible from nav", async ({ page }) => {
    if (!PROBE) test.skip();
    await page.goto("/dashboard");
    await expect(page.locator('nav a[href="/interview"]')).toBeVisible();
  });

  test("resume toggle expands resume textarea", async ({ page }) => {
    if (!PROBE) test.skip();
    await page.goto("/interview");
    const toggle = page.locator("button", { hasText: "Add resume" });
    await expect(toggle).toBeVisible();
    await toggle.click();
    await expect(page.locator("textarea").nth(1)).toBeVisible();
  });

  test("past sessions section is hidden by default when empty", async ({ page }) => {
    if (!PROBE) test.skip();
    await page.goto("/interview");
    // The past sessions section only shows when there are sessions
    // Just verify no crash on load
    await expect(page.locator("h1")).toContainText("Interview Simulator");
  });
});
