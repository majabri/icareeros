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
 */

import { test, expect } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const HAS_CREDS =
  !!process.env.E2E_TEST_EMAIL && !!process.env.E2E_TEST_PASSWORD;

test.describe("Email API", () => {
  test("unauthenticated POST /api/email/send returns 401", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/email/send`, {
      data: { to: "test@example.com", subject: "Test", html: "<p>Hi</p>" },
    });
    expect(res.status()).toBe(401);
  });

  test("POST /api/email/send with missing fields returns 400", async ({
    request,
    page,
  }) => {
    test.skip(!HAS_CREDS, "E2E credentials not set");

    // Sign in first to get a session cookie
    await page.goto(`${BASE_URL}/auth/login`);
    await page.fill('input[type="email"]', process.env.E2E_TEST_EMAIL!);
    await page.fill('input[type="password"]', process.env.E2E_TEST_PASSWORD!);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/);

    // Now try with missing html
    const cookies = await page.context().cookies();
    const res = await request.post(`${BASE_URL}/api/email/send`, {
      data: { to: "test@example.com", subject: "Missing html" },
      headers: {
        Cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; "),
      },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Missing required fields");
  });

  test("authenticated POST /api/email/send returns 200 (skipped in test env)", async ({
    request,
    page,
  }) => {
    test.skip(!HAS_CREDS, "E2E credentials not set");

    await page.goto(`${BASE_URL}/auth/login`);
    await page.fill('input[type="email"]', process.env.E2E_TEST_EMAIL!);
    await page.fill('input[type="password"]', process.env.E2E_TEST_PASSWORD!);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/);

    const cookies = await page.context().cookies();
    const res = await request.post(`${BASE_URL}/api/email/send`, {
      data: {
        to: "test@example.com",
        subject: "E2E test",
        html: "<p>E2E smoke test</p>",
        text: "E2E smoke test",
      },
      headers: {
        Cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; "),
      },
    });

    // 200 always — skipped=true when SMTP not configured
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});
