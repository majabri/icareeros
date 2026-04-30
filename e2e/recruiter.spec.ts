import { test, expect } from "@playwright/test";

const HAS_CREDS = !!process.env.E2E_TEST_EMAIL && !!process.env.E2E_TEST_PASSWORD;

test.describe("Recruiter Assistant", () => {
  test.skip(!HAS_CREDS, "E2E credentials not available in this environment");

  test.beforeEach(async ({ page }) => {
    await page.goto("/auth/login");
    await page.fill('input[type="email"]', process.env.E2E_TEST_EMAIL!);
    await page.fill('input[type="password"]', process.env.E2E_TEST_PASSWORD!);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/);
  });

  test("navigates to /recruiter from nav", async ({ page }) => {
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

  test("/api/recruiter returns 401 when unauthenticated", async ({ request }) => {
    const res = await request.post("/api/recruiter", {
      data: { job_description: "We are looking for a senior software engineer with 5+ years of experience in TypeScript and React to join our team." },
    });
    expect(res.status()).toBe(401);
  });
});
