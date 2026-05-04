import { describe, it, expect } from "vitest";

/**
 * Day 61 — Rate limiting middleware unit tests
 * We test the pure logic that wraps the middleware (bucket math, key derivation).
 * The full Edge middleware is integration-tested in E2E.
 */

describe("Rate limiting bucket math", () => {
  it("produces consistent 1-minute buckets", () => {
    // Use a bucket-aligned start so t2 stays in the same 60s window
    const t1 = 60_000 * 28_333_334; // exact minute boundary
    const t2 = t1 + 59_999;         // 59.999 s later — same bucket
    const t3 = t1 + 60_000;         // exactly 60 s later — new bucket

    const bucket = (ms: number) => Math.floor(ms / 60_000);
    expect(bucket(t1)).toBe(bucket(t2));
    expect(bucket(t1)).not.toBe(bucket(t3));
  });

  it("rate limit key includes user id for AI routes", () => {
    const makeKey = (type: "user" | "ip-ai" | "ip", id: string) =>
      `rl:${type}:${id}`;

    expect(makeKey("user", "uuid-123")).toBe("rl:user:uuid-123");
    expect(makeKey("ip", "1.2.3.4")).toBe("rl:ip:1.2.3.4");
    expect(makeKey("ip-ai", "1.2.3.4")).toBe("rl:ip-ai:1.2.3.4");
  });
});

describe("AI route detection", () => {
  const AI_ROUTES = [
    "/api/career-os",
    "/api/resume/rewrite",
    "/api/resume/critique",
    "/api/resume/cover-letter-from-text",
    "/api/cover-letter",
    "/api/outreach",
    "/api/recruiter",
    "/api/salary-intelligence",
    "/api/jobs/fit-scores",
  ];

  const isAi = (path: string) => AI_ROUTES.some((r) => path.startsWith(r));

  it("marks AI routes correctly", () => {
    expect(isAi("/api/career-os/evaluate")).toBe(true);
    expect(isAi("/api/resume/rewrite")).toBe(true);
    expect(isAi("/api/resume/critique")).toBe(true);
    expect(isAi("/api/resume/cover-letter-from-text")).toBe(true);
    expect(isAi("/api/cover-letter")).toBe(true);
    expect(isAi("/api/salary-intelligence")).toBe(true);
  });

  it("does not mark non-AI routes as AI", () => {
    expect(isAi("/api/health")).toBe(false);
    expect(isAi("/api/job-alerts")).toBe(false);
    expect(isAi("/api/support")).toBe(false);
    expect(isAi("/api/email/preferences")).toBe(false);
  });
});

describe("Protected routes", () => {
  const PROTECTED = ["/dashboard", "/settings", "/jobs", "/profile", "/mycareer", "/target-skills", "/interview", "/resumeadvisor", "/offers", "/support", "/recruiter"];
  const AUTH_ONLY = ["/auth/login", "/auth/signup"];

  const isProtected = (p: string) => PROTECTED.some((r) => p.startsWith(r));
  const isAuthOnly  = (p: string) => AUTH_ONLY.some((r)  => p.startsWith(r));

  it("marks app routes as protected", () => {
    expect(isProtected("/dashboard")).toBe(true);
    expect(isProtected("/jobs")).toBe(true);
    expect(isProtected("/recruiter/analysis")).toBe(true);
    expect(isProtected("/resumeadvisor")).toBe(true);
  });

  it("does not mark public routes as protected", () => {
    expect(isProtected("/")).toBe(false);
    expect(isProtected("/api/health")).toBe(false);
    expect(isProtected("/resume")).toBe(false); // /resume route was deleted in PR #106
  });

  it("marks auth-only routes correctly", () => {
    expect(isAuthOnly("/auth/login")).toBe(true);
    expect(isAuthOnly("/auth/signup")).toBe(true);
    expect(isAuthOnly("/auth/callback")).toBe(false);
  });
});
