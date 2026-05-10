import { describe, it, expect, vi, beforeEach } from "vitest";

const logSpy = vi.fn().mockResolvedValue({ ok: true, id: "evt-3" });
vi.mock("@/lib/observability/logInfrastructureEvent", () => ({
  logInfrastructureEvent: (input: unknown) => logSpy(input),
}));

import { POST } from "../route";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.BETTERSTACK_WEBHOOK_SECRET = "this-is-a-real-secret-with-enough-entropy";
});

function makeReq(body: unknown) {
  return new Request("http://localhost/api/admin/webhooks/betterstack", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.BETTERSTACK_WEBHOOK_SECRET}` },
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/webhooks/betterstack", () => {
  it("rejects unauthorized", async () => {
    delete process.env.BETTERSTACK_WEBHOOK_SECRET;
    const res = await POST(makeReq({}) as never);
    expect(res.status).toBe(401);
  });

  it("maps a fired incident (no resolved_at) to incident.fired/critical", async () => {
    const res = await POST(makeReq({ data: { type: "incident", attributes: { name: "icareeros up", started_at: "2026-05-09T18:00:00Z", cause: "5xx burst" } } }) as never);
    expect(res.status).toBe(200);
    const arg = logSpy.mock.calls[0][0];
    expect(arg.event_type).toBe("incident.fired");
    expect(arg.severity).toBe("critical");
  });

  it("maps a resolved incident to incident.resolved/info and propagates resolved_at", async () => {
    const res = await POST(makeReq({ data: { type: "incident", attributes: { name: "icareeros up", resolved_at: "2026-05-09T18:05:00Z" } } }) as never);
    expect(res.status).toBe(200);
    const arg = logSpy.mock.calls[0][0];
    expect(arg.event_type).toBe("incident.resolved");
    expect(arg.severity).toBe("info");
    expect(arg.resolved_at).toBe("2026-05-09T18:05:00Z");
  });
});
