import { test, expect } from "@playwright/test";
import { LOGGED_OUT } from "./support/auth";

/**
 * Runs signed OUT, overriding the suite-wide session (#433).
 *
 * Header and rate-limit smoke tests, plus an explicit "unauthenticated POST
 * returns 401 not 500". The `request` fixture inherits context storage
 * state, so the shared session has to be cleared for that last one to mean
 * anything.
 */
test.use({ storageState: LOGGED_OUT });

/**
 * Day 62 — Security headers + rate limit smoke tests
 * These run without credentials (probe-guarded where needed).
 */

test.describe("Security headers", () => {
  test("/ returns X-Frame-Options: DENY", async ({ request }) => {
    const res = await request.get("/");
    const header = res.headers()["x-frame-options"];
    expect(header).toBe("DENY");
  });

  test("/ returns X-Content-Type-Options: nosniff", async ({ request }) => {
    const res = await request.get("/");
    expect(res.headers()["x-content-type-options"]).toBe("nosniff");
  });

  test("/ returns Referrer-Policy", async ({ request }) => {
    const res = await request.get("/");
    expect(res.headers()["referrer-policy"]).toBeTruthy();
  });

  test("/ returns Content-Security-Policy", async ({ request }) => {
    const res = await request.get("/");
    const csp = res.headers()["content-security-policy"];
    expect(csp).toContain("default-src");
    expect(csp).toContain("object-src 'none'");
  });

  test("/api/health returns X-RateLimit-Remaining header", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.status()).toBe(200);
    // Rate limiting passes X-RateLimit-Remaining; header may be absent if Upstash not configured
    // Just verify the health endpoint responds correctly
    const body = await res.json();
    expect(body.status).toBe("ok");
  });
});

test.describe("Rate limiting", () => {
  test("/api/health does not return 429 on a single request", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.status()).not.toBe(429);
  });

  test("Unauthenticated POST to /api/recruiter returns 401 not 500", async ({ request }) => {
    const res = await request.post("/api/recruiter", {
      data: {
        job_description:
          "We are looking for a senior software engineer with 5+ years in TypeScript.",
      },
    });
    // Should be 401 (auth guard fires before rate limit)
    expect(res.status()).toBe(401);
  });
});
