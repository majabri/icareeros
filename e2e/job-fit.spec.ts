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
 *
 * The per-file login helper is gone as of #433 — globalSetup signs in once for
 * the whole run and every test here starts with that session.
 */

import { test, expect } from "@playwright/test";
import { HAS_CREDS } from "./support/auth";

// ── Tests ──────────────────────────────────────────────────────────────────────

test("Job Application Fit is reachable from the dashboard", async ({ page }) => {
  test.skip(!HAS_CREDS, "E2E credentials not set");
  await page.goto("/dashboard");
  await expect(
    page.locator('a[href="/evaluate/job-fit"]').first(),
  ).toBeVisible();
});

test("Job Application Fit page renders heading", async ({ page }) => {
  test.skip(!HAS_CREDS, "E2E credentials not set");
  await page.goto("/evaluate/job-fit");
  // Heading is "🎯 Job Application Fit" — match on the text, not the emoji.
  await expect(
    page.getByRole("heading", { name: /job application fit/i }),
  ).toBeVisible();
});

test("Job Application Fit shows Step 1 (resume) and Step 2 (job)", async ({ page }) => {
  test.skip(!HAS_CREDS, "E2E credentials not set");
  await page.goto("/evaluate/job-fit");
  // The two-step structure survived the consolidation verbatim:
  // "Step 1 — Your Resume" / "Step 2 — The Job".
  await expect(page.getByText(/step 1/i).first()).toBeVisible();
  await expect(page.getByText(/step 2/i).first()).toBeVisible();
});
