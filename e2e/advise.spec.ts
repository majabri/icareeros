/**
 * E2E tests — Advise stage (Day 22)
 *
 * Tests:
 * 1. /api/career-os/advise returns 401 without authentication
 * 2. /api/career-os/advise returns 400 when cycle_id is missing
 * 3. Dashboard loads and shows the Advise stage card
 *    (skipped pre-deploy using probe pattern)
 */

import { test, expect } from "@playwright/test";

// ── Env ───────────────────────────────────────────────────────────────────────

const BASE_URL  = process.env.PLAYWRIGHT_BASE_URL ?? "https://icareeros.vercel.app";
const E2E_EMAIL = process.env.E2E_TEST_EMAIL    ?? "";
const E2E_PASS  = process.env.E2E_TEST_PASSWORD ?? "";
const hasRealCreds = Boolean(E2E_EMAIL && E2E_PASS);

// ── Probes ────────────────────────────────────────────────────────────────────

let adviseRouteDeployed = false; // /api/career-os/advise route exists in this deployment
let dashboardDeployed   = false; // /dashboard shows Career OS stage cards

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

    // Probe the advise API route (unauthenticated → 401 means route exists)
    const routeRes = await page.request.post("/api/career-os/advise", {
      data: { cycle_id: "probe" },
      headers: { "Content-Type": "application/json" },
      failOnStatusCode: false,
    });
    // 401 = route exists but needs auth → deployed
    // 404 = not yet deployed
    adviseRouteDeployed = routeRes.status() !== 404;

    // Probe dashboard for Advise card
    const dashRes = await page.request.get("/dashboard", { failOnStatusCode: false });
    dashboardDeployed = dashRes.status() < 400;
  } catch {
    adviseRouteDeployed = false;
    dashboardDeployed   = false;
  } finally {
    await page.close();
  }
});

// ── Tests ─────────────────────────────────────────────────────────────────────

test("POST /api/career-os/advise → 401 without authentication", async ({ request }) => {
  // Fresh unauthenticated request context — no cookies
  const res = await request.post(`${BASE_URL}/api/career-os/advise`, {
    data: { cycle_id: "some-cycle-id" },
    headers: { "Content-Type": "application/json" },
    failOnStatusCode: false,
  });
  expect(res.status()).toBe(401);
  const body = await res.json();
  expect(body).toHaveProperty("error");
});

test("POST /api/career-os/advise → 400 when cycle_id is missing", async ({ browser }) => {
  test.skip(!hasRealCreds || !adviseRouteDeployed, "Advise route not yet deployed");

  const page = await browser.newPage();
  try {
    await page.goto(`${BASE_URL}/auth/login`);
    await page.locator("#email").fill(E2E_EMAIL);
    await page.locator("#password").fill(E2E_PASS);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/dashboard/, { timeout: 15_000 });

    // Authenticated request without cycle_id
    const res = await page.request.post("/api/career-os/advise", {
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

test("Dashboard shows Advise stage card", async ({ browser }) => {
  test.skip(!hasRealCreds || !dashboardDeployed, "Dashboard not yet deployed");

  const page = await browser.newPage();
  try {
    await page.goto(`${BASE_URL}/auth/login`);
    await page.locator("#email").fill(E2E_EMAIL);
    await page.locator("#password").fill(E2E_PASS);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/dashboard/, { timeout: 15_000 });

    await page.goto("/dashboard");
    await expect(page.getByText("Advise")).toBeVisible({ timeout: 10_000 });
  } finally {
    await page.close();
  }
});
