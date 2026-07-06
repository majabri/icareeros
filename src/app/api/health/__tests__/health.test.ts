/**
 * Tests for GET /api/health
 *
 * The route uses the edge runtime, so we test it as a plain function
 * rather than spinning up a full Next.js server.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Stub NextResponse before importing the route
vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) => ({ body, init }),
  },
}));

function makeReq(url: string): unknown {
  // Minimal stub — the route only reads `.url` off the request
  return { url } as unknown;
}

describe("GET /api/health (shallow)", () => {
  beforeEach(() => vi.resetModules());

  it("returns status ok", async () => {
    const { GET } = await import("../route");
    const response = await GET(makeReq("https://icareeros.com/api/health") as never);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (response as any).body;

    expect(body.status).toBe("ok");
    expect(body.service).toBe("icareeros");
    expect(body.timestamp).toBeDefined();
    expect(typeof body.timestamp).toBe("string");
  });

  it("returns ISO 8601 timestamp", async () => {
    const { GET } = await import("../route");
    const response = await GET(makeReq("https://icareeros.com/api/health") as never);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { timestamp } = (response as any).body;
    expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it("returns 200 status code", async () => {
    const { GET } = await import("../route");
    const response = await GET(makeReq("https://icareeros.com/api/health") as never);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { init } = response as any;
    expect(init?.status).toBe(200);
  });

  it("includes Cache-Control header", async () => {
    const { GET } = await import("../route");
    const response = await GET(makeReq("https://icareeros.com/api/health") as never);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const headers = (response as any).init?.headers as Record<string, string>;
    expect(headers?.["Cache-Control"]).toContain("max-age=10");
  });

  it("does NOT run the Supabase probe in shallow mode", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { GET } = await import("../route");
    await GET(makeReq("https://icareeros.com/api/health") as never);
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe("GET /api/health?deep=1 (deep — real Supabase probe)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("returns 200 + observability.supabase=true when the probe succeeds", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchSpy);

    const { GET } = await import("../route");
    const response = await GET(makeReq("https://icareeros.com/api/health?deep=1") as never);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { body, init } = response as any;

    expect(init?.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.observability.supabase).toBe(true);
    expect(body.probes.supabase.ok).toBe(true);
    expect(body.probes.supabase.status).toBe(200);
    expect(typeof body.probes.supabase.duration_ms).toBe("number");
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://project.supabase.co/auth/v1/settings",
      expect.objectContaining({ method: "GET", cache: "no-store" }),
    );
  });

  it("returns 503 + observability.supabase=false when the probe returns 5xx", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response("upstream error", { status: 503 }),
    );
    vi.stubGlobal("fetch", fetchSpy);

    const { GET } = await import("../route");
    const response = await GET(makeReq("https://icareeros.com/api/health?deep=1") as never);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { body, init } = response as any;

    expect(init?.status).toBe(503);
    expect(body.status).toBe("degraded");
    expect(body.observability.supabase).toBe(false);
    expect(body.probes.supabase.ok).toBe(false);
    expect(body.probes.supabase.status).toBe(503);
  });

  it("returns 503 + probes.supabase.error='timeout' when the probe hangs", async () => {
    const fetchSpy = vi.fn().mockImplementation((_url, opts?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        opts?.signal?.addEventListener("abort", () => {
          const e = new Error("aborted");
          e.name = "AbortError";
          reject(e);
        });
      });
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { GET } = await import("../route");
    const response = await GET(makeReq("https://icareeros.com/api/health?deep=1") as never);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { body, init } = response as any;

    expect(init?.status).toBe(503);
    expect(body.observability.supabase).toBe(false);
    expect(body.probes.supabase.ok).toBe(false);
    expect(body.probes.supabase.error).toBe("timeout");
  }, 10_000);

  it("returns 503 + explicit error when NEXT_PUBLIC_SUPABASE_URL is missing", async () => {
    vi.unstubAllEnvs();  // wipe the stubbed URL
    const { GET } = await import("../route");
    const response = await GET(makeReq("https://icareeros.com/api/health?deep=1") as never);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { body, init } = response as any;

    expect(init?.status).toBe(503);
    expect(body.observability.supabase).toBe(false);
    expect(body.probes.supabase.ok).toBe(false);
    expect(body.probes.supabase.error).toBe("NEXT_PUBLIC_SUPABASE_URL_missing");
  });
});
