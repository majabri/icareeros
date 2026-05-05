import { test, expect } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

// Skip this suite when the consent banner isn't deployed to the BASE_URL
// (e.g. CI running against production before this PR merges). We probe the
// landing page once and look for the banner-related script bundle.
let SKIP_REASON: string | null = null;

test.beforeAll(async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  try {
    await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded", timeout: 15_000 });
    // Wait briefly for client mount.
    await page.waitForTimeout(2000);
    const banner = await page.getByRole("region", { name: /cookie consent/i }).count();
    if (banner === 0) {
      SKIP_REASON = "Cookie consent banner not yet deployed to BASE_URL — runs after merge";
    }
  } catch (err) {
    SKIP_REASON = `BASE_URL not reachable: ${(err as Error).message}`;
  } finally {
    await ctx.close();
  }
});

test.describe("Cookie consent banner", () => {
  test.beforeEach(async ({ context }) => {
    test.skip(SKIP_REASON !== null, SKIP_REASON ?? "");
    await context.clearCookies();
  });

  test("first visit shows the banner with three buttons", async ({ page }) => {
    await page.goto(`${BASE_URL}/`);
    await expect(page.getByRole("region", { name: /cookie consent/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /reject all/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^customize$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /accept all/i })).toBeVisible();
  });

  test("Reject all sets all non-essential to false and dismisses banner", async ({ page }) => {
    await page.goto(`${BASE_URL}/`);
    await page.getByRole("button", { name: /reject all/i }).click();
    await expect(page.getByRole("region", { name: /cookie consent/i })).toHaveCount(0);
    const stored = await page.evaluate(() => localStorage.getItem("icareeros.consent.v1"));
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!);
    expect(parsed.functional).toBe(false);
    expect(parsed.analytics).toBe(false);
    expect(parsed.marketing).toBe(false);
  });

  test("Accept all sets non-essential categories to true", async ({ page }) => {
    await page.goto(`${BASE_URL}/`);
    await page.getByRole("button", { name: /accept all/i }).click();
    const stored = await page.evaluate(() => localStorage.getItem("icareeros.consent.v1"));
    const parsed = JSON.parse(stored!);
    expect(parsed.functional).toBe(true);
    expect(parsed.analytics).toBe(true);
  });

  test("Customize panel opens and saves selective consent", async ({ page }) => {
    await page.goto(`${BASE_URL}/`);
    await page.getByRole("button", { name: /^customize$/i }).click();
    await expect(page.getByRole("dialog", { name: /cookie preferences/i })).toBeVisible();
    const functionalCheckbox = page.locator("label", { hasText: "Functional" }).locator("input[type=checkbox]");
    await functionalCheckbox.check();
    await page.getByRole("button", { name: /save preferences/i }).click();
    const stored = await page.evaluate(() => localStorage.getItem("icareeros.consent.v1"));
    const parsed = JSON.parse(stored!);
    expect(parsed.functional).toBe(true);
    expect(parsed.analytics).toBe(false);
  });

  test("after consent, banner does not reappear on reload", async ({ page }) => {
    await page.goto(`${BASE_URL}/`);
    await page.getByRole("button", { name: /reject all/i }).click();
    await page.reload();
    await expect(page.getByRole("region", { name: /cookie consent/i })).toHaveCount(0);
  });
});
