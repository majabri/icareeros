/**
 * E2E tests for the Offer Desk page (/offers)
 *
 * All tests are probe-guarded: skip when E2E credentials are not set.
 */

import { test, expect } from "@playwright/test";

const HAS_CREDS =
  !!process.env.E2E_TEST_EMAIL && !!process.env.E2E_TEST_PASSWORD;

async function loginIfNeeded(page: import("@playwright/test").Page) {
  await page.goto("/auth/login");
  await page.fill('input[type="email"]', process.env.E2E_TEST_EMAIL!);
  await page.fill('input[type="password"]', process.env.E2E_TEST_PASSWORD!);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard/, { timeout: 15000 });
}

test("Offers nav link is visible in AppNav", async ({ page }) => {
  test.skip(!HAS_CREDS, "E2E credentials not set");
  await loginIfNeeded(page);
  await expect(page.locator("nav").getByText("Offers")).toBeVisible();
});

test("Offers page renders heading and Add Offer button", async ({ page }) => {
  test.skip(!HAS_CREDS, "E2E credentials not set");
  await loginIfNeeded(page);
  await page.goto("/offers");
  await expect(page.getByRole("heading", { name: /offer desk/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /add offer/i })).toBeVisible();
});

test("Add Offer button reveals the form", async ({ page }) => {
  test.skip(!HAS_CREDS, "E2E credentials not set");
  await loginIfNeeded(page);
  await page.goto("/offers");
  await page.getByRole("button", { name: /add offer/i }).first().click();
  await expect(page.getByPlaceholder(/e\.g\. google/i)).toBeVisible();
  await expect(page.getByPlaceholder(/senior software engineer/i)).toBeVisible();
});

test("Add Offer form has Company and Role fields", async ({ page }) => {
  test.skip(!HAS_CREDS, "E2E credentials not set");
  await loginIfNeeded(page);
  await page.goto("/offers");
  await page.getByRole("button", { name: /add offer/i }).first().click();
  await expect(page.getByPlaceholder(/e\.g\. google/i)).toBeEnabled();
  await expect(page.getByPlaceholder(/senior software engineer/i)).toBeEnabled();
});

test("Cancel button hides the Add Offer form", async ({ page }) => {
  test.skip(!HAS_CREDS, "E2E credentials not set");
  await loginIfNeeded(page);
  await page.goto("/offers");
  await page.getByRole("button", { name: /add offer/i }).first().click();
  await page.getByRole("button", { name: /cancel/i }).click();
  await expect(page.getByPlaceholder(/e\.g\. google/i)).not.toBeVisible();
});

test("Empty state shows call-to-action", async ({ page }) => {
  test.skip(!HAS_CREDS, "E2E credentials not set");
  await loginIfNeeded(page);
  await page.goto("/offers");
  // Either has offers or shows empty state — both are valid
  const hasOffers = await page.locator(".rounded-xl.border.bg-white").count();
  if (hasOffers === 0) {
    await expect(page.getByText(/no offers yet/i)).toBeVisible();
  }
});
