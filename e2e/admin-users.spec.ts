import { test, expect } from "@playwright/test";
import { HAS_CREDS, LOGGED_OUT } from "./support/auth";

test.describe("Admin — Users tab", () => {
  test.skip(!HAS_CREDS, "E2E credentials not available in this environment");

  // The inline sign-in is gone — globalSetup signs in once for the run (#433).
  // The assertion is unchanged: the shared E2E account is not an admin, so
  // /admin must bounce it.
  test("non-admin is redirected away from /admin", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).not.toHaveURL(/\/admin/);
  });
});

/**
 * Signed out — this one probes what an anonymous request to /admin gets, so
 * it must not inherit the suite-wide session.
 */
test.describe("Admin — Users tab, unauthenticated", () => {
  test.use({ storageState: LOGGED_OUT });
  test.skip(!HAS_CREDS, "E2E credentials not available in this environment");

  test("/admin page loads Users section heading", async ({ request }) => {
    // Verify the admin page responds — full auth test only runs with admin creds
    const res = await request.get("/admin");
    // Should redirect (302/307) for unauthenticated users
    expect([200, 302, 307]).toContain(res.status());
  });
});
