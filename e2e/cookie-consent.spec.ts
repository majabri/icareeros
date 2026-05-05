import { test, expect } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

test.describe("Cookie consent banner", () => {
  test.beforeEach(async ({ context }) => {
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
    // Marketing is always disabled in UI but stored as user-chosen value.
  });

  test("Customize panel opens and saves selective consent", async ({ page }) => {
    await page.goto(`${BASE_URL}/`);
    await page.getByRole("button", { name: /^customize$/i }).click();
    await expect(page.getByRole("dialog", { name: /cookie preferences/i })).toBeVisible();
    // Functional row label is "Functional"
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

  test("Cookie preferences footer link reopens the customize panel", async ({ page }) => {
    await page.goto(`${BASE_URL}/`);
    await page.getByRole("button", { name: /reject all/i }).click();
    await page.getByRole("button", { name: /cookie preferences/i }).first().click();
    await expect(page.getByRole("dialog", { name: /cookie preferences/i })).toBeVisible();
  });

  test("clearing localStorage triggers the banner again", async ({ page }) => {
    await page.goto(`${BASE_URL}/`);
    await page.getByRole("button", { name: /reject all/i }).click();
    await page.evaluate(() => localStorage.removeItem("icareeros.consent.v1"));
    await page.reload();
    await expect(page.getByRole("region", { name: /cookie consent/i })).toBeVisible();
  });
});
