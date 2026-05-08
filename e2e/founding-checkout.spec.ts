import { test, expect } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const E2E_EMAIL    = process.env.E2E_TEST_EMAIL    ?? "";
const E2E_PASSWORD = process.env.E2E_TEST_PASSWORD ?? "";
const HAS_CREDS    = Boolean(E2E_EMAIL && E2E_PASSWORD);

let SKIP_REASON: string | null = null;

test.beforeAll(async ({ request }) => {
  try {
    const res = await request.get(`${BASE_URL}/founding`, { failOnStatusCode: false });
    // 200 = unauth-friendly (it isn't), 307 = auth-redirect (expected),
    // 404 = not deployed yet → skip
    if (res.status() === 404) {
      SKIP_REASON = "/founding not yet deployed to BASE_URL — runs after merge";
    }
  } catch (err) {
    SKIP_REASON = `BASE_URL not reachable: ${(err as Error).message}`;
  }
});

async function login(page: import("@playwright/test").Page) {
  await page.goto(`${BASE_URL}/auth/login`);
  await page.fill('input[type="email"]', E2E_EMAIL);
  await page.fill('input[type="password"]', E2E_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE_URL}/dashboard`, { timeout: 15_000 });
}

test.describe("Founding offer checkout", () => {
  test.skip(!HAS_CREDS, "E2E_TEST_EMAIL / E2E_TEST_PASSWORD not set");

  test.beforeEach(() => {
    test.skip(SKIP_REASON !== null, SKIP_REASON ?? "");
  });

  test("renders headline + price + consent + payment button", async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/founding`);
    await expect(page.getByRole("heading", { name: /founding lifetime access/i, level: 1 })).toBeVisible();
    await expect(page.getByText(/\$89\.00/)).toBeVisible();
    await expect(page.getByTestId("founding-nonrefundable-consent")).toBeVisible();
    await expect(page.getByTestId("founding-purchase-button")).toBeVisible();
  });

  test("payment button is disabled until non-refundable checkbox is checked", async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/founding`);
    const button = page.getByTestId("founding-purchase-button");
    await expect(button).toBeDisabled();

    await page.getByTestId("founding-nonrefundable-consent").check();
    await expect(button).toBeEnabled();

    await page.getByTestId("founding-nonrefundable-consent").uncheck();
    await expect(button).toBeDisabled();
  });

  test("non-refundable checkbox is required and aria-required=true", async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/founding`);
    const cb = page.getByTestId("founding-nonrefundable-consent");
    await expect(cb).toHaveAttribute("aria-required", "true");
    await expect(cb).toHaveAttribute("required", "");
  });

  test("Founding Member Terms link points to /legal/terms#founding-offer in new tab", async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/founding`);
    const link = page.getByRole("link", { name: /founding member terms/i }).first();
    await expect(link).toHaveAttribute("href", "/legal/terms#founding-offer");
    await expect(link).toHaveAttribute("target", "_blank");
  });
});
