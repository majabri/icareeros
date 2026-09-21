/**
 * E2E tests for the Offer Desk page (/offers)
 *
 * All tests are probe-guarded: skip when E2E credentials are not set.
 */

import { test, expect } from "@playwright/test";
import { HAS_CREDS } from "./support/auth";

test("Offers nav link is visible in AppNav", async ({ page }) => {
  test.skip(!HAS_CREDS, "E2E credentials not set");
  await page.goto("/dashboard");
  await expect(page.locator("nav").getByText("Offers")).toBeVisible();
});

test("Offers page renders heading and Add Offer button", async ({ page }) => {
  test.skip(!HAS_CREDS, "E2E credentials not set");
  await page.goto("/offers");
  await expect(page.getByRole("heading", { name: /offer desk/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /add offer/i })).toBeVisible();
});

test("Add Offer button reveals the form", async ({ page }) => {
  test.skip(!HAS_CREDS, "E2E credentials not set");
  await page.goto("/offers");
  await page.getByRole("button", { name: /add offer/i }).first().click();
  await expect(page.getByPlaceholder(/e\.g\. google/i)).toBeVisible();
  await expect(page.getByPlaceholder(/senior software engineer/i)).toBeVisible();
});

test("Add Offer form has Company and Role fields", async ({ page }) => {
  test.skip(!HAS_CREDS, "E2E credentials not set");
  await page.goto("/offers");
  await page.getByRole("button", { name: /add offer/i }).first().click();
  await expect(page.getByPlaceholder(/e\.g\. google/i)).toBeEnabled();
  await expect(page.getByPlaceholder(/senior software engineer/i)).toBeEnabled();
});

test("Cancel button hides the Add Offer form", async ({ page }) => {
  test.skip(!HAS_CREDS, "E2E credentials not set");
  await page.goto("/offers");
  await page.getByRole("button", { name: /add offer/i }).first().click();
  await page.getByRole("button", { name: /cancel/i }).click();
  await expect(page.getByPlaceholder(/e\.g\. google/i)).not.toBeVisible();
});

test("Empty state shows call-to-action", async ({ page }) => {
  test.skip(!HAS_CREDS, "E2E credentials not set");
  await page.goto("/offers");
  // Either has offers or shows empty state — both are valid
  const hasOffers = await page.locator(".rounded-xl.border.bg-white").count();
  if (hasOffers === 0) {
    await expect(page.getByText(/no offers yet/i)).toBeVisible();
  }
});
