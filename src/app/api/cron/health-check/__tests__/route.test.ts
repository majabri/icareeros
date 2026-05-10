import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const logSpy = vi.fn().mockResolvedValue({ ok: true, id: "evt-h" });
vi.mock("@/lib/observability/logInfrastructureEvent", () => ({
  logInfrastructureEvent: (input: unknown) => logSpy(input),
}));

import { POST } from "../route";

const realFetch = global.fetch;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "cron-secret-with-enough-bytes";
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
    const arg = logSpy.mock.calls[0][0];
    expect(arg.event_type).toBe("health.5xx");
    expect(["error", "critical"]).toContain(arg.severity);
  });
});
