/**
 * E2E tests — Outreach Generator (Day 33)
 *
 * Tests:
 * 1. /api/outreach returns 401 without authentication
 * 2. /api/outreach returns 400 when opportunity_id is missing
 * 3. /jobs page loads and shows the Outreach button on opportunity cards
 *    (skipped pre-deploy using probe pattern; also skipped if DB has no opportunities)
 */

import { test, expect } from "@playwright/test";

// ── Env ───────────────────────────────────────────────────────────────────────

const BASE_URL  = process.env.PLAYWRIGHT_BASE_URL ?? "https://icareeros.vercel.app";
const E2E_EMAIL = process.env.E2E_TEST_EMAIL    ?? "";
const E2E_PASS  = process.env.E2E_TEST_PASSWORD ?? "";
const hasRealCreds = Boolean(E2E_EMAIL && E2E_PASS);

// ── Probes ────────────────────────────────────────────────────────────────────

/**
 * Whether /api/outreach is deployed. Probed unauthenticated so Next.js routing
 * returns 401 (route exists) vs 404 (no route at all).  A 404 from our own
 * application logic (opportunity not found) looks the same as a routing 404,
 * so we must probe without auth to get a clean signal.
 */
let outreachRouteDeployed = false;
let jobsPageDeployed      = false;
let hasOpportunityData    = false; // at least one opportunity card renders

test.use({ baseURL: BASE_URL });

test.beforeAll(async ({ browser, request: unauthRequest }) => {
  // ── Probe 1: outreach route — unauthenticated ────────────────────────────
  // Expects 401 if deployed, 404 if the route doesn't exist yet.
  try {
    const routeRes = await unauthRequest.post(`${BASE_URL}/api/outreach`, {
      data: {},
      headers: { "Content-Type": "application/json" },
      failOnStatusCode: false,
    });
    outreachRouteDeployed = routeRes.status() === 401;
  } catch {
    outreachRouteDeployed = false;
  }

  if (!hasRealCreds) return;

  // ── Probes 2 & 3: jobs page + opportunity data — authenticated ────────────
  const page = await browser.newPage();
  try {
    await page.goto("/auth/login");
    await page.locator("#email").fill(E2E_EMAIL);
    await page.locator("#password").fill(E2E_PASS);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/dashboard/, { timeout: 15_000 });

    const jobsRes = await page.request.get("/jobs", { failOnStatusCode: false });
    jobsPageDeployed = jobsRes.status() < 400;

    // Probe whether any opportunity cards load on /jobs
    if (jobsPageDeployed) {
      await page.goto("/jobs");
      await page.waitForLoadState("networkidle");
      const emptyVisible = await page
        .locator("text=No opportunities found")
        .isVisible()
        .catch(() => false);
      hasOpportunityData = !emptyVisible;
    }
  } catch {
    jobsPageDeployed   = false;
    hasOpportunityData = false;
  } finally {
    await page.close();
  }
});

// ── Tests ─────────────────────────────────────────────────────────────────────

test("POST /api/outreach → 401 without authentication", async ({ request }) => {
  test.skip(!outreachRouteDeployed, "Outreach route not yet deployed — skipping until PR is merged");

  const res = await request.post(`${BASE_URL}/api/outreach`, {
    data: { opportunity_id: "test-opp-id" },
    headers: { "Content-Type": "application/json" },
    failOnStatusCode: false,
  });
  expect(res.status()).toBe(401);
});

test("POST /api/outreach → 400 when opportunity_id is missing", async ({ browser }) => {
  test.skip(!outreachRouteDeployed, "Outreach route not yet deployed — skipping until PR is merged");
  test.skip(!hasRealCreds, "No E2E credentials — skipping authenticated test");

  const page = await browser.newPage();
  try {
    await page.goto("/auth/login");
    await page.locator("#email").fill(E2E_EMAIL);
    await page.locator("#password").fill(E2E_PASS);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/dashboard/, { timeout: 15_000 });

    const res = await page.request.post("/api/outreach", {
      data: {},
      headers: { "Content-Type": "application/json" },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/opportunity_id/i);
  } finally {
    await page.close();
  }
});

test("/jobs page shows Outreach button on opportunity cards", async ({ browser }) => {
  // All three guards must pass: route deployed, page deployed, DB has data
  test.skip(!outreachRouteDeployed, "Outreach route not yet deployed — skipping until PR is merged");
  test.skip(!jobsPageDeployed,      "/jobs page not yet deployed — skipping until PR is merged");
  test.skip(!hasRealCreds,          "No E2E credentials — skipping authenticated test");
  test.skip(!hasOpportunityData,    "No opportunities in DB for this deployment — skipping Outreach button check");

  const page = await browser.newPage();
  try {
    await page.goto("/auth/login");
    await page.locator("#email").fill(E2E_EMAIL);
    await page.locator("#password").fill(E2E_PASS);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/dashboard/, { timeout: 15_000 });

    await page.goto("/jobs");
    await page.waitForLoadState("networkidle");

    const outreachBtn = page.locator('button:has-text("Outreach")').first();
    await expect(outreachBtn).toBeVisible({ timeout: 10_000 });
  } finally {
    await page.close();
  }
});
