/**
 * E2E tests for Job Application Fit (/evaluate/job-fit)
 *
 * Renamed and repointed from resumeadvisor.spec.ts, which tested
 * /resumeadvisor — a route that no longer exists. It was deliberately
 * consolidated on 2026-05-26; src/app/(app)/evaluate/job-fit/page.tsx says so
 * in its header ("Consolidation of the former /resumeadvisor (Advise) +
 * /fit-check (Evaluate)"). There is no /resumeadvisor page, no API route and
 * no nav link anywhere in src/, so those three tests could never pass again
 * and had been contributing 6 of the failures in #434 for months.
 *
 * This is not a stale test being deleted to get green: the successor route had
 * NO E2E coverage at all (evaluate.spec.ts only exercises /profile), so
 * deleting would have quietly dropped the feature. The assertions are carried
 * across to where the feature actually lives.
 *
 * One assertion genuinely could not carry over. The old spec asserted a nav
 * link `nav a[href="/resumeadvisor"]`; the successor is reached from a link on
 * the dashboard, not from AppNav, so the equivalent check targets that instead
 * of asserting a nav entry that is not meant to exist.
 */

import { test, expect } from "@playwright/test";

const HAS_CREDS =
  !!process.env.E2E_TEST_EMAIL && !!process.env.E2E_TEST_PASSWORD;

// ── Auth helper ────────────────────────────────────────────────────────────────

async function loginIfNeeded(page: import("@playwright/test").Page) {
  await page.goto("/auth/login");
  await page.fill('#identifier', process.env.E2E_TEST_EMAIL!);
  await page.fill('input[type="password"]', process.env.E2E_TEST_PASSWORD!);
  await page.click('button[type="submit"]');
  // Pattern match, not `${BASE_URL}/dashboard`. On a deployment where
  // NEXT_PUBLIC_JOBS_URL is unset, middleware.ts sends a job_seeker to
  // https://jobs.icareeros.com/dashboard after login, so an exact
  // base-URL match never fires. See the #434 note in the PR — this
  // tolerates the redirect rather than pretending it is not happening.
  await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

test("Job Application Fit is reachable from the dashboard", async ({ page }) => {
  test.skip(!HAS_CREDS, "E2E credentials not set");
  await loginIfNeeded(page);
  await expect(
    page.locator('a[href="/evaluate/job-fit"]').first(),
  ).toBeVisible();
});

test("Job Application Fit page renders heading", async ({ page }) => {
  test.skip(!HAS_CREDS, "E2E credentials not set");
  await loginIfNeeded(page);
  await page.goto("/evaluate/job-fit");
  // Heading is "🎯 Job Application Fit" — match on the text, not the emoji.
  await expect(
    page.getByRole("heading", { name: /job application fit/i }),
  ).toBeVisible();
});

test("Job Application Fit shows Step 1 (resume) and Step 2 (job)", async ({ page }) => {
  test.skip(!HAS_CREDS, "E2E credentials not set");
  await loginIfNeeded(page);
  await page.goto("/evaluate/job-fit");
  // The two-step structure survived the consolidation verbatim:
  // "Step 1 — Your Resume" / "Step 2 — The Job".
  await expect(page.getByText(/step 1/i).first()).toBeVisible();
  await expect(page.getByText(/step 2/i).first()).toBeVisible();
});
