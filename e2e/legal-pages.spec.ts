import { test, expect } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

test.describe("Legal pages (/legal/*)", () => {
  for (const [path, h1] of [
    ["/legal/privacy", "Privacy Policy"],
    ["/legal/terms", "Terms of Service"],
    ["/legal/cookies", "Cookie Policy"],
    ["/legal/ai-disclosure", "AI Use Disclosure"],
  ] as const) {
    test(`${path} returns 200 and renders <h1> "${h1}"`, async ({ page }) => {
      const response = await page.goto(`${BASE_URL}${path}`);
      expect(response?.status()).toBe(200);
      await expect(page.locator("h1").first()).toContainText(h1);
    });
  }

  test("legal sidenav links between the four pages", async ({ page }) => {
    await page.goto(`${BASE_URL}/legal/privacy`);
    for (const label of ["Terms of Service", "Cookie Policy", "AI Disclosure"]) {
      await expect(page.getByRole("link", { name: label })).toBeVisible();
    }
  });
});
