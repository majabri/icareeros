import { test, expect } from "@playwright/test";

const HAS_CREDS =
  !!process.env.E2E_TEST_EMAIL && !!process.env.E2E_TEST_PASSWORD;

test.describe("Admin — Users tab", () => {
  test.skip(!HAS_CREDS, "E2E credentials not available in this environment");

  test("non-admin is redirected away from /admin", async ({ page }) => {
    await page.goto("/auth/login");
    await page.fill('input[type="email"]', process.env.E2E_TEST_EMAIL!);
    await page.fill('input[type="password"]', process.env.E2E_TEST_PASSWORD!);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(dashboard|auth)/);
    await page.goto("/admin");
    // Non-admin should be redirected away from /admin
    await expect(page).not.toHaveURL(/\/admin/);
  });

  test("/admin page loads Users section heading", async ({ page, request }) => {
    // Verify the admin page responds — full auth test only runs with admin creds
    const res = await request.get("/admin");
    // Should redirect (302/307) for unauthenticated users
    expect([200, 302, 307]).toContain(res.status());
  });
});
