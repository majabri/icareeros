/**
 * /settings tree for hire.icareeros.com — unit tests.
 *
 * Test infra constraint: the repo's vitest config uses environment: "node"
 * (not jsdom) and does not include @testing-library/react. Existing .tsx
 * tests follow the "test imported constants and mocked logic" pattern,
 * not React component rendering. The CP2 report flags this gap; the
 * authenticated render + save flow is verified via the 5 smoke tests on
 * the Vercel preview rather than unit tests here.
 *
 * What these tests do cover:
 *   - The /settings index redirect targets the clean /settings/account URL
 *     (verifying CP1 decision #1 about the redirect target — middleware
 *     rewrites it back into (hire) without an extra 308 hop).
 *   - Both page modules import and resolve without compile-time errors.
 */

import { describe, it, expect, vi, afterEach } from "vitest";

// Mock next/navigation BEFORE importing the redirect page. The real
// `redirect()` throws a NEXT_REDIRECT error; we replace it with a spy so
// we can assert the target string without unwinding through that throw.
const redirectSpy = vi.fn((url: string) => {
  // Throw like the real implementation so any caller that depends on the
  // throw control-flow still behaves correctly.
  const err = new Error(`NEXT_REDIRECT: ${url}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (err as any).digest = `NEXT_REDIRECT;replace;${url};308`;
  throw err;
});

vi.mock("next/navigation", () => ({
  redirect: redirectSpy,
}));

// Mock @/lib/supabase so the account page module can be imported in a
// node environment without trying to read public env vars.
vi.mock("@/lib/supabase", () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: vi.fn() },
    from: vi.fn(),
    storage: { from: vi.fn() },
  })),
}));

afterEach(() => {
  redirectSpy.mockClear();
});

describe("hire /settings redirect", () => {
  it("default export is a function", async () => {
    const mod = await import("../page");
    expect(typeof mod.default).toBe("function");
  });

  it("redirects to /settings/account (clean URL, not /hire/settings/account)", async () => {
    const mod = await import("../page");
    // The default export calls `redirect()` which our mock throws from —
    // catch it and assert via the spy.
    expect(() => mod.default()).toThrow(/NEXT_REDIRECT/);
    expect(redirectSpy).toHaveBeenCalledTimes(1);
    expect(redirectSpy).toHaveBeenCalledWith("/settings/account");
  });

  it("does NOT redirect to /hire/settings/account (would cause double 308)", async () => {
    const mod = await import("../page");
    try {
      mod.default();
    } catch {
      /* expected */
    }
    expect(redirectSpy).not.toHaveBeenCalledWith("/hire/settings/account");
    expect(redirectSpy).not.toHaveBeenCalledWith("/auth/login");
  });
});

describe("hire /settings/account module", () => {
  it("compiles and exports a default function (component)", async () => {
    const mod = await import("../account/page");
    expect(typeof mod.default).toBe("function");
    // React functional components in TS have name === filename's default
    // export. The named function inside this file is HireAccountPage.
    expect(mod.default.name).toBe("HireAccountPage");
  });
});
