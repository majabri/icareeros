/**
 * Tests for GET /api/health
 *
 * The route uses the edge runtime, so we test it as a plain function
 * rather than spinning up a full Next.js server.
 */
import { describe, it, expect, vi } from "vitest";

// Stub NextResponse before importing the route
vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) => ({ body, init }),
  },
}));

describe("GET /api/health", () => {
  it("returns status ok", async () => {
    const { GET } = await import("../route");
    const response = await GET();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (response as any).body;

    expect(body.status).toBe("ok");
    expect(body.service).toBe("icareeros");
    expect(body.timestamp).toBeDefined();
    expect(typeof body.timestamp).toBe("string");
  });

  it("returns ISO 8601 timestamp", async () => {
    vi.resetModules();
    const { GET } = await import("../route");
    const response = await GET();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { timestamp } = (response as any).body;

    // ISO 8601: "2026-04-29T12:34:56.789Z"
    expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it("returns 200 status code", async () => {
    vi.resetModules();
    const { GET } = await import("../route");
    const response = await GET();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { init } = response as any;

    expect(init?.status).toBe(200);
  });

  it("includes Cache-Control header", async () => {
    vi.resetModules();
    const { GET } = await import("../route");
    const response = await GET();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const headers = (response as any).init?.headers as Record<string, string>;

    expect(headers?.["Cache-Control"]).toContain("max-age=10");
  });
});
