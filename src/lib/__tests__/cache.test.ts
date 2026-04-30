import { describe, it, expect, beforeEach, vi } from "vitest";

// Ensure we use the in-memory path (no Redis env vars)
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

import { cache } from "../cache";

beforeEach(() => {
  vi.useFakeTimers();
});

describe("in-memory cache", () => {
  it("returns null for missing key", async () => {
    expect(await cache.get("nonexistent-key-xyz")).toBeNull();
  });

  it("stores and retrieves a value", async () => {
    await cache.set("test-key", { foo: "bar" }, 60);
    const result = await cache.get<{ foo: string }>("test-key");
    expect(result).toEqual({ foo: "bar" });
  });

  it("returns null after TTL expires", async () => {
    await cache.set("ttl-key", 42, 10); // 10 seconds TTL
    vi.advanceTimersByTime(11_000);
    expect(await cache.get("ttl-key")).toBeNull();
  });

  it("returns value before TTL expires", async () => {
    await cache.set("ttl-key2", 99, 10);
    vi.advanceTimersByTime(5_000);
    expect(await cache.get("ttl-key2")).toBe(99);
  });

  it("del removes a key", async () => {
    await cache.set("del-key", "value", 60);
    await cache.del("del-key");
    expect(await cache.get("del-key")).toBeNull();
  });

  it("cache.key produces stable keys from same inputs", () => {
    const k1 = cache.key("salary", ["a", "b"]);
    const k2 = cache.key("salary", ["a", "b"]);
    expect(k1).toBe(k2);
  });

  it("cache.key produces different keys for different inputs", () => {
    expect(cache.key("salary", ["a"])).not.toBe(cache.key("salary", ["b"]));
    expect(cache.key("salary", [])).not.toBe(cache.key("fit", []));
  });

  it("overwrites existing key with new value", async () => {
    await cache.set("overwrite-key", "first", 60);
    await cache.set("overwrite-key", "second", 60);
    expect(await cache.get("overwrite-key")).toBe("second");
  });
});
