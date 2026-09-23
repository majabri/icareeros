/**
 * E2E tests — Learn stage (Day 23)
 *
 * Tests:
 * 1. /api/career-os/learn returns 401 without authentication
 * 2. /api/career-os/learn returns 400 when cycle_id is missing
 * 3. Dashboard loads and shows the Learn stage card
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

let learnRouteDeployed = false; // /api/career-os/learn route exists in this deployment
let dashboardDeployed  = false; // /dashboard shows Career OS stage cards

test.use({ baseURL: BASE_URL });

test.beforeAll(async ({ request }) => {
  if (!hasRealCreds) return;

  try {
    // Login
    // Probe the learn API route (unauthenticated → 401 means route exists)
    const routeRes = await request.post("/api/career-os/learn", {
      data: { cycle_id: "probe" },
      headers: { "Content-Type": "application/json" },
      failOnStatusCode: false,
    });
    // 401 = route exists but needs auth → deployed
    // 404 = not yet deployed
    learnRouteDeployed = routeRes.status() !== 404;

    // Probe dashboard
    const dashRes = await request.get("/dashboard", { failOnStatusCode: false });
    dashboardDeployed = dashRes.status() < 400;
  } catch {
    learnRouteDeployed = false;
    dashboardDeployed  = false;
  }
});

// ── Tests ─────────────────────────────────────────────────────────────────────

/**
 * Signed out — the `request` fixture inherits the suite-wide session, so a
 * 401 assertion only means anything with the session cleared.
 */
test.describe("learn API — unauthenticated", () => {
  test.use({ storageState: LOGGED_OUT });

  test("POST /api/career-os/learn → 401 without authentication", async ({ request }) => {
    test.skip(!learnRouteDeployed, "Learn route not yet deployed — skipping until PR is merged");
    // Fresh unauthenticated request context — no cookies
    const res = await request.post(`${BASE_URL}/api/career-os/learn`, {
      data: { cycle_id: "some-cycle-id" },
      headers: { "Content-Type": "application/json" },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});

test("POST /api/career-os/learn → 400 when cycle_id is missing", async ({ request }) => {
  test.skip(!hasRealCreds || !learnRouteDeployed, "Learn route not yet deployed");

  // Authenticated request without cycle_id
  const res = await request.post("/api/career-os/learn", {
    data: {},
    headers: { "Content-Type": "application/json" },
    failOnStatusCode: false,
  });
  expect(res.status()).toBe(400);
  const body = await res.json();
  expect(body.error).toMatch(/cycle_id/i);
});

test("Dashboard shows Learn stage card", async ({ page }) => {
  test.skip(!hasRealCreds || !dashboardDeployed, "Dashboard not yet deployed");

  await page.goto("/dashboard");
  await expect(page.getByText("Learn").first()).toBeVisible({ timeout: 10_000 });
});
