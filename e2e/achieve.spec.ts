/**
 * E2E tests — Achieve stage (Day 26)
 *
 * Tests:
 * 1. /api/career-os/achieve returns 401 without authentication
 * 2. /api/career-os/achieve returns 400 when cycle_id is missing
 * 3. Dashboard loads and shows the Achieve stage card
 */

import { test, expect } from "@playwright/test";
import { LOGGED_OUT } from "./support/auth";

const BASE_URL  = process.env.PLAYWRIGHT_BASE_URL ?? "https://icareeros.vercel.app";
const E2E_EMAIL = process.env.E2E_TEST_EMAIL    ?? "";
const E2E_PASS  = process.env.E2E_TEST_PASSWORD ?? "";
const hasRealCreds = Boolean(E2E_EMAIL && E2E_PASS);

let achieveRouteDeployed = false;
let dashboardDeployed    = false;

test.use({ baseURL: BASE_URL });

test.beforeAll(async ({ request }) => {
  if (!hasRealCreds) return;

  try {
    const routeRes = await request.post("/api/career-os/achieve", {
      data: { cycle_id: "probe" },
      headers: { "Content-Type": "application/json" },
      failOnStatusCode: false,
    });
    achieveRouteDeployed = routeRes.status() !== 404;

    const dashRes = await request.get("/dashboard", { failOnStatusCode: false });
    dashboardDeployed = dashRes.status() < 400;
  } catch {
    achieveRouteDeployed = false;
    dashboardDeployed    = false;
  }
});

/**
 * Signed out — the `request` fixture inherits the suite-wide session, so a
 * 401 assertion only means anything with the session cleared.
 */
test.describe("achieve API — unauthenticated", () => {
  test.use({ storageState: LOGGED_OUT });

  test("POST /api/career-os/achieve → 401 without authentication", async ({ request }) => {
    test.skip(!achieveRouteDeployed, "Achieve route not yet deployed — skipping until PR is merged");
    const res = await request.post(`${BASE_URL}/api/career-os/achieve`, {
      data: { cycle_id: "some-cycle-id" },
      headers: { "Content-Type": "application/json" },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});

test("POST /api/career-os/achieve → 400 when cycle_id is missing", async ({ request }) => {
  test.skip(!hasRealCreds || !achieveRouteDeployed, "Achieve route not yet deployed");

  const res = await request.post("/api/career-os/achieve", {
    data: {},
    headers: { "Content-Type": "application/json" },
    failOnStatusCode: false,
  });
  expect(res.status()).toBe(400);
  const body = await res.json();
  expect(body.error).toMatch(/cycle_id/i);
});

test("Dashboard shows Achieve stage card", async ({ page }) => {
  test.skip(!hasRealCreds || !dashboardDeployed, "Dashboard not yet deployed");

  await page.goto("/dashboard");
  await expect(page.getByText("Achieve").first()).toBeVisible({ timeout: 10_000 });
});
