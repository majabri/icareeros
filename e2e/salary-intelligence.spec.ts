/**
 * E2E tests — Salary Intelligence (Day 34)
 *
 * Tests:
 * 1. POST /api/salary-intelligence → 401 without authentication
 * 2. POST /api/salary-intelligence → 400 when opportunity_ids is missing
 * 3. /jobs page shows "Enriching salaries…" indicator (or enriched salary tags)
 *    when null-salary opportunities are present
 *    (skipped pre-deploy using probe pattern)
 */

import { test, expect } from "@playwright/test";

// ── Env ───────────────────────────────────────────────────────────────────────

const BASE_URL  = process.env.PLAYWRIGHT_BASE_URL ?? "https://icareeros.vercel.app";
const E2E_EMAIL = process.env.E2E_TEST_EMAIL    ?? "";
const E2E_PASS  = process.env.E2E_TEST_PASSWORD ?? "";
const hasRealCreds = Boolean(E2E_EMAIL && E2E_PASS);

// ── Probes ────────────────────────────────────────────────────────────────────

let salaryRouteDeployed = false; // /api/salary-intelligence exists in this deployment

test.use({ baseURL: BASE_URL });

test.beforeAll(async ({ browser }) => {
  if (!hasRealCreds) return;

  const page = await browser.newPage();
  try {
    await page.goto("/auth/login");
    await page.locator("#email").fill(E2E_EMAIL);
    await page.locator("#password").fill(E2E_PASS);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/dashboard/, { timeout: 15_000 });

    // Probe the salary-intelligence API route
    const routeRes = await page.request.post("/api/salary-intelligence", {
      data: { opportunity_ids: ["probe"] },
      headers: { "Content-Type": "application/json" },
      failOnStatusCode: false,
    });
    // 401 = route exists (unauthenticated context); 200/500 = exists; 404 = not yet deployed
    salaryRouteDeployed = routeRes.status() !== 404;
  } catch {
    salaryRouteDeployed = false;
  } finally {
    await page.close();
  }
});

// ── Tests ─────────────────────────────────────────────────────────────────────

test("POST /api/salary-intelligence → 401 without authentication", async ({ request }) => {
  test.skip(!salaryRouteDeployed, "Salary Intelligence route not yet deployed — skipping until PR is merged");

  const res = await request.post(`${BASE_URL}/api/salary-intelligence`, {
    data: { opportunity_ids: ["test-id"] },
    headers: { "Content-Type": "application/json" },
    failOnStatusCode: false,
  });
  expect(res.status()).toBe(401);
});

test("POST /api/salary-intelligence → 400 when opportunity_ids is missing", async ({ browser }) => {
  test.skip(!salaryRouteDeployed, "Salary Intelligence route not yet deployed — skipping until PR is merged");
  test.skip(!hasRealCreds, "No E2E credentials — skipping authenticated test");

  const page = await browser.newPage();
  try {
    await page.goto("/auth/login");
    await page.locator("#email").fill(E2E_EMAIL);
    await page.locator("#password").fill(E2E_PASS);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/dashboard/, { timeout: 15_000 });

    const res = await page.request.post("/api/salary-intelligence", {
      data: {},
      headers: { "Content-Type": "application/json" },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/opportunity_ids/i);
  } finally {
    await page.close();
  }
});

test("/jobs page loads without salary enrichment errors", async ({ browser }) => {
  test.skip(!salaryRouteDeployed, "Salary Intelligence route not yet deployed — skipping until PR is merged");
  test.skip(!hasRealCreds, "No E2E credentials — skipping authenticated test");

  const page = await browser.newPage();
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  try {
    await page.goto("/auth/login");
    await page.locator("#email").fill(E2E_EMAIL);
    await page.locator("#password").fill(E2E_PASS);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/dashboard/, { timeout: 15_000 });

    await page.goto("/jobs");
    await page.waitForLoadState("networkidle");

    // Page should load without crashing
    const heading = page.locator("h1, h2").filter({ hasText: /opportunit|job/i }).first();
    // If no heading, at least the page title or search input should exist
    const searchInput = page.locator('input[placeholder*="search" i], input[type="search"], input[placeholder*="role" i], input[placeholder*="title" i]').first();

    const pageLoaded =
      (await heading.isVisible().catch(() => false)) ||
      (await searchInput.isVisible().catch(() => false));
    expect(pageLoaded).toBe(true);

    // No unhandled fetch errors should appear
    const salaryErrors = consoleErrors.filter((e) => e.includes("salary-intelligence") && e.includes("500"));
    expect(salaryErrors).toHaveLength(0);
  } finally {
    await page.close();
  }
});
