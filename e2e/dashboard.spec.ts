import { test, expect, Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * Career OS Dashboard E2E tests.
 *
 * ARCHITECTURE:
 * Tests run against the live Vercel deployment (icareeros.vercel.app in CI).
 * Dashboard content tests require real Supabase credentials so that
 * @supabase/ssr can validate the session against the real auth API.
 *
 * Prerequisites (GitHub secrets / local env):
 *   E2E_TEST_EMAIL    — email of the dedicated e2e test user
 *   E2E_TEST_PASSWORD — password of the dedicated e2e test user
 *
 * Test user: e2e-test@icareeros.com (created in kuneabeiwcxavvyyfjkx)
 * Supabase project: kuneabeiwcxavvyyfjkx
 */

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://kuneabeiwcxavvyyfjkx.supabase.co";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const E2E_EMAIL = process.env.E2E_TEST_EMAIL ?? "";
const E2E_PASSWORD = process.env.E2E_TEST_PASSWORD ?? "";

const hasRealCreds = !!E2E_EMAIL && !!E2E_PASSWORD;

/** Sign in via the login form and wait for /dashboard redirect. */
async function signIn(page: Page): Promise<void> {
  await page.goto("/auth/login");
  await page.fill("#email", E2E_EMAIL);
  await page.fill("#password", E2E_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
}

/** Return a signed-in Supabase client and the user's ID. */
async function getSupabaseSession(): Promise<{
  supabase: ReturnType<typeof createClient>;
  userId: string;
} | null> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const {
    data: { session },
  } = await supabase.auth.signInWithPassword({
    email: E2E_EMAIL,
    password: E2E_PASSWORD,
  });
  if (!session) return null;
  return { supabase, userId: session.user.id };
}

// ─── Empty-state tests (no active cycle) ─────────────────────────────────────

test.describe("Career OS Dashboard — empty state", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    if (!hasRealCreds) {
      testInfo.skip(
        true,
        "Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run dashboard content tests"
      );
      return;
    }

    // Ensure no active cycles for this test user
    const ctx = await getSupabaseSession();
    if (ctx) {
      await ctx.supabase
        .from("career_os_cycles")
        .delete()
        .eq("user_id", ctx.userId)
        .eq("status", "active");
    }

    await signIn(page);
  });

  test("dashboard renders after login without redirecting back to login", async ({
    page,
  }) => {
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page).not.toHaveURL(/\/auth\/login/);
  });

  test("dashboard shows empty state with New cycle button when no active cycle", async ({
    page,
  }) => {
    // "Start your career cycle" heading only renders in the empty state
    await expect(
      page.getByText("Start your career cycle")
    ).toBeVisible({ timeout: 12_000 });
  });
});

// ─── Active-cycle tests ───────────────────────────────────────────────────────

test.describe("Career OS Dashboard — active cycle", () => {
  let supabase: ReturnType<typeof createClient> | null = null;
  let testUserId: string | null = null;

  test.beforeAll(async () => {
    if (!hasRealCreds) return;

    const ctx = await getSupabaseSession();
    if (!ctx) return;
    supabase = ctx.supabase;
    testUserId = ctx.userId;

    // Clean any leftover cycles, then create a fresh one
    await supabase
      .from("career_os_cycles")
      .delete()
      .eq("user_id", testUserId);

    const { error } = await supabase.from("career_os_cycles").insert({
      user_id: testUserId,
      goal: "Become a Senior Engineer",
      status: "active",
      current_stage: "evaluate",
      cycle_number: 1,
    });

    if (error) {
      console.error("Failed to create test cycle:", error.message);
    }
  });

  test.afterAll(async () => {
    if (supabase && testUserId) {
      await supabase
        .from("career_os_cycles")
        .delete()
        .eq("user_id", testUserId);
    }
  });

  test.beforeEach(async ({ page }, testInfo) => {
    if (!hasRealCreds) {
      testInfo.skip(
        true,
        "Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run dashboard content tests"
      );
      return;
    }
    await signIn(page);
  });

  test("dashboard shows 6 Career OS stage cards with descriptions", async ({
    page,
  }) => {
    // Use stage DESCRIPTIONS (not labels) — descriptions only appear in stage
    // cards, not in the header text, so this test is stage-card-specific.
    const descriptions = [
      "Assess your skills, gaps, and market fit",
      "Get AI-powered career path recommendations",
      "Acquire the skills your target role demands",
      "Apply, network, and build real-world experience",
      "Interview prep, resume polish, and accountability",
      "Land the role, promotion, or milestone",
    ];
    for (const desc of descriptions) {
      await expect(page.getByText(desc)).toBeVisible({ timeout: 12_000 });
    }
  });

  test("dashboard shows the active cycle goal", async ({ page }) => {
    // Goal text renders inside cycle header: "Cycle #1 — Become a Senior Engineer"
    await expect(
      page.getByText("Become a Senior Engineer", { exact: false })
    ).toBeVisible({ timeout: 12_000 });
  });

  test("current stage card has a Run Evaluate button", async ({ page }) => {
    // Button text is "Run {stageLabel}" — for current_stage=evaluate it is "Run Evaluate"
    await expect(
      page.getByRole("button", { name: "Run Evaluate" })
    ).toBeVisible({ timeout: 12_000 });
  });

  test("dashboard shows stage progress text for the active cycle", async ({
    page,
  }) => {
    // "Stage N of 6" text appears in the cycle progress section
    await expect(
      page.getByText(/Stage \d+ of 6/)
    ).toBeVisible({ timeout: 12_000 });
  });

  test("plan badge shows Free plan", async ({ page }) => {
    await expect(page.getByText(/free/i).first()).toBeVisible({
      timeout: 12_000,
    });
  });
});

// ─── Navigation tests — run everywhere (no credentials needed) ───────────────

test.describe("Dashboard navigation", () => {
  test("unauthenticated user is redirected to /auth/login from /dashboard", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/auth\/login/, { timeout: 12_000 });
  });

  test("unauthenticated user is redirected to /auth/login from /settings", async ({
    page,
  }) => {
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/auth\/login/, { timeout: 12_000 });
  });
});
