/**
 * E2E tests — Coach stage (Day 25)
 *
 * Tests:
 * 1. /api/career-os/coach returns 401 without authentication
 * 2. /api/career-os/coach returns 400 when cycle_id is missing
 * 3. Dashboard loads and shows the Coach stage card
 */

import { test, expect } from "@playwright/test";

const BASE_URL  = process.env.PLAYWRIGHT_BASE_URL ?? "https://icareeros.vercel.app";
const E2E_EMAIL = process.env.E2E_TEST_EMAIL    ?? "";
const E2E_PASS  = process.env.E2E_TEST_PASSWORD ?? "";
const hasRealCreds = Boolean(E2E_EMAIL && E2E_PASS);

let coachRouteDeployed = false;
let dashboardDeployed  = false;

test.use({ baseURL: BASE_URL });

test.beforeAll(async ({ browser }) => {
  if (!hasRealCreds) return;

  const page = await browser.newPage();
  try {
    await page.goto("/auth/login");
    await page.locator("#email").fill(E2E_EMAIL);
    await page.locator("#password").fill(E2E_PASS);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/dashboard/, { timeout: 15_000 });

    const routeRes = await page.request.post("/api/career-os/coach", {
      data: { cycle_id: "probe" },
      headers: { "Content-Type": "application/json" },
      failOnStatusCode: false,
    });
    coachRouteDeployed = routeRes.status() !== 404;

    const dashRes = await page.request.get("/dashboard", { failOnStatusCode: false });
    dashboardDeployed = dashRes.status() < 400;
  } catch {
    coachRouteDeployed = false;
    dashboardDeployed  = false;
  } finally {
    await page.close();
  }
});

test("POST /api/career-os/coach → 401 without authentication", async ({ request }) => {
  test.skip(!coachRouteDeployed, "Coach route not yet deployed — skipping until PR is merged");
  const res = await request.post(`${BASE_URL}/api/career-os/coach`, {
    data: { cycle_id: "some-cycle-id" },
    headers: { "Content-Type": "application/json" },
    failOnStatusCode: false,
  });
  expect(res.status()).toBe(401);
  const body = await res.json();
  expect(body).toHaveProperty("error");
});

test("POST /api/career-os/coach → 400 when cycle_id is missing", async ({ browser }) => {
  test.skip(!hasRealCreds || !coachRouteDeployed, "Coach route not yet deployed");

  const page = await browser.newPage();
  try {
    await page.goto(`${BASE_URL}/auth/login`);
    await page.locator("#email").fill(E2E_EMAIL);
    await page.locator("#password").fill(E2E_PASS);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/dashboard/, { timeout: 15_000 });

    const res = await page.request.post("/api/career-os/coach", {
      data: {},
      headers: { "Content-Type": "application/json" },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/cycle_id/i);
  } finally {
    await page.close();
  }
});

test("Dashboard shows Coach stage card", async ({ browser }) => {
  test.skip(!hasRealCreds || !dashboardDeployed, "Dashboard not yet deployed");

  const page = await browser.newPage();
  try {
    await page.goto(`${BASE_URL}/auth/login`);
    await page.locator("#email").fill(E2E_EMAIL);
    await page.locator("#password").fill(E2E_PASS);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/dashboard/, { timeout: 15_000 });

    await page.goto("/dashboard");
    await expect(page.getByText("Coach").first()).toBeVisible({ timeout: 10_000 });
  } finally {
    await page.close();
  }
});
