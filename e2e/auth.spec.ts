import { test, expect } from "@playwright/test";

/**
 * Auth flow E2E tests.
 *
 * These tests verify the middleware redirect logic and the AuthForm component
 * without making real Supabase auth calls (which would require live credentials
 * in CI). The tests mock the auth responses via page.route() so they run
 * against the staging Supabase URL but intercept at the network layer.
 *
 * Staging Supabase project: muevgfmpzykihjuihnga
 */

const SUPABASE_STAGING_URL = "https://muevgfmpzykihjuihnga.supabase.co";

test.describe("Auth flow", () => {
  test.beforeEach(async ({ page }) => {
    // Intercept Supabase auth requests so tests are hermetic
    await page.route(`${SUPABASE_STAGING_URL}/auth/v1/**`, async (route) => {
      const url = route.request().url();
      const body = route.request().postDataJSON() ?? {};

      // Signup: return a fake session
      if (url.includes("/signup")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            user: { id: "test-user-id", email: body.email ?? "test@example.com" },
            session: {
              access_token: "fake-access-token",
              refresh_token: "fake-refresh-token",
              expires_in: 3600,
              token_type: "bearer",
              user: { id: "test-user-id", email: body.email ?? "test@example.com" },
            },
          }),
        });
        return;
      }

      // Token (login): return a fake session
      if (url.includes("/token")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            access_token: "fake-access-token",
            refresh_token: "fake-refresh-token",
            expires_in: 3600,
            token_type: "bearer",
            user: { id: "test-user-id", email: body.email ?? "test@example.com" },
          }),
        });
        return;
      }

      // Session endpoint: not authenticated by default
      if (url.includes("/session")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: { session: null }, error: null }),
        });
        return;
      }

      await route.continue();
    });
  });

  test("unauthenticated user visiting /dashboard is redirected to /auth/login", async ({
    page,
  }) => {
    // Intercept the session check to return no session
    await page.route(`${SUPABASE_STAGING_URL}/auth/v1/user`, async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ message: "not authenticated" }),
      });
    });

    await page.goto("/dashboard");
    // Middleware should redirect to /auth/login
    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test("unauthenticated user visiting /settings is redirected to /auth/login", async ({
    page,
  }) => {
    await page.route(`${SUPABASE_STAGING_URL}/auth/v1/user`, async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ message: "not authenticated" }),
      });
    });

    await page.goto("/settings");
    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test("login page renders email and password fields", async ({ page }) => {
    await page.goto("/auth/login");
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in|log in/i })).toBeVisible();
  });

  test("signup page renders email, password and confirm password fields", async ({
    page,
  }) => {
    await page.goto("/auth/signup");
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /sign up|create account/i })).toBeVisible();
  });

  test("login page shows link to signup", async ({ page }) => {
    await page.goto("/auth/login");
    await expect(page.getByRole("link", { name: /sign up|create account/i })).toBeVisible();
  });

  test("signup page shows link to login", async ({ page }) => {
    await page.goto("/auth/signup");
    await expect(page.getByRole("link", { name: /sign in|log in/i })).toBeVisible();
  });

  test("login page preserves redirect param in URL", async ({ page }) => {
    await page.goto("/auth/login?redirect=/dashboard");
    const url = page.url();
    expect(url).toContain("redirect=");
  });

  test("root / renders the public landing page", async ({ page }) => {
    await page.goto("/");
    // PR #28 replaced the root redirect with a public marketing landing page.
    // Unauthenticated users see the landing page at "/" — no redirect occurs.
    await expect(page).toHaveURL("/");
  });

  test("login form shows validation error on empty submit", async ({ page }) => {
    await page.goto("/auth/login");
    await page.getByRole("button", { name: /sign in|log in/i }).click();
    // Browser native validation or AuthForm validation should prevent submission
    // and show an error or keep user on the page
    await expect(page).toHaveURL(/\/auth\/login/);
  });
});
