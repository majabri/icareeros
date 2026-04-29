import { test, expect } from "@playwright/test";

const E2E_EMAIL    = process.env.E2E_TEST_EMAIL    ?? "";
const E2E_PASSWORD = process.env.E2E_TEST_PASSWORD ?? "";
const HAS_CREDS    = Boolean(E2E_EMAIL && E2E_PASSWORD);
const BASE_URL     = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

async function login(page: import("@playwright/test").Page) {
  await page.goto(`${BASE_URL}/auth/login`);
  await page.fill('input[type="email"]', E2E_EMAIL);
  await page.fill('input[type="password"]', E2E_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE_URL}/dashboard`, { timeout: 15_000 });
}

test.describe("Account Settings (/settings/account)", () => {
  test.skip(!HAS_CREDS, "E2E_TEST_EMAIL / E2E_TEST_PASSWORD not set");

  test("redirects unauthenticated users to /auth/login", async ({ page }) => {
    await page.goto(`${BASE_URL}/settings/account`);
    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test("renders export and danger zone sections", async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/settings/account`);
    await expect(page.locator("text=Export your data")).toBeVisible();
    await expect(page.locator("text=Danger zone")).toBeVisible();
  });

  test("export button is visible and enabled", async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/settings/account`);
    const btn = page.locator("button", { hasText: "Export my data" });
    await expect(btn).toBeVisible();
    await expect(btn).toBeEnabled();
  });

  test("delete button opens confirmation modal", async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/settings/account`);
    await page.locator("button", { hasText: "Delete my account" }).click();
    await expect(page.locator("text=Delete account permanently?")).toBeVisible();
    await expect(page.locator('input[placeholder="DELETE"]')).toBeVisible();
  });

  test("delete confirm button is disabled until DELETE is typed", async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/settings/account`);
    await page.locator("button", { hasText: "Delete my account" }).click();
    const confirmBtn = page.locator("button", { hasText: "Delete account" });
    await expect(confirmBtn).toBeDisabled();
    await page.fill('input[placeholder="DELETE"]', "delete");
    await expect(confirmBtn).toBeDisabled(); // lowercase — must be exact
    await page.fill('input[placeholder="DELETE"]', "DELETE");
    await expect(confirmBtn).toBeEnabled();
  });

  test("cancel button closes the modal", async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/settings/account`);
    await page.locator("button", { hasText: "Delete my account" }).click();
    await expect(page.locator("text=Delete account permanently?")).toBeVisible();
    await page.locator("button", { hasText: "Cancel" }).click();
    await expect(page.locator("text=Delete account permanently?")).not.toBeVisible();
  });

  test("GET /api/settings/export returns 401 for unauthenticated request", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/settings/export`);
    expect(res.status()).toBe(401);
  });

  test("POST /api/settings/delete-account returns 401 for unauthenticated request", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/settings/delete-account`, {
      data: { confirm: "DELETE" },
    });
    expect(res.status()).toBe(401);
  });
});
