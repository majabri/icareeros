/**
 * E2E tests — Act stage (Day 24)
 *
 * Tests:
 * 1. /api/career-os/act returns 401 without authentication
 * 2. /api/career-os/act returns 400 when cycle_id is missing
 * 3. Dashboard loads and shows the Act stage card
 *    (skipped pre-deploy using probe pattern)
 */

import { test, expect } from "@playwright/test";
import { LOGGED_OUT } from "./support/auth";

// ── Env ───────────────────────────────────────────────────────────────────────

const BASE_URL  = process.env.PLAYWRIGHT_BASE_URL ?? "https://icareeros.vercel.app";
const E2E_EMAIL = process.env.E2E_TEST_EMAIL    ?? "";
const E2E_PASS  = process.env.E2E_TEST_PASSWORD ?? "";
const hasRealCreds = Boolean(E2E_EMAIL && E2E_PASS);

// ── Probes ────────────────────────────────────────────────────────────────────

let actRouteDeployed  = false; // /api/career-os/act route exists in this deployment
let dashboardDeployed = false; // /dashboard shows Career OS stage cards

test.use({ baseURL: BASE_URL });

test.beforeAll(async ({ request }) => {
  if (!hasRealCreds) return;

  try {
    // Probe the act API route
    const routeRes = await request.post("/api/career-os/act", {
      data: { cycle_id: "probe" },
      headers: { "Content-Type": "application/json" },
      failOnStatusCode: false,
    });
    // 401 = route exists but needs auth → deployed; 404 = not yet deployed
    actRouteDeployed = routeRes.status() !== 404;

    const dashRes = await request.get("/dashboard", { failOnStatusCode: false });
    dashboardDeployed = dashRes.status() < 400;
  } catch {
    actRouteDeployed  = false;
    dashboardDeployed = false;
  }
});

// ── Tests ─────────────────────────────────────────────────────────────────────

/**
 * Signed out — the `request` fixture inherits the suite-wide session, so a
 * 401 assertion only means anything with the session cleared.
 */
test.describe("act API — unauthenticated", () => {
  test.use({ storageState: LOGGED_OUT });

  test("POST /api/career-os/act → 401 without authentication", async ({ request }) => {
    test.skip(!actRouteDeployed, "Act route not yet deployed — skipping until PR is merged");
    const res = await request.post(`${BASE_URL}/api/career-os/act`, {
      data: { cycle_id: "some-cycle-id" },
      headers: { "Content-Type": "application/json" },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});

test("POST /api/career-os/act → 400 when cycle_id is missing", async ({ request }) => {
  test.skip(!hasRealCreds || !actRouteDeployed, "Act route not yet deployed");

  const res = await request.post("/api/career-os/act", {
    data: {},
    headers: { "Content-Type": "application/json" },
    failOnStatusCode: false,
  });
  expect(res.status()).toBe(400);
  const body = await res.json();
  expect(body.error).toMatch(/cycle_id/i);
});

test("Dashboard shows Act stage card", async ({ page }) => {
  test.skip(!hasRealCreds || !dashboardDeployed, "Dashboard not yet deployed");

  await page.goto("/dashboard");
  await expect(page.getByText("Act").first()).toBeVisible({ timeout: 10_000 });
});
