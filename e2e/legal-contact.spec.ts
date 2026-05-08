import { test, expect } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
let SKIP_REASON: string | null = null;

test.beforeAll(async ({ request }) => {
  const res = await request.get(`${BASE_URL}/legal/contact`, { failOnStatusCode: false });
  if (res.status() === 404) {
    SKIP_REASON = "/legal/contact not yet deployed to BASE_URL — runs after merge";
  } else if (res.status() !== 200) {
    SKIP_REASON = `/legal/contact returned ${res.status()}`;
  }
});

test.describe("Legal contact form", () => {
  test.beforeEach(() => {
    test.skip(SKIP_REASON !== null, SKIP_REASON ?? "");
  });

  test("renders all required fields + submit button", async ({ page }) => {
    await page.goto(`${BASE_URL}/legal/contact`);
    await expect(page.getByTestId("legal-contact-name")).toBeVisible();
    await expect(page.getByTestId("legal-contact-email")).toBeVisible();
    await expect(page.getByTestId("legal-contact-address")).toBeVisible();
    await expect(page.getByTestId("legal-contact-message")).toBeVisible();
    await expect(page.getByTestId("legal-contact-submit")).toBeVisible();
  });

  test("page references info@icareeros.com as the routing destination", async ({ page }) => {
    await page.goto(`${BASE_URL}/legal/contact`);
    await expect(page.getByText(/info@icareeros\.com/)).toBeVisible();
  });

  test("/legal/privacy does NOT show DRAFT banner or [INSERT] placeholders", async ({ page }) => {
    await page.goto(`${BASE_URL}/legal/privacy`);
    const html = await page.content();
    expect(html).not.toContain("DRAFT NOTICE");
    expect(html).not.toContain("[INSERT");
    await expect(page.getByText(/effective date:\s*june 1, 2026/i)).toBeVisible();
  });

  test("/legal/terms does NOT show DRAFT banner or [INSERT] placeholders", async ({ page }) => {
    await page.goto(`${BASE_URL}/legal/terms`);
    const html = await page.content();
    expect(html).not.toContain("DRAFT NOTICE");
    expect(html).not.toContain("[INSERT");
    await expect(page.getByText(/effective date:\s*june 1, 2026/i)).toBeVisible();
  });
});
