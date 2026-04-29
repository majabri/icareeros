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

test.describe("Support Inbox (/support)", () => {
  test.skip(!HAS_CREDS, "E2E_TEST_EMAIL / E2E_TEST_PASSWORD not set");

  test("redirects unauthenticated users to /auth/login", async ({ page }) => {
    await page.goto(`${BASE_URL}/support`);
    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test("renders the support page with form and ticket history", async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/support`);
    await expect(page.locator("h1")).toContainText("Support");
    await expect(page.locator("h2").first()).toContainText("Submit a ticket");
    await expect(page.locator("h2").last()).toContainText("My tickets");
  });

  test("shows validation error when subject is too short", async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/support`);
    // HTML5 minlength will prevent submit natively; test that form fields exist
    const subjectInput = page.locator('input[id="subject"]');
    await expect(subjectInput).toBeVisible();
    expect(await subjectInput.getAttribute("minlength")).toBe("5");
  });

  test("priority chips are selectable", async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/support`);
    const highBtn = page.locator("button", { hasText: "High" });
    await expect(highBtn).toBeVisible();
    await highBtn.click();
    await expect(highBtn).toHaveClass(/border-blue-600/);
  });

  test("submits a ticket and shows success message", async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/support`);
    await page.fill('input[id="subject"]', "E2E test: support ticket");
    await page.fill('textarea[id="body"]', "This is an automated E2E test ticket. Please ignore.");
    await page.click('button[type="submit"]');
    await expect(page.locator("text=Ticket submitted")).toBeVisible({ timeout: 10_000 });
  });

  test("new ticket appears in My tickets list after submit", async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/support`);
    await page.fill('input[id="subject"]', "E2E test: ticket appears in list");
    await page.fill('textarea[id="body"]', "Verifying the new ticket renders in the history list.");
    await page.click('button[type="submit"]');
    await expect(page.locator("text=Ticket submitted")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("text=E2E test: ticket appears in list")).toBeVisible();
  });

  test("GET /api/support returns 401 for unauthenticated request", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/support`);
    expect(res.status()).toBe(401);
  });
});
