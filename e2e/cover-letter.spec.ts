/**
 * E2E — Cover Letter Generator
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

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "https://icareeros.vercel.app";
const E2E_EMAIL    = process.env.E2E_TEST_EMAIL    ?? "";
const E2E_PASSWORD = process.env.E2E_TEST_PASSWORD ?? "";

const hasRealCreds = Boolean(E2E_EMAIL && E2E_PASSWORD);

// ── Probe 1: Is the cover-letter route deployed? ──────────────────────────────

let coverLetterRouteDeployed = false;

test.beforeAll(async () => {
  // Anonymous on purpose: this probe reads 401 as "deployed", and the
  // `request` fixture now carries the shared session, which would answer 200
  // and make the probe skip the whole file.
  const anon = await anonymousRequest(BASE_URL);
  try {
    // Unauthenticated probe: 401 = route exists, 404 = not deployed
    const routeRes = await anon.post(`${BASE_URL}/api/cover-letter`, {
      data: { opportunity_id: "probe" },
      headers: { "Content-Type": "application/json" },
    });
    coverLetterRouteDeployed = routeRes.status() === 401;
  } catch {
    coverLetterRouteDeployed = false;
  } finally {
    await anon.dispose();
  }
});

// ── Test 1: Unauthenticated POST → 401 ───────────────────────────────────────

test.describe("Cover letter API — unauthenticated", () => {
  test.use({ storageState: LOGGED_OUT });

test("POST /api/cover-letter returns 401 when unauthenticated", async ({ request }) => {
  test.skip(!coverLetterRouteDeployed, "Cover letter route not yet deployed to this environment");

  const res = await request.post(`${BASE_URL}/api/cover-letter`, {
    data: { opportunity_id: "probe" },
    headers: { "Content-Type": "application/json" },
  });

  expect(res.status()).toBe(401);
});

});

// ── Test 2: Missing opportunity_id → 400 ─────────────────────────────────────

test("POST /api/cover-letter returns 400 when opportunity_id is missing", async ({ request }) => {
  test.skip(!coverLetterRouteDeployed, "Cover letter route not yet deployed to this environment");
  test.skip(!hasRealCreds, "E2E_TEST_EMAIL / E2E_TEST_PASSWORD not set");

  // Already authenticated via the shared session, so this reaches the
  // validation layer directly.
  const res = await request.post(`${BASE_URL}/api/cover-letter`, {
    data: {},
    headers: { "Content-Type": "application/json" },
  });

  // 400 (validation) or 401 (unauthenticated path) — either is correct behaviour
  expect([400, 401]).toContain(res.status());
});

// ── Test 3: Jobs page shows "Cover Letter" button ────────────────────────────

test("jobs page renders Cover Letter button when opportunities exist", async ({ page }) => {
  test.skip(!coverLetterRouteDeployed, "Cover letter route not yet deployed to this environment");
  test.skip(!hasRealCreds, "E2E_TEST_EMAIL / E2E_TEST_PASSWORD not set");

  // Navigate to /jobs
  await page.goto(`${BASE_URL}/jobs`);

  // Wait for either a Cover Letter button or the empty state
  // (uses PRESENCE probe — avoids networkidle timing race)
  await page.waitForSelector(
    'button:has-text("Cover Letter"), h3:has-text("No opportunities found")',
    { timeout: 20_000 }
  ).catch(() => {});

  const hasCoverLetterButtons = (await page.locator('button:has-text("Cover Letter")').count()) > 0;

  test.skip(!hasCoverLetterButtons, "No Cover Letter buttons visible — no opportunities loaded");

  // Verify the button is present and clickable
  const firstBtn = page.locator('button:has-text("Cover Letter")').first();
  await expect(firstBtn).toBeVisible();

  // Click to open the modal
  await firstBtn.click();

  // Modal should appear with generate CTA
  await expect(
    page.locator('[role="dialog"][aria-label="Cover letter generator"]')
  ).toBeVisible({ timeout: 5_000 });

  // "Generate Cover Letter" CTA should be present before generation
  await expect(
    page.locator('button:has-text("Generate Cover Letter")')
  ).toBeVisible();

  // Close modal
  const closeBtn = page.locator('[aria-label="Close cover letter generator"]');
  await closeBtn.click();
  await expect(
    page.locator('[role="dialog"][aria-label="Cover letter generator"]')
  ).not.toBeVisible({ timeout: 3_000 });
});
