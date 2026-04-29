import { test, expect } from "@playwright/test";

const EMAIL = process.env.E2E_TEST_EMAIL ?? "";
const PASSWORD = process.env.E2E_TEST_PASSWORD ?? "";
const PROBE = EMAIL && PASSWORD;

test.describe("Interview Simulator", () => {
  test.beforeEach(async ({ page }) => {
    if (!PROBE) test.skip();
    await page.goto("/auth/login");
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard", { timeout: 15_000 });
  });

  test("nav link navigates to /interview", async ({ page }) => {
    if (!PROBE) test.skip();
    await page.click('a[href="/interview"]');
    await page.waitForURL("**/interview");
    await expect(page).toHaveURL(/\/interview/);
  });

  test("setup form renders correctly", async ({ page }) => {
    if (!PROBE) test.skip();
    await page.goto("/interview");
    await expect(page.locator("h1")).toContainText("Interview Simulator");
    await expect(page.locator('input[placeholder*="Job Title"], input[placeholder*="Product Manager"]')).toBeVisible();
    await expect(page.locator('button', { hasText: "Start Interview" })).toBeDisabled();
  });

  test("Start Interview button enables when job title entered", async ({ page }) => {
    if (!PROBE) test.skip();
    await page.goto("/interview");
    await page.fill('input[type="text"]', "Software Engineer");
    await expect(page.locator('button', { hasText: "Start Interview" })).toBeEnabled();
  });

  test("interview page is accessible from nav", async ({ page }) => {
    if (!PROBE) test.skip();
    await page.goto("/dashboard");
    const link = page.locator('nav a[href="/interview"]');
    await expect(link).toBeVisible();
  });
});
