/**
 * Playwright globalSetup — sign in once for the whole run.
 *
 * Replaces the per-file UI login that 24 of 32 spec files performed
 * independently. See #433 and the header of e2e/support/auth.ts.
 *
 * Runs once per `playwright test` invocation, before any project starts, and
 * writes a storageState file that playwright.config.ts hands to every test.
 */

import { chromium, type FullConfig } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { STORAGE_STATE, E2E_EMAIL, E2E_PASSWORD, HAS_CREDS } from "./support/auth";

/** An empty browser state — what a test gets when there is nothing to sign in with. */
const EMPTY_STATE = { cookies: [], origins: [] };

function writeState(state: unknown): void {
  fs.mkdirSync(path.dirname(STORAGE_STATE), { recursive: true });
  fs.writeFileSync(STORAGE_STATE, JSON.stringify(state, null, 2));
}

export default async function globalSetup(config: FullConfig): Promise<void> {
  // The baseURL every project shares; projects here differ only by viewport.
  const baseURL =
    config.projects[0]?.use?.baseURL ??
    process.env.PLAYWRIGHT_BASE_URL ??
    "http://localhost:3000";

  // No credentials is a legitimate state, not an error: it is how the suite
  // runs locally and how it ran in CI before E2E_TEST_EMAIL existed. Write an
  // empty state so `use.storageState` still resolves to a real file — every
  // test that needs a session already guards on HAS_CREDS and skips itself.
  if (!HAS_CREDS) {
    console.log(
      "[global-setup] E2E_TEST_EMAIL / E2E_TEST_PASSWORD not set — writing an " +
        "empty storage state. Authenticated specs will skip.",
    );
    writeState(EMPTY_STATE);
    return;
  }

  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();

  try {
    await page.goto("/auth/login");
    await page.fill("#identifier", E2E_EMAIL);
    await page.fill('input[type="password"]', E2E_PASSWORD);
    await page.click('button[type="submit"]');

    // Pattern match, NOT `${baseURL}/dashboard`.
    //
    // middleware.ts treats NODE_ENV === 'production' as "this is the live
    // site", which is true of any Vercel build including staging, so with
    // NEXT_PUBLIC_JOBS_URL unset it sends a job_seeker to
    // https://jobs.icareeros.com/dashboard after login. An exact base-URL
    // match therefore never fires on staging. That is #434 and it is not this
    // file's to fix; matching on the path tolerates it.
    //
    // The session cookie is set by the login response on the deployment we
    // posted to, so it is captured either way — the redirect target changes
    // where we land, not what we store.
    await page.waitForURL(/\/dashboard/, { timeout: 30_000 });

    const state = await context.storageState();

    if (state.cookies.length === 0) {
      throw new Error(
        "login appeared to succeed but no cookies were stored — the session " +
          "cookie may be scoped to a different host than the one under test",
      );
    }

    writeState(state);
    console.log(
      `[global-setup] signed in as ${E2E_EMAIL}; stored ${state.cookies.length} cookies`,
    );
  } catch (err) {
    // Fail the whole run rather than write an empty state and let 24 spec
    // files fail one by one with unrelated-looking assertion errors. A broken
    // shared login is a single fact and should be reported once, here, where
    // the cause is legible. Silent degradation is what let this suite go four
    // months without a green run.
    throw new Error(
      `[global-setup] could not sign in as the shared E2E account at ${baseURL}.\n` +
        `  ${err instanceof Error ? err.message : String(err)}\n` +
        "  Check, in order: E2E_TEST_EMAIL / E2E_TEST_PASSWORD are valid; the " +
        "deployment is up; the login form still exposes #identifier and a " +
        "password input; the post-login redirect still reaches a /dashboard path.",
    );
  } finally {
    await context.close();
    await browser.close();
  }
}
