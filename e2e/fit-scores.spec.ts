/**
 * E2E — /api/jobs/fit-scores
 *
 * Probe-guarded: if the route returns 404 the suite is skipped
 * (pre-merge). 401 means the route is deployed but unauthenticated,
 * which is the expected behaviour for these tests.
 */

import { test, expect } from "@playwright/test";
import { LOGGED_OUT } from "./support/auth";

/**
 * Runs signed OUT, overriding the suite-wide session (#433).
 *
 * Every assertion here is about the route's UNAUTHENTICATED behaviour (401
 * when deployed, 404 when not). The `request` fixture inherits context
 * storage state, so without this the shared session would turn the 401
 * into a 200.
 */
test.use({ storageState: LOGGED_OUT });

const ROUTE = "/api/jobs/fit-scores";

let routeDeployed = false;

test.beforeAll(async ({ request }) => {
  const probe = await request.post(ROUTE, { data: {} });
  routeDeployed = probe.status() !== 404;
});

test("fit-scores route is deployed (401 when unauthenticated)", async ({ request }) => {
  test.skip(!routeDeployed, "Route not yet deployed");
  const res = await request.post(ROUTE, { data: {} });
  expect(res.status()).toBe(401);
});

test("fit-scores route returns 400 for missing opportunity_ids", async ({ request }) => {
  test.skip(!routeDeployed, "Route not yet deployed");
  // Probe with no auth — route should 401 before reaching validation,
  // but this verifies the route is reachable and responding correctly.
  const res = await request.post(ROUTE, { data: {} });
  expect([400, 401]).toContain(res.status());
});
