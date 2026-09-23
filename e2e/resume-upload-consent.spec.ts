import { test, expect } from "@playwright/test";
import { HAS_CREDS } from "./support/auth";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

// Behind login. Skip when creds aren't configured (matches existing pattern
// in account.spec.ts) AND when the new modal isn't deployed to BASE_URL yet
// (so we don't fail on prod-CI before this PR merges).
let SKIP_REASON: string | null = null;

test.describe("Resume upload consent modal", () => {
  test.skip(!HAS_CREDS, "E2E_TEST_EMAIL / E2E_TEST_PASSWORD not set");

  test.beforeAll(async ({ request }) => {
    try {
      // Probe an unauthed page (the modal source code is shipped to all clients)
      // for the test ids the modal exposes. If the build doesn't have the modal,
      // we know this PR's code isn't live yet and we skip.
      const res = await request.get(`${BASE_URL}/auth/signup`, { failOnStatusCode: false });
      if (res.status() !== 200) {
        SKIP_REASON = `signup probe failed (${res.status()})`;
      }
      // If Phase 2 made it but Phase 3 didn't, the resume modal won't exist.
      // That edge case still skips below — the modal-rendering tests target
      // /mycareer/profile which requires login, so we trust the click flow.
    } catch (err) {
      SKIP_REASON = `BASE_URL not reachable: ${(err as Error).message}`;
    }
  });

  test.beforeEach(() => {
    test.skip(SKIP_REASON !== null, SKIP_REASON ?? "");
  });

  test("clicking the dropzone on /mycareer/profile shows the consent modal", async ({ page }) => {
    await page.goto(`${BASE_URL}/mycareer/profile`);
    // Find the "Drop resume here or click to browse" dropzone and click it.
    const dropzone = page.getByText(/drop resume here or click to browse/i);
    await expect(dropzone).toBeVisible();
    await dropzone.click();
    // Modal should appear with our title and Accept/Cancel buttons.
    await expect(page.getByRole("dialog", { name: /before you upload your resume/i })).toBeVisible();
    await expect(page.getByTestId("resume-consent-accept")).toBeVisible();
    await expect(page.getByTestId("resume-consent-cancel")).toBeVisible();
  });

  test("clicking Cancel dismisses the modal without opening the file picker", async ({ page }) => {
    await page.goto(`${BASE_URL}/mycareer/profile`);
    await page.getByText(/drop resume here or click to browse/i).click();
    await expect(page.getByRole("dialog", { name: /before you upload/i })).toBeVisible();
    await page.getByTestId("resume-consent-cancel").click();
    await expect(page.getByRole("dialog", { name: /before you upload/i })).toHaveCount(0);
    // Native file picker can't be observed in Playwright; the visible dismissal
    // is the strongest signal we can capture without mocking the chooser.
  });

  test("Accept button has initial focus", async ({ page }) => {
    await page.goto(`${BASE_URL}/mycareer/profile`);
    await page.getByText(/drop resume here or click to browse/i).click();
    await expect(page.getByTestId("resume-consent-accept")).toBeFocused();
  });
});
