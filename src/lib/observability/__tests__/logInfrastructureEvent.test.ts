/**
 * Tests for the BetterStack drain added to logInfrastructureEvent
 * (2026-05-26). Postgres path is mocked at the supabase-js client level;
 * BetterStack path is verified through a mocked global fetch.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const insertSelectSingleMock = vi.fn();
const fromMock = vi.fn(() => ({
  insert: () => ({
    select: () => ({
      single: () => insertSelectSingleMock(),
    }),
  }),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ from: fromMock }),
}));

import { logInfrastructureEvent } from "../logInfrastructureEvent";

const realFetch = global.fetch;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
  insertSelectSingleMock.mockResolvedValue({ data: { id: "evt-1" }, error: null });
});

afterEach(() => {
  global.fetch = realFetch;
  delete process.env.BETTERSTACK_INGEST_TOKEN;
  delete process.env.BETTERSTACK_INGEST_HOST;
});

describe("logInfrastructureEvent — BetterStack drain", () => {
  it("does NOT call fetch when BetterStack env vars are unset", async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;

    const result = await logInfrastructureEvent({
      source:     "smtp-cron",
      event_type: "smtp.ok",
      severity:   "info",
    });

    expect(result).toEqual({ ok: true, id: "evt-1" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("POSTs to BetterStack when env vars are set", async () => {
    process.env.BETTERSTACK_INGEST_TOKEN = "test-token";
    process.env.BETTERSTACK_INGEST_HOST  = "s12345.eu-fsn-3.betterstackdata.com";

    const fetchSpy = vi.fn().mockResolvedValue(new Response("", { status: 202 }));
    global.fetch = fetchSpy as unknown as typeof fetch;

    const result = await logInfrastructureEvent({
      source:     "health-cron",
      event_type: "auth.audit_log_silent",
      severity:   "critical",
      payload:    { recent_2h: 0, lifetime_7d: 4096 },
    });

    expect(result).toEqual({ ok: true, id: "evt-1" });
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [calledUrl, calledInit] = fetchSpy.mock.calls[0];
    expect(calledUrl).toBe("https://s12345.eu-fsn-3.betterstackdata.com");
    const headers = (calledInit as RequestInit).headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer test-token");
    expect(headers["Content-Type"]).toBe("application/json");
    const body = JSON.parse((calledInit as RequestInit).body as string);
    expect(body.source).toBe("health-cron");
    expect(body.event_type).toBe("auth.audit_log_silent");
    expect(body.severity).toBe("critical");
    expect(body.level).toBe("error");  // critical → error in BetterStack levels
    expect(body.payload).toEqual({ recent_2h: 0, lifetime_7d: 4096 });
    expect(body.dt).toMatch(/^\d{4}-\d{2}-\d{2}T/);  // ISO timestamp
  });

  it("maps severities to BetterStack levels correctly", async () => {
    process.env.BETTERSTACK_INGEST_TOKEN = "t";
    process.env.BETTERSTACK_INGEST_HOST  = "host.invalid";

    const fetchSpy = vi.fn().mockResolvedValue(new Response("", { status: 202 }));
    global.fetch = fetchSpy as unknown as typeof fetch;

    const cases: Array<{ severity: "info" | "warning" | "error" | "critical"; expectedLevel: string }> = [
      { severity: "info",     expectedLevel: "info" },
      { severity: "warning",  expectedLevel: "warn" },
      { severity: "error",    expectedLevel: "error" },
      { severity: "critical", expectedLevel: "error" },
    ];

    for (const { severity, expectedLevel } of cases) {
      fetchSpy.mockClear();
      await logInfrastructureEvent({ source: "test", event_type: "t", severity });
      expect(fetchSpy).toHaveBeenCalledOnce();
      const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
      expect(body.level, `for severity=${severity}`).toBe(expectedLevel);
    }
  });

  it("Postgres result is NOT affected by BetterStack fetch rejection", async () => {
    process.env.BETTERSTACK_INGEST_TOKEN = "t";
    process.env.BETTERSTACK_INGEST_HOST  = "host.invalid";

    const fetchSpy = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    global.fetch = fetchSpy as unknown as typeof fetch;

    const result = await logInfrastructureEvent({
      source:     "smtp-cron",
      event_type: "smtp.send_failed",
      severity:   "critical",
    });

    expect(result).toEqual({ ok: true, id: "evt-1" });
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it("Postgres result is NOT affected by BetterStack returning 4xx/5xx", async () => {
    process.env.BETTERSTACK_INGEST_TOKEN = "t";
    process.env.BETTERSTACK_INGEST_HOST  = "host.invalid";

    const fetchSpy = vi.fn().mockResolvedValue(new Response("forbidden", { status: 403 }));
    global.fetch = fetchSpy as unknown as typeof fetch;

    const result = await logInfrastructureEvent({
      source:     "test",
      event_type: "test",
      severity:   "info",
    });

    expect(result.ok).toBe(true);
  });

  it("prepends https:// if host is supplied without a scheme", async () => {
    process.env.BETTERSTACK_INGEST_TOKEN = "t";
    process.env.BETTERSTACK_INGEST_HOST  = "s12345.eu-fsn-3.betterstackdata.com";

    const fetchSpy = vi.fn().mockResolvedValue(new Response("", { status: 202 }));
    global.fetch = fetchSpy as unknown as typeof fetch;

    await logInfrastructureEvent({ source: "x", event_type: "y", severity: "info" });
    expect(fetchSpy.mock.calls[0][0]).toBe("https://s12345.eu-fsn-3.betterstackdata.com");
  });

  it("accepts host with explicit https:// prefix unchanged", async () => {
    process.env.BETTERSTACK_INGEST_TOKEN = "t";
    process.env.BETTERSTACK_INGEST_HOST  = "https://custom.example.com";

    const fetchSpy = vi.fn().mockResolvedValue(new Response("", { status: 202 }));
    global.fetch = fetchSpy as unknown as typeof fetch;

    await logInfrastructureEvent({ source: "x", event_type: "y", severity: "info" });
    expect(fetchSpy.mock.calls[0][0]).toBe("https://custom.example.com");
  });
});
