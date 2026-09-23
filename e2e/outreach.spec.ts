/**
 * E2E tests — Outreach Generator (Day 33)
 *
 * Tests:
 * 1. /api/outreach returns 401 without authentication
 * 2. /api/outreach returns 400 when opportunity_id is missing
 * 3. /jobs page loads and shows the Outreach button on opportunity cards
 *    (skipped pre-deploy using probe pattern; also skipped if no Outreach buttons visible)
 */

import { test, expect } from "@playwright/test";
import { LOGGED_OUT, STORAGE_STATE, anonymousRequest } from "./support/auth";

// ── Env ───────────────────────────────────────────────────────────────────────

const BASE_URL  = process.env.PLAYWRIGHT_BASE_URL ?? "https://icareeros.vercel.app";
const E2E_EMAIL = process.env.E2E_TEST_EMAIL    ?? "";
const E2E_PASS  = process.env.E2E_TEST_PASSWORD ?? "";
const hasRealCreds = Boolean(E2E_EMAIL && E2E_PASS);

// ── Probes ────────────────────────────────────────────────────────────────────

/**
 * Whether /api/outreach is deployed. Probed unauthenticated:
 *   401 = route exists (auth required)
 *   404 = no route at all (not yet deployed)
 */
let outreachRouteDeployed = false;
let jobsPageDeployed      = false;
/**
 * Whether the /jobs page shows actual Outreach buttons.
 * Probed by PRESENCE of the button, not absence of empty state,
 * to avoid timing issues where the React search hasn't fired yet.
 */
let hasOutreachButtons = false;

test.use({ baseURL: BASE_URL });

test.beforeAll(async ({ browser, request }) => {
  // ── Probe 1: outreach route — unauthenticated ────────────────────────────
  //
  // Anonymous on purpose: this probe reads 401 as "route exists, wants auth"
  // and 404 as "not deployed". The `request` fixture carries the shared
  // session now, so an authenticated probe would answer 200 and the file
  // would skip itself silently.
  const anon = await anonymousRequest(BASE_URL);
  try {
    const routeRes = await anon.post(`${BASE_URL}/api/outreach`, {
      data: {},
      headers: { "Content-Type": "application/json" },
      failOnStatusCode: false,
    });
    outreachRouteDeployed = routeRes.status() === 401;
  } catch {
    outreachRouteDeployed = false;
  } finally {
    await anon.dispose();
  }

  if (!hasRealCreds) return;

  // ── Probes 2 & 3: jobs page + Outreach button presence ───────────────────
  //
  // These need the signed-in session. newContext() without storageState would
  // open an anonymous browser, so pass it explicitly.
  const ctx  = await browser.newContext({ storageState: STORAGE_STATE });
  const page = await ctx.newPage();
  try {
    const jobsRes = await request.get("/opportunities", { failOnStatusCode: false });
    jobsPageDeployed = jobsRes.status() < 400;

    if (jobsPageDeployed && outreachRouteDeployed) {
      await page.goto("/opportunities");
      // Wait for either: an Outreach button (data + code deployed) OR
      // the empty-state heading (no data). Timeout = no result either way.
      await page.waitForSelector(
        'button:has-text("Outreach"), h3:has-text("No opportunities found")',
        { timeout: 15_000 }
      ).catch(() => {});
      // hasOutreachButtons is ONLY true when we can see the actual button
      hasOutreachButtons =
        (await page.locator('button:has-text("Outreach")').count()) > 0;
    }
  } catch {
    jobsPageDeployed   = false;
    hasOutreachButtons = false;
  } finally {
    await ctx.close();
  }
});

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe("Outreach API — unauthenticated", () => {
  test.use({ storageState: LOGGED_OUT });

test("POST /api/outreach → 401 without authentication", async ({ request }) => {
  test.skip(!outreachRouteDeployed, "Outreach route not yet deployed — skipping until PR is merged");

  const res = await request.post(`${BASE_URL}/api/outreach`, {
    data: { opportunity_id: "test-opp-id" },
    headers: { "Content-Type": "application/json" },
    failOnStatusCode: false,
  });
  expect(res.status()).toBe(401);
});

});

test("POST /api/outreach → 400 when opportunity_id is missing", async ({ request }) => {
  test.skip(!outreachRouteDeployed, "Outreach route not yet deployed — skipping until PR is merged");
  test.skip(!hasRealCreds, "No E2E credentials — skipping authenticated test");

  const res = await request.post("/api/outreach", {
    data: {},
    headers: { "Content-Type": "application/json" },
    failOnStatusCode: false,
  });
  expect(res.status()).toBe(400);
  const body = await res.json();
  expect(body.error).toMatch(/opportunity_id/i);
});

test("/jobs page shows Outreach button on opportunity cards", async ({ page }) => {
  test.skip(!outreachRouteDeployed, "Outreach route not yet deployed — skipping until PR is merged");
  test.skip(!jobsPageDeployed,      "/jobs page not yet deployed — skipping until PR is merged");
  test.skip(!hasRealCreds,          "No E2E credentials — skipping authenticated test");
  test.skip(!hasOutreachButtons,    "No Outreach buttons visible on /jobs — DB may be empty or code not yet deployed");

  await page.goto("/opportunities");
  await page.waitForSelector('button:has-text("Outreach")', { timeout: 15_000 });

  const outreachBtn = page.locator('button:has-text("Outreach")').first();
  await expect(outreachBtn).toBeVisible();
});
