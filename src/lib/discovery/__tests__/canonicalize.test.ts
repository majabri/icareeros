import { describe, it, expect } from "vitest";
import { canonicalizeUrl, hashUrl } from "../canonicalize";

describe("canonicalizeUrl", () => {
  it("strips utm + fbclid + gclid", () => {
    const c = canonicalizeUrl("https://example.com/jobs/123?utm_source=foo&utm_medium=bar&id=42&gclid=baz");
    expect(c).toBe("https://example.com/jobs/123?id=42");
  });

  it("removes www and lowercases host", () => {
    expect(canonicalizeUrl("https://WWW.Example.COM/X")).toBe("https://example.com/X");
  });

  it("strips trailing slash unless path is /", () => {
    expect(canonicalizeUrl("https://example.com/path/")).toBe("https://example.com/path");
    expect(canonicalizeUrl("https://example.com/")).toBe("https://example.com/");
  });

  it("sorts surviving query params", () => {
    expect(canonicalizeUrl("https://example.com/?b=2&a=1")).toBe("https://example.com?a=1&b=2");
  });

  it("hashUrl gives identical hash for equivalent URLs", () => {
    const a = hashUrl("https://example.com/jobs/123?utm_source=foo");
    const b = hashUrl("https://example.com/jobs/123");
    expect(a).toBe(b);
  });

  it("hashUrl gives different hash for different paths", () => {
    expect(hashUrl("https://example.com/a")).not.toBe(hashUrl("https://example.com/b"));
  });

  it("falls back gracefully on invalid URL", () => {
    expect(canonicalizeUrl("not-a-url")).toBe("not-a-url");
  });
});
