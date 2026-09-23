/**
 * Shared authentication state for the E2E suite.
 *
 * WHY THIS EXISTS
 *   24 of the 32 spec files signed in through the UI as the single shared
 *   E2E_TEST_EMAIL account. With no globalSetup and no storageState, that
 *   login — navigate, fill, submit, wait for redirect — was paid once per
 *   spec file per project. Across 2 browser projects that is ~48 full login
 *   flows per run, none of which assert anything. See #433.
 *
 *   global-setup.ts now performs the login ONCE and writes the resulting
 *   cookies here; playwright.config.ts points `use.storageState` at the same
 *   file, so every test starts already signed in.
 *
 * THE OPT-OUT MATTERS AS MUCH AS THE DEFAULT
 *   Making "signed in" the default breaks any test whose subject is being
 *   signed OUT. There are two kinds in this suite and both are easy to miss:
 *
 *     1. Page-level redirect assertions — `goto('/settings/account')` then
 *        `expect(page).toHaveURL(/\/auth\/login/)`.
 *
 *     2. API 401 assertions — 22 of them across 17 files. This is the
 *        non-obvious one: Playwright's `request` fixture inherits the
 *        context's storageState, so an unmarked `expect(res.status())
 *        .toBe(401)` would receive the authenticated 200 instead.
 *
 *   Both opt out the same way — wrap the block and apply LOGGED_OUT:
 *
 *     test.describe("unauthenticated", () => {
 *       test.use({ storageState: LOGGED_OUT });
 *       test("... returns 401", async ({ request }) => { ... });
 *     });
 *
 *   A missed opt-out fails loudly (200 where 401 was asserted, or a page that
 *   never redirects) rather than passing for the wrong reason, which is the
 *   main reason this is an opt-OUT default rather than an opt-in fixture.
 */

import path from "node:path";

/**
 * Where global-setup.ts writes the signed-in browser state.
 *
 * Inside .playwright/ because .gitignore already excludes that directory —
 * this file holds a live session cookie for the test account and must never
 * be committed.
 */
export const STORAGE_STATE = path.join(
  process.cwd(),
  ".playwright",
  "e2e-auth-state.json",
);

/**
 * An explicitly empty browser state, for tests that must run signed out.
 *
 * Playwright treats `storageState: undefined` as "inherit", not "clear", so
 * overriding with undefined would silently keep the signed-in session. This
 * empty literal is the only thing that actually produces a logged-out context.
 */
export const LOGGED_OUT: { cookies: never[]; origins: never[] } = {
  cookies: [],
  origins: [],
};

export const E2E_EMAIL = process.env.E2E_TEST_EMAIL ?? "";
export const E2E_PASSWORD = process.env.E2E_TEST_PASSWORD ?? "";
export const HAS_CREDS = Boolean(E2E_EMAIL && E2E_PASSWORD);

/**
 * A request context with no session at all.
 *
 * Several specs decide "is this route deployed?" by probing it
 * UNAUTHENTICATED and treating 401 as "yes, it exists and wants auth" versus
 * 404 as "not deployed". Those probes run in `beforeAll`, where the `request`
 * fixture now carries the shared session — an authenticated probe answers 200,
 * the probe concludes the route is missing, and every test in the file skips.
 * That is a silent full-file skip, the worst possible failure mode, so those
 * probes take an explicitly anonymous context instead.
 *
 * Callers own the returned context and must `dispose()` it.
 */
export async function anonymousRequest(baseURL: string) {
  const { request } = await import("@playwright/test");
  return request.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
}
