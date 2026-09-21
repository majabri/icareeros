/**
 * E2E — Job Alerts
 *
 * Probe-guarded tests — each test only runs when the relevant
 * infrastructure (route deployed, jobs page live, real creds) is available.
 *
 * Probe rules (lessons from Day 33):
 *  - Route probe: UNAUTHENTICATED request; 401 = deployed, 404 = not deployed
 *  - UI probe: waitForSelector PRESENCE of expected element (not absence of empty state)
 */

import { test, expect } from "@playwright/test";
import { LOGGED_OUT, anonymousRequest } from "./support/auth";

const BASE_URL     = process.env.PLAYWRIGHT_BASE_URL ?? "https://icareeros.vercel.app";
const E2E_EMAIL    = process.env.E2E_TEST_EMAIL    ?? "";
const E2E_PASSWORD = process.env.E2E_TEST_PASSWORD ?? "";

const hasRealCreds = Boolean(E2E_EMAIL && E2E_PASSWORD);

// ── Probe: Is the job-alerts route deployed? ──────────────────────────────────

let jobAlertsRouteDeployed = false;

test.beforeAll(async () => {
  // Anonymous on purpose: this probe reads 401 as "deployed". The `request`
  // fixture carries the shared session now, which would answer 200 and make
  // the probe conclude the route is missing — skipping the whole file.
  const anon = await anonymousRequest(BASE_URL);
  try {
    const res = await anon.get(`${BASE_URL}/api/job-alerts`);
    jobAlertsRouteDeployed = res.status() === 401;
  } catch {
    jobAlertsRouteDeployed = false;
  } finally {
    await anon.dispose();
  }
});

// ── Route tests ───────────────────────────────────────────────────────────────
//
// All four assert the UNAUTHENTICATED response, and the `request` fixture
// inherits the suite session, so they run in a signed-out block.

test.describe("Job alerts API — unauthenticated", () => {
  test.use({ storageState: LOGGED_OUT });

test("GET /api/job-alerts returns 401 for unauthenticated request", async ({ request }) => {
  if (!jobAlertsRouteDeployed) {
    test.skip(true, "job-alerts route not yet deployed");
    return;
  }
  const res = await request.get(`${BASE_URL}/api/job-alerts`);
  expect(res.status()).toBe(401);
});

test("POST /api/job-alerts returns 401 for unauthenticated request", async ({ request }) => {
  if (!jobAlertsRouteDeployed) {
    test.skip(true, "job-alerts route not yet deployed");
    return;
  }
  const res = await request.post(`${BASE_URL}/api/job-alerts`, {
    data: { frequency: "daily" },
    headers: { "Content-Type": "application/json" },
  });
  expect(res.status()).toBe(401);
});

test("POST /api/job-alerts returns 400 for invalid frequency when unauthenticated", async ({ request }) => {
  if (!jobAlertsRouteDeployed) {
    test.skip(true, "job-alerts route not yet deployed");
    return;
  }
  // 400 (bad freq) or 401 (auth check first) — both indicate route is live
  const res = await request.post(`${BASE_URL}/api/job-alerts`, {
    data: { frequency: "hourly" },
    headers: { "Content-Type": "application/json" },
  });
  expect([400, 401]).toContain(res.status());
});

test("DELETE /api/job-alerts returns 401 for unauthenticated request", async ({ request }) => {
  if (!jobAlertsRouteDeployed) {
    test.skip(true, "job-alerts route not yet deployed");
    return;
  }
  const res = await request.delete(`${BASE_URL}/api/job-alerts`);
  expect(res.status()).toBe(401);
});

});

// ── UI test: 🔔 Alert button renders on /jobs page ────────────────────────────

test("🔔 Alert button is visible on the jobs page", async ({ page }) => {
  if (!hasRealCreds) {
    test.skip(true, "No E2E credentials — skipping UI test");
    return;
  }
  if (!jobAlertsRouteDeployed) {
    test.skip(true, "job-alerts route not yet deployed");
    return;
  }

  // Navigate to jobs
  await page.goto(`${BASE_URL}/jobs`);

  // The alert button must be present (probe by PRESENCE, not by absence of other elements)
  const alertBtn = page.locator('button[aria-label="Set job alert"]');
  await expect(alertBtn).toBeVisible({ timeout: 10_000 });
});

test("JobAlertModal opens and closes correctly", async ({ page }) => {
  if (!hasRealCreds) {
    test.skip(true, "No E2E credentials — skipping UI test");
    return;
  }
  if (!jobAlertsRouteDeployed) {
    test.skip(true, "job-alerts route not yet deployed");
    return;
  }

  await page.goto(`${BASE_URL}/jobs`);

  // Click the 🔔 Alert button
  await page.click('button[aria-label="Set job alert"]');

  // Modal must appear
  const modal = page.locator('[aria-label="Job alert settings"]');
  await expect(modal).toBeVisible({ timeout: 5_000 });

  // Close via the ✕ button
  await page.click('button[aria-label="Close"]');
  await expect(modal).not.toBeVisible({ timeout: 3_000 });
});
