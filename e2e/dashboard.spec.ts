import { test, expect, Page } from "@playwright/test";

/**
 * Career OS Dashboard E2E tests.
 *
 * These tests verify the dashboard UI components and Career OS stage
 * interactions. Auth is bypassed by injecting a fake session cookie so
 * middleware allows access to /dashboard.
 *
 * Staging Supabase project: muevgfmpzykihjuihnga
 */

const SUPABASE_STAGING_URL = "https://muevgfmpzykihjuihnga.supabase.co";

/** Inject a fake Supabase session so middleware passes through to /dashboard */
async function injectFakeSession(page: Page) {
  const fakeSession = {
    access_token: "fake-access-token",
    refresh_token: "fake-refresh-token",
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: "bearer",
    user: {
      id: "test-user-id",
      email: "test@example.com",
      aud: "authenticated",
      role: "authenticated",
    },
  };

  // Supabase SSR reads the session from the sb-* cookie
  await page.context().addCookies([
    {
      name: "sb-muevgfmpzykihjuihnga-auth-token",
      value: JSON.stringify(fakeSession),
      domain: "localhost",
      path: "/",
      httpOnly: false,
      secure: false,
    },
  ]);

  // Also intercept the auth/user check that middleware makes
  await page.route(`${SUPABASE_STAGING_URL}/auth/v1/user`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "test-user-id",
        email: "test@example.com",
        aud: "authenticated",
        role: "authenticated",
      }),
    });
  });
}

/** Intercept Supabase REST calls for dashboard data */
async function mockDashboardData(
  page: Page,
  opts: { hasActiveCycle: boolean }
) {
  await page.route(`${SUPABASE_STAGING_URL}/rest/v1/**`, async (route) => {
    const url = route.request().url();

    // career_os_cycles query
    if (url.includes("career_os_cycles")) {
      if (opts.hasActiveCycle) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([
            {
              id: "cycle-1",
              user_id: "test-user-id",
              goal: "Become a Senior Engineer",
              status: "active",
              current_stage: "evaluate",
              started_at: new Date().toISOString(),
              completed_at: null,
            },
          ]),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([]),
        });
      }
      return;
    }

    // career_os_stages query
    if (url.includes("career_os_stages")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          opts.hasActiveCycle
            ? [
                {
                  id: "stage-1",
                  cycle_id: "cycle-1",
                  stage: "evaluate",
                  status: "in_progress",
                  started_at: new Date().toISOString(),
                  completed_at: null,
                  notes: null,
                },
              ]
            : []
        ),
      });
      return;
    }

    // user_subscriptions query
    if (url.includes("user_subscriptions")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "sub-1",
            user_id: "test-user-id",
            plan: "free",
            status: "active",
          },
        ]),
      });
      return;
    }

    // billing-service edge function
    if (url.includes("billing-service")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          plan: "free",
          status: "active",
        }),
      });
      return;
    }

    await route.continue();
  });

  // Also intercept edge function invocations
  await page.route(`${SUPABASE_STAGING_URL}/functions/v1/**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ plan: "free", status: "active" }),
    });
  });
}

test.describe("Career OS Dashboard", () => {
  test("dashboard shows empty state with goal input when no active cycle", async ({
    page,
  }) => {
    await injectFakeSession(page);
    await mockDashboardData(page, { hasActiveCycle: false });

    await page.goto("/dashboard");

    // Should show empty state prompting user to start a cycle
    await expect(
      page.getByText(/start|begin|first cycle|career goal/i).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("dashboard shows 6 stage cards when active cycle exists", async ({
    page,
  }) => {
    await injectFakeSession(page);
    await mockDashboardData(page, { hasActiveCycle: true });

    await page.goto("/dashboard");

    // Should show all 6 Career OS stage names
    const stages = ["Evaluate", "Advise", "Learn", "Act", "Coach", "Achieve"];
    for (const stage of stages) {
      await expect(page.getByText(stage)).toBeVisible({ timeout: 10_000 });
    }
  });

  test("dashboard shows active cycle goal", async ({ page }) => {
    await injectFakeSession(page);
    await mockDashboardData(page, { hasActiveCycle: true });

    await page.goto("/dashboard");

    await expect(
      page.getByText(/Become a Senior Engineer/i)
    ).toBeVisible({ timeout: 10_000 });
  });

  test("current stage card has Run button", async ({ page }) => {
    await injectFakeSession(page);
    await mockDashboardData(page, { hasActiveCycle: true });

    await page.goto("/dashboard");

    // The current stage (evaluate) should have a Run button
    await expect(
      page.getByRole("button", { name: /run/i }).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("dashboard shows progress bar for active cycle", async ({ page }) => {
    await injectFakeSession(page);
    await mockDashboardData(page, { hasActiveCycle: true });

    await page.goto("/dashboard");

    // Progress indicator should be present
    // CareerOsDashboard renders a progress bar div
    const progressBar = page.locator('[role="progressbar"], [class*="progress"]').first();
    await expect(progressBar).toBeVisible({ timeout: 10_000 });
  });

  test("plan badge shows Free plan", async ({ page }) => {
    await injectFakeSession(page);
    await mockDashboardData(page, { hasActiveCycle: true });

    await page.goto("/dashboard");

    // PlanBadge should show "Free"
    await expect(page.getByText(/free/i).first()).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("Dashboard navigation", () => {
  test("unauthenticated user is redirected to login from /dashboard", async ({
    page,
  }) => {
    // No session injected — middleware should redirect
    await page.route(`${SUPABASE_STAGING_URL}/auth/v1/user`, async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ message: "not authenticated" }),
      });
    });

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/auth\/login/);
  });
});
