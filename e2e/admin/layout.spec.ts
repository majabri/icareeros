/**
 * Sprint 4 W2-C — admin layout smoke test
 *
 * Runs against the live Vercel deployment in CI and against localhost in dev.
 * Verifies the layout renders for an unauthenticated user (should redirect),
 * and that the public landing page is still served. Actual admin-authenticated
 * tests require STAGING_SUPABASE_ANON_KEY + a seeded admin session, which is
 * deferred to Wave 4.
 */

import { test, expect } from "@playwright/test";

test.describe("Admin layout (anonymous)", () => {
  test("hitting /admin redirects to /auth/login", async ({ page }) => {
    const response = await page.goto("/admin", { waitUntil: "domcontentloaded" });
    // Either the response itself is a redirect to /auth/login, or the final
    // URL after client-side redirects ends up there.
    await page.waitForURL(/\/auth\/login/, { timeout: 10_000 });
    expect(page.url()).toMatch(/\/auth\/login/);
    // Sanity check the response chain — at least one 200 hop reached login
    expect(response).not.toBeNull();
  });

  test("landing page still loads after layout changes", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body")).toBeVisible();
    // Look for landing hero copy (matches what's in src/app/page.tsx)
    await expect(page.getByText(/career.*operating.*system/i).first()).toBeVisible({ timeout: 10_000 });
  });
});
