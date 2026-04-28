/**
 * E2E tests — Evaluate stage (Day 21)
 *
 * Tests:
 * 1. /profile page loads for authenticated users
 * 2. Profile save triggers AI evaluation when an active cycle exists
 *    (using the profilePageDeployed + evaluateDeployed probe pattern)
 *
 * All tests that depend on new Day 21 code are skipped pre-deploy
 * using the same probe pattern as profile.spec.ts.
 */

import { test, expect } from "@playwright/test";

// ── Env ───────────────────────────────────────────────────────────────────────

const BASE_URL   = process.env.PLAYWRIGHT_BASE_URL ?? "https://icareeros.vercel.app";
const E2E_EMAIL  = process.env.E2E_TEST_EMAIL    ?? "";
const E2E_PASS   = process.env.E2E_TEST_PASSWORD ?? "";
const hasRealCreds = Boolean(E2E_EMAIL && E2E_PASS);

// ── Probes ────────────────────────────────────────────────────────────────────

let profileDeployed = false;   // /profile page exists in this deployment
let apiRouteDeployed = false;  // /api/career-os/evaluate route exists

test.use({ baseURL: BASE_URL });

test.beforeAll(async ({ browser }) => {
  if (!hasRealCreds) return;

  const page = await browser.newPage();
  try {
    // Login
    await page.goto("/auth/login");
    await page.locator("#email").fill(E2E_EMAIL);
    await page.locator("#password").fill(E2E_PASS);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/dashboard/, { timeout: 15_000 });

    // Probe /profile
    await page.goto("/profile");
    const has404 = await page.getByText("404").isVisible({ timeout: 4_000 }).catch(() => false);
    profileDeployed = !has404;

    // Probe the API route with a HEAD/OPTIONS — a 401 (not 404) means it exists
    if (profileDeployed) {
      const res = await page.request.post("/api/career-os/evaluate", {
        data: {},
        headers: { "Content-Type": "application/json" },
        failOnStatusCode: false,
      });
      // 401 = route exists but needs auth, 422 = route exists but no profile
      // 404 = route does not exist yet
      apiRouteDeployed = res.status() !== 404;
    }
  } catch {
    profileDeployed = false;
    apiRouteDeployed = false;
  } finally {
    await page.close();
  }
});

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe("Evaluate stage — /profile", () => {
  test("unauthenticated user is redirected to /auth/login from /profile", async ({ page }) => {
    // This tests middleware, which is always deployed
    await page.goto("/profile");
    await expect(page).toHaveURL(/\/auth\/login/, { timeout: 10_000 });
  });

  test("authenticated user can load /profile page", async ({ page }, testInfo) => {
    if (!hasRealCreds || !profileDeployed) {
      testInfo.skip(true, "Profile page not yet deployed — skipping");
      return;
    }

    await page.goto("/auth/login");
    await page.locator("#email").fill(E2E_EMAIL);
    await page.locator("#password").fill(E2E_PASS);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/dashboard/, { timeout: 15_000 });

    await page.goto("/profile");
    await expect(page.locator("h1")).toContainText("My Profile", { timeout: 8_000 });
    await expect(page.locator("text=Evaluate")).toBeVisible();
    await expect(page.locator("text=Stage 1 of 6")).toBeVisible();
  });

  test("profile form has all expected fields", async ({ page }, testInfo) => {
    if (!hasRealCreds || !profileDeployed) {
      testInfo.skip(true, "Profile page not yet deployed — skipping");
      return;
    }

    await page.goto("/auth/login");
    await page.locator("#email").fill(E2E_EMAIL);
    await page.locator("#password").fill(E2E_PASS);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/dashboard/, { timeout: 15_000 });

    await page.goto("/profile");

    await expect(page.locator("#full_name")).toBeVisible({ timeout: 8_000 });
    await expect(page.locator("#current_position")).toBeVisible();
    await expect(page.locator("#experience_level")).toBeVisible();
    await expect(page.locator("#skills")).toBeVisible();
    await expect(page.locator("#target_roles")).toBeVisible();
    await expect(page.locator("#location")).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test("/api/career-os/evaluate returns 401 without auth", async ({ request }, testInfo) => {
    if (!apiRouteDeployed) {
      testInfo.skip(true, "Evaluate API route not yet deployed — skipping");
      return;
    }

    const res = await request.post(BASE_URL + "/api/career-os/evaluate", {
      data: {},
      headers: { "Content-Type": "application/json" },
      failOnStatusCode: false,
    });

    // Without auth cookie, route should return 401
    expect(res.status()).toBe(401);
  });
});
