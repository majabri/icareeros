/**
 * Browser-client cookie scope tests — fix/auth-subdomain-loop (2026-05-17).
 *
 * Locks in the host-based decision used by createClient() in
 * src/lib/supabase.ts:
 *   - icareeros.com hosts → cookieOptions.domain = ".icareeros.com"
 *   - any other host (localhost, *.vercel.app) → no cookieOptions
 *
 * Without this, the Supabase browser client falls back to per-host
 * cookies — so a sign-in on icareeros.com is invisible on
 * jobs.icareeros.com and the user gets bounced back to /auth/login
 * (the production loop this branch fixes).
 *
 * Vitest runs with `environment: "node"` so we mock globalThis.window
 * by hand. The Supabase factory `createBrowserClient` is also mocked
 * so we can inspect the cookieOptions argument it receives.
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

// ── Mock @supabase/ssr ────────────────────────────────────────────────────
const createBrowserClientMock = vi.fn();

vi.mock("@supabase/ssr", () => ({
  createBrowserClient: (...args: unknown[]) => {
    createBrowserClientMock(...args);
    return { __mock: true };
  },
}));

// Snapshot whatever the runtime gave us before each test starts mutating it.
const originalWindow = (globalThis as { window?: unknown }).window;

function setHostname(hostname: string): void {
  (globalThis as { window: unknown }).window = {
    location: { hostname },
  };
}

function clearWindow(): void {
  delete (globalThis as { window?: unknown }).window;
}

beforeEach(() => {
  createBrowserClientMock.mockClear();
  // Each test imports a fresh copy of the module so the top-level
  // `export const supabase = createClient()` re-evaluates with the
  // hostname this test cares about.
  vi.resetModules();
});

afterEach(() => {
  if (originalWindow === undefined) clearWindow();
  else (globalThis as { window: unknown }).window = originalWindow;
});

function optionsFromLastCall(): unknown {
  const calls = createBrowserClientMock.mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  return calls[calls.length - 1][2];
}

describe("createClient (browser) — cookie domain scope", () => {
  it("passes cookieOptions.domain='.icareeros.com' when hostname is icareeros.com", async () => {
    setHostname("icareeros.com");
    const { createClient } = await import("../supabase");
    createClient();
    expect(optionsFromLastCall()).toMatchObject({
      cookieOptions: { domain: ".icareeros.com" },
    });
  });

  it("applies the parent-domain cookie on jobs.icareeros.com", async () => {
    setHostname("jobs.icareeros.com");
    const { createClient } = await import("../supabase");
    createClient();
    expect(optionsFromLastCall()).toMatchObject({
      cookieOptions: { domain: ".icareeros.com" },
    });
  });

  it("applies the parent-domain cookie on hire.icareeros.com", async () => {
    setHostname("hire.icareeros.com");
    const { createClient } = await import("../supabase");
    createClient();
    expect(optionsFromLastCall()).toMatchObject({
      cookieOptions: { domain: ".icareeros.com" },
    });
  });

  it("does NOT pass cookieOptions on localhost — per-host scope is correct in dev", async () => {
    setHostname("localhost");
    const { createClient } = await import("../supabase");
    createClient();
    const opts = optionsFromLastCall() as { cookieOptions?: unknown };
    expect(opts?.cookieOptions).toBeUndefined();
  });

  it("does NOT pass cookieOptions on a *.vercel.app preview deploy", async () => {
    setHostname("icareeros-git-feat-x-jabri-solutions.vercel.app");
    const { createClient } = await import("../supabase");
    createClient();
    const opts = optionsFromLastCall() as { cookieOptions?: unknown };
    expect(opts?.cookieOptions).toBeUndefined();
  });

  it("returns undefined from resolveBrowserCookieDomain during SSR (no window)", async () => {
    clearWindow();
    const { resolveBrowserCookieDomain } = await import("../supabase");
    expect(resolveBrowserCookieDomain()).toBeUndefined();
  });
});

describe("createClient (browser) — cross-tab refresh lock", () => {
  it("passes auth.lock (navigatorLock) on every host so concurrent tabs serialise refresh", async () => {
    // Test all three production hosts + localhost — the lock is hostname-independent.
    for (const host of ["icareeros.com", "jobs.icareeros.com", "hire.icareeros.com", "localhost"]) {
      vi.resetModules();
      createBrowserClientMock.mockClear();
      setHostname(host);
      const { createClient } = await import("../supabase");
      createClient();
      const opts = optionsFromLastCall() as { auth?: { lock?: unknown } };
      expect(opts?.auth?.lock, `host=${host}`).toBeTypeOf("function");
    }
  });
});
