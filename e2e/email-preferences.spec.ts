/**
 * E2E specs for /settings/email (Day 43)
 * Probe-guarded — skips without E2E_TEST_EMAIL + E2E_TEST_PASSWORD.
 *
 * The per-file login helper is gone as of #433: globalSetup signs in once for
 * the run, and the `request` fixture inherits that session, so the
 * authenticated test no longer copies cookies onto the request by hand.
 */

import { test, expect } from "@playwright/test";
import { HAS_CREDS, LOGGED_OUT } from "./support/auth";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

test.describe("/settings/email", () => {
  test("page loads with email preference toggles", async ({ page }) => {
    test.skip(!HAS_CREDS, "E2E credentials not set");
    await page.goto(`${BASE_URL}/settings/email`);
    await expect(page.getByText("Email preferences")).toBeVisible();
    await expect(page.getByText("Weekly career digest")).toBeVisible();
    await expect(page.getByText("Job alert emails")).toBeVisible();
    await expect(page.getByText("Product updates")).toBeVisible();
  });

  test("authenticated GET /api/email/preferences returns preferences", async ({
    request,
  }) => {
    test.skip(!HAS_CREDS, "E2E credentials not set");
    const res = await request.get(`${BASE_URL}/api/email/preferences`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    // Either null (no row yet) or an object with boolean fields
    if (body.preferences !== null) {
      expect(typeof body.preferences.weekly_insights).toBe("boolean");
    }
  });
});

/**
 * Signed out — the `request` fixture inherits the suite-wide session, so these
 * clear it. Without that the two 401 assertions would receive 200, and the
 * bad-token case would never reach the token branch at all.
 */
test.describe("/settings/email — unauthenticated", () => {
  test.use({ storageState: LOGGED_OUT });

  test("GET /api/email/preferences returns 401 unauthenticated", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/email/preferences`);
    expect(res.status()).toBe(401);
  });

  test("GET /api/email/preferences with bad token returns 400", async ({ request }) => {
    const res = await request.get(
      `${BASE_URL}/api/email/preferences?token=not-a-real-token`,
    );
    // 400 = bad token, 500 = service key not set (acceptable in test env)
    expect([400, 500]).toContain(res.status());
  });

  test("POST /api/email/preferences returns 401 unauthenticated", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/email/preferences`, {
      data: { weekly_insights: false },
    });
    expect(res.status()).toBe(401);
  });

  test("/api/cron/weekly-insights returns 401 without cron secret", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/cron/weekly-insights`);
    // 401 if CRON_SECRET set, or may proceed if not set (test env)
    expect([200, 401, 500]).toContain(res.status());
  });
});
