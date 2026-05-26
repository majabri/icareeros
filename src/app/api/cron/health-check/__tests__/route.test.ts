import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const logSpy = vi.fn().mockResolvedValue({ ok: true, id: "evt-h" });
vi.mock("@/lib/observability/logInfrastructureEvent", () => ({
  logInfrastructureEvent: (input: unknown) => logSpy(input),
}));

// T-018 — mock the supabase client so probeAuthAuditLog() never hits the network.
// Tests override `rpcSpy` per-case to simulate different audit-log states.
const rpcSpy = vi.fn();
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ rpc: (...args: unknown[]) => rpcSpy(...args) }),
}));

import { POST } from "../route";

const realFetch = global.fetch;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "cron-secret-with-enough-bytes";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
  // Default: site has had traffic and is currently active — no alert.
  rpcSpy.mockResolvedValue({
    data: { recent_count: 12, lifetime_count: 4096, last_event_at: "2026-05-26T03:00:00Z" },
    error: null,
  });
});

afterEach(() => { global.fetch = realFetch; });

function makeReq(secret?: string) {
  return new Request("http://localhost/api/cron/health-check", {
    method: "POST",
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });
}

describe("POST /api/cron/health-check", () => {
  it("rejects without CRON_SECRET", async () => {
    const res = await POST(makeReq("wrong") as never);
    expect(res.status).toBe(401);
  });

  it("returns 200 + health.ok when all probes pass", async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    const res = await POST(makeReq(process.env.CRON_SECRET!) as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.failed).toBe(0);
    expect(body.passed).toBeGreaterThan(0);
    expect(logSpy).toHaveBeenCalledOnce();
    const arg = logSpy.mock.calls[0][0];
    expect(arg.event_type).toBe("health.ok");
    expect(arg.severity).toBe("info");
  });

  it("returns 207 + health.5xx when any probe fails", async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response("oops", { status: 500 }));
    const res = await POST(makeReq(process.env.CRON_SECRET!) as never);
    expect(res.status).toBe(207);
    // logSpy is called for the health summary AND (if applicable) for the audit probe.
    const healthCall = logSpy.mock.calls.find(c => /^health\./.test((c[0] as { event_type: string }).event_type));
    expect(healthCall).toBeDefined();
    const arg = (healthCall as unknown[])[0] as { event_type: string; severity: string };
    expect(arg.event_type).toBe("health.5xx");
    expect(["error", "critical"]).toContain(arg.severity);
  });

  // ── T-018 — auth-silence probe coverage ────────────────────────────────

  it("T-018: fires auth.audit_log_silent CRITICAL when recent=0 AND lifetime>0", async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    rpcSpy.mockResolvedValueOnce({
      data: { recent_count: 0, lifetime_count: 4096, last_event_at: "2026-05-23T15:10:00Z" },
      error: null,
    });
    await POST(makeReq(process.env.CRON_SECRET!) as never);

    const silenceCall = logSpy.mock.calls.find(
      c => (c[0] as { event_type: string }).event_type === "auth.audit_log_silent",
    );
    expect(silenceCall, "expected auth.audit_log_silent event to be logged").toBeDefined();
    const ev = (silenceCall as unknown[])[0] as { severity: string; payload: Record<string, unknown> };
    expect(ev.severity).toBe("critical");
    expect(ev.payload.recent_2h).toBe(0);
    expect(ev.payload.lifetime_7d).toBe(4096);
    expect(ev.payload.last_event_at).toBe("2026-05-23T15:10:00Z");
    expect(String(ev.payload.suspected_cause)).toMatch(/cross-tab refresh-token race|Bluehost SMTP/);
  });

  it("T-018: stays quiet on a genuinely dormant project (recent=0 AND lifetime=0)", async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    rpcSpy.mockResolvedValueOnce({
      data: { recent_count: 0, lifetime_count: 0, last_event_at: null },
      error: null,
    });
    await POST(makeReq(process.env.CRON_SECRET!) as never);

    const silenceCall = logSpy.mock.calls.find(
      c => (c[0] as { event_type: string }).event_type === "auth.audit_log_silent",
    );
    expect(silenceCall, "must NOT alert on a brand-new/dormant project").toBeUndefined();
  });

  it("T-018: stays quiet during normal operation (recent>0)", async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    rpcSpy.mockResolvedValueOnce({
      data: { recent_count: 17, lifetime_count: 4096, last_event_at: "2026-05-26T04:30:00Z" },
      error: null,
    });
    await POST(makeReq(process.env.CRON_SECRET!) as never);

    const silenceCall = logSpy.mock.calls.find(
      c => (c[0] as { event_type: string }).event_type === "auth.audit_log_silent",
    );
    expect(silenceCall).toBeUndefined();
  });

  it("T-018: surfaces RPC failures as warning (NOT critical, so it doesn't page on every cron miss)", async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    rpcSpy.mockResolvedValueOnce({ data: null, error: { message: "function does not exist" } });
    await POST(makeReq(process.env.CRON_SECRET!) as never);

    const probeFail = logSpy.mock.calls.find(
      c => (c[0] as { event_type: string }).event_type === "auth.audit_log_probe_failed",
    );
    expect(probeFail, "expected probe-failure warning when RPC errors").toBeDefined();
    const ev = (probeFail as unknown[])[0] as { severity: string; payload: { error: string } };
    expect(ev.severity).toBe("warning");
    expect(ev.payload.error).toContain("function does not exist");
  });
});
