/**
 * Tests for the refresh-token-not-found guard.
 *
 * See supabase-refresh-guard.ts header for full incident context
 * (2026-05-27 ~50-req/s storm from a stale token in localStorage).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { guardedFetch } from "../supabase-refresh-guard";

const realFetch = global.fetch;
let nativeFetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  nativeFetchSpy = vi.fn();
  global.fetch = nativeFetchSpy as unknown as typeof fetch;

  // Browser-like environment for the clearer.
  Object.defineProperty(globalThis, "localStorage", {
    value: createMemoryStorage(),
    writable: true,
    configurable: true,
  });
  Object.defineProperty(globalThis, "document", {
    value: { cookie: "" },
    writable: true,
    configurable: true,
  });
  Object.defineProperty(globalThis, "window", {
    value: { location: { hostname: "icareeros.com" } },
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  global.fetch = realFetch;
  // @ts-expect-error -- best-effort cleanup
  delete (globalThis as { localStorage?: unknown }).localStorage;
  // @ts-expect-error
  delete (globalThis as { document?: unknown }).document;
  // @ts-expect-error
  delete (globalThis as { window?: unknown }).window;
});

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() { return store.size; },
    key(i: number) { return Array.from(store.keys())[i] ?? null; },
    getItem(k: string) { return store.get(k) ?? null; },
    setItem(k: string, v: string) { store.set(k, v); },
    removeItem(k: string) { store.delete(k); },
    clear() { store.clear(); },
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("guardedFetch", () => {
  it("passes the response through unchanged when the upstream call succeeds (200)", async () => {
    nativeFetchSpy.mockResolvedValueOnce(jsonResponse(200, { access_token: "x" }));
    localStorage.setItem("sb-foo-auth-token", "PRESERVE_ME");

    const res = await guardedFetch("https://x/auth/v1/token?grant_type=refresh_token", {
      method: "POST",
      body: JSON.stringify({ refresh_token: "abc" }),
    });

    expect(res.status).toBe(200);
    expect(localStorage.getItem("sb-foo-auth-token")).toBe("PRESERVE_ME");
  });

  it("passes through 400s on NON-token endpoints (unrelated 400s don't clear session)", async () => {
    nativeFetchSpy.mockResolvedValueOnce(jsonResponse(400, { error_code: "refresh_token_not_found" }));
    localStorage.setItem("sb-foo-auth-token", "PRESERVE_ME");

    const res = await guardedFetch("https://x/auth/v1/user", { method: "GET" });

    expect(res.status).toBe(400);
    expect(localStorage.getItem("sb-foo-auth-token")).toBe("PRESERVE_ME");
  });

  it("passes through /token 400s with a DIFFERENT error_code (invalid_grant etc.)", async () => {
    nativeFetchSpy.mockResolvedValueOnce(jsonResponse(400, { error_code: "invalid_grant" }));
    localStorage.setItem("sb-foo-auth-token", "PRESERVE_ME");

    const res = await guardedFetch("https://x/auth/v1/token?grant_type=refresh_token", { method: "POST" });

    expect(res.status).toBe(400);
    expect(localStorage.getItem("sb-foo-auth-token")).toBe("PRESERVE_ME");
  });

  it("CLEARS localStorage sb-* entries when /token returns 400 refresh_token_not_found", async () => {
    nativeFetchSpy.mockResolvedValueOnce(jsonResponse(400, { error_code: "refresh_token_not_found" }));
    localStorage.setItem("sb-kuneabeiwcxavvyyfjkx-auth-token", "STALE");
    localStorage.setItem("sb-other-key", "ALSO_STALE");
    localStorage.setItem("Supabase.foo", "MATCH_BY_SUBSTRING");
    localStorage.setItem("unrelated-key", "KEEP_ME");

    await guardedFetch("https://x/auth/v1/token?grant_type=refresh_token", { method: "POST" });

    expect(localStorage.getItem("sb-kuneabeiwcxavvyyfjkx-auth-token")).toBeNull();
    expect(localStorage.getItem("sb-other-key")).toBeNull();
    expect(localStorage.getItem("Supabase.foo")).toBeNull();
    expect(localStorage.getItem("unrelated-key")).toBe("KEEP_ME");
  });

  it("CLEARS sb-* cookies (host + parent-domain scopes) on refresh_token_not_found", async () => {
    nativeFetchSpy.mockResolvedValueOnce(jsonResponse(400, { error_code: "refresh_token_not_found" }));
    // Pre-existing cookies (the SDK doesn't actually read document.cookie this way,
    // but our clearer writes Set-Cookie-style strings via document.cookie =, which
    // we capture in a real array for inspection).
    document.cookie = "sb-access-token=stale; path=/";
    document.cookie = "sb-refresh-token=stale; path=/";
    document.cookie = "unrelated=keepme; path=/";

    const writes: string[] = [];
    // Spy on subsequent writes
    Object.defineProperty(document, "cookie", {
      get() { return "sb-access-token=stale; sb-refresh-token=stale; unrelated=keepme"; },
      set(value: string) { writes.push(value); },
      configurable: true,
    });

    await guardedFetch("https://x/auth/v1/token?grant_type=refresh_token", { method: "POST" });

    // We expect the clearer to write expiry strings for each sb-* cookie at
    // path=/ AND domain=.icareeros.com (defence-in-depth).
    const sbWrites = writes.filter(w => w.startsWith("sb-"));
    expect(sbWrites.length).toBeGreaterThanOrEqual(2 * 2); // 2 cookies × (host + .icareeros.com)
    expect(sbWrites.every(w => /expires=Thu, 01 Jan 1970/.test(w))).toBe(true);
    // Host scope
    expect(sbWrites.some(w => w.includes("path=/;") || w.endsWith("path=/"))).toBe(true);
    // Parent-domain scope
    expect(sbWrites.some(w => w.includes("domain=.icareeros.com"))).toBe(true);
    // Unrelated cookies untouched
    expect(sbWrites.every(w => !w.startsWith("unrelated"))).toBe(true);
  });

  it("does not crash in SSR-like environments where localStorage/document are absent", async () => {
    // @ts-expect-error -- intentional SSR simulation
    delete (globalThis as { localStorage?: unknown }).localStorage;
    // @ts-expect-error
    delete (globalThis as { document?: unknown }).document;
    nativeFetchSpy.mockResolvedValueOnce(jsonResponse(400, { error_code: "refresh_token_not_found" }));

    const res = await guardedFetch("https://x/auth/v1/token?grant_type=refresh_token", { method: "POST" });

    expect(res.status).toBe(400);
    // No throw is the test.
  });

  it("does not throw or clear when the response body isn't JSON", async () => {
    nativeFetchSpy.mockResolvedValueOnce(new Response("<html>oops</html>", { status: 400 }));
    localStorage.setItem("sb-foo-auth-token", "PRESERVE_ME");

    const res = await guardedFetch("https://x/auth/v1/token?grant_type=refresh_token", { method: "POST" });

    expect(res.status).toBe(400);
    expect(localStorage.getItem("sb-foo-auth-token")).toBe("PRESERVE_ME");
  });
});
