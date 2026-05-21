/**
 * /settings tree for hire.icareeros.com — unit tests.
 *
 * Test infra constraint: the repo's vitest config uses environment: "node"
 * (not jsdom) and does not include @testing-library/react. Existing .tsx
 * tests follow the "test imported constants and mocked logic" pattern,
 * not React component rendering. The CP2 report flags this gap; the
 * authenticated render + save flow is verified via the smoke tests on
 * the Vercel preview rather than unit tests here.
 *
 * What these tests do cover:
 *   - The /settings index redirect targets the clean /settings/account URL
 *     (verifying CP1 decision #1 about the redirect target — middleware
 *     rewrites it back into (hire) without an extra 308 hop).
 *   - Both page modules import and resolve without compile-time errors.
 *
 * Note on vi.hoisted(): vi.mock factories are hoisted to the top of the
 * file by vitest's transformer. Anything they close over from the module
 * scope (e.g. `const` declarations) is `undefined` when the factory runs,
 * which silently makes the mocked exports `undefined` and breaks tests
 * at runtime instead of at compile time. vi.hoisted() places the shared
 * spies and stubs in the same hoisted timeline so the mock factory sees
 * the real values. Same pattern as /api/admin/roles route tests
 * (Sprint 4 W3-G).
 */

import { describe, it, expect, vi, afterEach } from "vitest";

const { redirectSpy, supabaseClientStub } = vi.hoisted(() => {
  // Mimics the real next/navigation `redirect()` behaviour: throws an
  // error tagged with a NEXT_REDIRECT digest. Lets us assert on the URL
  // without unwinding through the throw.
  const redirectSpy = vi.fn((url: string) => {
    const err = new Error(`NEXT_REDIRECT: ${url}`);
    (err as { digest?: string }).digest = `NEXT_REDIRECT;replace;${url};308`;
    throw err;
  });
  // Minimal Supabase stub so the account/page client component can be
  // imported in a node environment without reading public env vars.
  const supabaseClientStub = {
    auth: { getUser: vi.fn() },
    from: vi.fn(),
    storage: { from: vi.fn() },
  };
  return { redirectSpy, supabaseClientStub };
});

vi.mock("next/navigation", () => ({
  redirect: redirectSpy,
}));

vi.mock("@/lib/supabase", () => ({
  createClient: vi.fn(() => supabaseClientStub),
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
    // The default export calls `redirect()` which our hoisted mock throws
    // from — catch via toThrow and assert via the spy.
    expect(() => mod.default()).toThrow(/NEXT_REDIRECT/);
    expect(redirectSpy).toHaveBeenCalledTimes(1);
    expect(redirectSpy).toHaveBeenCalledWith("/settings/account");
  });

  it("does NOT redirect to /hire/settings/account (would cause double 308)", async () => {
    const mod = await import("../page");
    try {
      mod.default();
    } catch {
      /* expected — the spy throws like the real redirect() */
    }
    expect(redirectSpy).not.toHaveBeenCalledWith("/hire/settings/account");
    expect(redirectSpy).not.toHaveBeenCalledWith("/auth/login");
  });
});

describe("hire /settings/account module", () => {
  it("compiles and exports a default function (component)", async () => {
    const mod = await import("../account/page");
    // We don't render in node env — just confirm the module loads and
    // exports something callable. Component name check is intentionally
    // omitted because SWC/Vite may rename function exports during the
    // transform.
    expect(typeof mod.default).toBe("function");
  });
});
