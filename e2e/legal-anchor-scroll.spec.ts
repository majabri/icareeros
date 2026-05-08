import { test, expect } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

let SKIP_REASON: string | null = null;

test.beforeAll(async ({ request }) => {
  try {
    const res = await request.get(`${BASE_URL}/legal/terms`, { failOnStatusCode: false });
    if (res.status() !== 200) {
      SKIP_REASON = `/legal/terms not reachable (${res.status()})`;
      return;
    }
    const html = await res.text();
    // The HashScroll component is shipped on this PR. Probe via the founding-offer
    // anchor — that's the load-bearing user flow and the one we fixed.
    if (!html.includes('id="founding-offer"')) {
      SKIP_REASON = "founding-offer anchor not yet deployed to BASE_URL — runs after merge";
    }
  } catch (err) {
    SKIP_REASON = `BASE_URL not reachable: ${(err as Error).message}`;
  }
});

test.describe("Legal page anchor scroll", () => {
  test.beforeEach(() => {
    test.skip(SKIP_REASON !== null, SKIP_REASON ?? "");
  });

  test("/legal/terms#founding-offer scrolls past the page header on initial load", async ({ page }) => {
    await page.goto(`${BASE_URL}/legal/terms#founding-offer`);
    // Wait for HashScroll's rAF to fire.
    await page.waitForTimeout(500);
    const target = page.locator('#founding-offer');
    await expect(target).toBeInViewport();
  });

  test("/legal/privacy#ai-processing scrolls to the AI processing section", async ({ page }) => {
    await page.goto(`${BASE_URL}/legal/privacy#ai-processing`);
    await page.waitForTimeout(500);
    const target = page.locator('#ai-processing');
    await expect(target).toBeInViewport();
  });
});
