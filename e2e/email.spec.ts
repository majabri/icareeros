/**
 * E2E smoke tests for email infrastructure (Day 42)
 *
 * These tests are probe-guarded: they require E2E_TEST_EMAIL + E2E_TEST_PASSWORD
 * to be set. CI skips them when these secrets are absent.
 *
 * What we test:
 *  - /api/email/send returns 401 for unauthenticated requests
 *  - /api/email/send returns 400 for missing fields
 *  - Authenticated request returns 200 (skipped=true in test env without SMTP)
 *
 * The two authenticated tests used to sign in through the UI and then copy the
 * cookies onto the `request` fixture by hand. Neither step is needed now:
 * globalSetup signs in once and the `request` fixture inherits that session
 * along with everything else (#433).
 */

import { test, expect } from "@playwright/test";
import { HAS_CREDS, LOGGED_OUT } from "./support/auth";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

test.describe("Email API", () => {
  test("POST /api/email/send with missing fields returns 400", async ({ request }) => {
    test.skip(!HAS_CREDS, "E2E credentials not set");

    const res = await request.post(`${BASE_URL}/api/email/send`, {
      data: { to: "test@example.com", subject: "Missing html" },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Missing required fields");
  });

  test("authenticated POST /api/email/send returns 200 (skipped in test env)", async ({
    request,
  }) => {
    test.skip(!HAS_CREDS, "E2E credentials not set");

    const res = await request.post(`${BASE_URL}/api/email/send`, {
      data: {
        to: "test@example.com",
        subject: "E2E test",
        html: "<p>E2E smoke test</p>",
        text: "E2E smoke test",
      },
    });

    // 200 always — skipped=true when SMTP not configured
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});

/**
 * Signed out — the `request` fixture inherits the suite-wide session, so this
 * has to clear it or the route answers 200 and the test proves nothing.
 */
test.describe("Email API — unauthenticated", () => {
  test.use({ storageState: LOGGED_OUT });

  test("unauthenticated POST /api/email/send returns 401", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/email/send`, {
      data: { to: "test@example.com", subject: "Test", html: "<p>Hi</p>" },
    });
    expect(res.status()).toBe(401);
  });
});
