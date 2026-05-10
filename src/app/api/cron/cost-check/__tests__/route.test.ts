import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const logSpy = vi.fn().mockResolvedValue({ ok: true, id: "evt-c" });
vi.mock("@/lib/observability/logInfrastructureEvent", () => ({
  logInfrastructureEvent: (input: unknown) => logSpy(input),
}));

import { POST } from "../route";

const realFetch = global.fetch;
beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "cron-secret-with-enough-bytes";
  process.env.LANGFUSE_PUBLIC_KEY = "pk-test";
  process.env.LANGFUSE_SECRET_KEY = "sk-test";
  process.env.LANGFUSE_BASE_URL = "https://cloud.langfuse.com";
  process.env.COST_DAILY_USD_THRESHOLD = "10";
});
afterEach(() => { global.fetch = realFetch; });

function makeReq() {
  return new Request("http://localhost/api/cron/cost-check", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
}

describe("POST /api/cron/cost-check", () => {
  it("rejects without CRON_SECRET", async () => {
    const res = await POST(new Request("http://localhost/api/cron/cost-check", { method: "POST" }) as never);
    expect(res.status).toBe(401);
  });

  it("logs cost.daily / info when under threshold", async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ date: "2026-05-08", totalCost: 4.21 }] }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const res = await POST(makeReq() as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.over_threshold).toBe(false);
    expect(body.yesterday_cost_usd).toBeCloseTo(4.21);
    const arg = logSpy.mock.calls[0][0];
    expect(arg.event_type).toBe("cost.daily");
    expect(arg.severity).toBe("info");
  });

  it("logs cost.over_threshold / error when above threshold", async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ date: "2026-05-08", totalCost: 14.99 }] }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const res = await POST(makeReq() as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.over_threshold).toBe(true);
    const arg = logSpy.mock.calls[0][0];
    expect(arg.event_type).toBe("cost.over_threshold");
    expect(arg.severity).toBe("error");
  });

  it("logs cost.error when Langfuse env is missing", async () => {
    delete process.env.LANGFUSE_PUBLIC_KEY;
    const res = await POST(makeReq() as never);
    expect(res.status).toBe(200);
    const arg = logSpy.mock.calls[0][0];
    expect(arg.event_type).toBe("cost.error");
    expect(arg.severity).toBe("warning");
  });
});
