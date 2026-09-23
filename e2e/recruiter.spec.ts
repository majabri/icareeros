import { test, expect } from "@playwright/test";
import { HAS_CREDS, LOGGED_OUT } from "./support/auth";

// The beforeEach that signed in before every test is gone — globalSetup does
// it once for the whole run (#433).

test.describe("Recruiter Assistant", () => {
  test.skip(!HAS_CREDS, "E2E credentials not available in this environment");

  test("navigates to /recruiter from nav", async ({ page }) => {
    await page.goto("/dashboard");
    await page.click('a[href="/recruiter"]');
    await expect(page).toHaveURL(/\/recruiter/);
    await expect(page.getByRole("heading", { name: /Recruiter Assistant/i })).toBeVisible();
  });

  test("analyse button is disabled when JD is too short", async ({ page }) => {
    await page.goto("/recruiter");
    const btn = page.getByRole("button", { name: /Analyse Job Description/i });
    await expect(btn).toBeDisabled();
  });

  test("analyse button enables when JD has 50+ chars", async ({ page }) => {
    await page.goto("/recruiter");
    await page.fill("textarea", "We are looking for a senior software engineer with 5+ years of experience in TypeScript and React.");
    await expect(page.getByRole("button", { name: /Analyse Job Description/i })).toBeEnabled();
  });
});

/**
 * Signed out — the `request` fixture inherits the suite-wide session, so it
 * has to be cleared for a 401 assertion to mean anything.
 */
test.describe("Recruiter Assistant — unauthenticated", () => {
  test.use({ storageState: LOGGED_OUT });
  test.skip(!HAS_CREDS, "E2E credentials not available in this environment");

  test("/api/recruiter returns 401 when unauthenticated", async ({ request }) => {
    const res = await request.post("/api/recruiter", {
      data: { job_description: "We are looking for a senior software engineer with 5+ years of experience in TypeScript and React to join our team." },
    });
    expect(res.status()).toBe(401);
  });
});
