/**
 * Tests for the cross-tab refresh-token race lock.
 *
 * See supabase-browser-lock.ts header for the production incident
 * that motivated this fix (2026-05-24 lockout).
 */

import { describe, expect, it, vi, afterEach } from "vitest";
import { navigatorLock } from "../supabase-browser-lock";

describe("navigatorLock", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    // Reset whatever we may have stubbed onto globalThis.navigator
    // @ts-expect-error — best-effort cleanup
    delete (globalThis as { navigator?: unknown }).navigator;
  });

  it("falls back to running fn directly when navigator.locks is unavailable", async () => {
    // No navigator on globalThis → fallback path
    const fn = vi.fn(async () => 42);
    const result = await navigatorLock("test-lock", 1000, fn);
    expect(result).toBe(42);
    expect(fn).toHaveBeenCalledOnce();
  });

  it("uses navigator.locks.request when available", async () => {
    const requestMock = vi.fn(async (
      _name: string,
      _opts: { mode?: string; signal?: AbortSignal },
      callback: () => Promise<unknown>,
    ) => {
      return await callback();
    });
    Object.defineProperty(globalThis, "navigator", {
      value: { locks: { request: requestMock } },
      writable: true,
      configurable: true,
    });

    const result = await navigatorLock("test-lock", 1000, async () => "ok");
    expect(result).toBe("ok");
    expect(requestMock).toHaveBeenCalledOnce();
    expect(requestMock.mock.calls[0][0]).toBe("test-lock");
    expect(requestMock.mock.calls[0][1]).toMatchObject({ mode: "exclusive" });
  });

  it("serialises concurrent callers — first finishes before second begins", async () => {
    // Simulate a real Web-Locks queue: requests for the same name run
    // serially. Run two navigatorLock calls in parallel and record their
    // interleaving — the second must not start until the first finishes.
    const queue: Array<() => Promise<unknown>> = [];
    let running = false;
    const requestMock = vi.fn(async (
      _name: string,
      _opts: { mode?: string; signal?: AbortSignal },
      callback: () => Promise<unknown>,
    ) => {
      if (running) {
        // Defer until the in-flight callback resolves
        await new Promise<void>((resolve) => queue.push(async () => { resolve(); }));
      }
      running = true;
      try {
        return await callback();
      } finally {
        running = false;
        const next = queue.shift();
        if (next) await next();
      }
    });
    Object.defineProperty(globalThis, "navigator", {
      value: { locks: { request: requestMock } },
      writable: true,
      configurable: true,
    });

    const order: string[] = [];
    const a = navigatorLock("shared", 1000, async () => {
      order.push("a-start");
      await new Promise((r) => setTimeout(r, 10));
      order.push("a-end");
      return "a";
    });
    const b = navigatorLock("shared", 1000, async () => {
      order.push("b-start");
      order.push("b-end");
      return "b";
    });

    const [ra, rb] = await Promise.all([a, b]);
    expect(ra).toBe("a");
    expect(rb).toBe("b");
    expect(order).toEqual(["a-start", "a-end", "b-start", "b-end"]);
  });

  it("aborts via AbortController after acquireTimeout when supplied", async () => {
    const requestMock = vi.fn(async (
      _name: string,
      opts: { mode?: string; signal?: AbortSignal },
      callback: () => Promise<unknown>,
    ) => {
      // Wait forever until aborted, then throw an AbortError
      return await new Promise((resolve, reject) => {
        opts.signal?.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        });
        // Never call callback — we're simulating contention
        void callback;
        void resolve;
      });
    });
    Object.defineProperty(globalThis, "navigator", {
      value: { locks: { request: requestMock } },
      writable: true,
      configurable: true,
    });

    await expect(
      navigatorLock("contended", 25, async () => "should-not-reach"),
    ).rejects.toThrowError(/abort/i);
  });
});
