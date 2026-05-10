import { describe, it, expect, vi, beforeEach } from "vitest";

const logSpy = vi.fn().mockResolvedValue({ ok: true, id: "evt-1" });
vi.mock("@/lib/observability/logInfrastructureEvent", () => ({
  logInfrastructureEvent: (input: unknown) => logSpy(input),
}));

import { POST } from "../route";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.VERCEL_WEBHOOK_SECRET = "this-is-a-real-secret-with-enough-entropy";
});

function makeReq(opts: { auth?: string | null; body?: unknown } = {}) {
  const headers: Record<string, string> = {};
  if (opts.auth !== null) headers.authorization = opts.auth ?? `Bearer ${process.env.VERCEL_WEBHOOK_SECRET}`;
  return new Request("http://localhost/api/admin/webhooks/vercel", {
    method: "POST",
    headers,
    body: JSON.stringify(opts.body ?? {}),
  });
}

describe("POST /api/admin/webhooks/vercel", () => {
  it("returns 401 when no secret is configured", async () => {
    delete process.env.VERCEL_WEBHOOK_SECRET;
    const res = await POST(makeReq() as never);
    expect(res.status).toBe(401);
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("returns 401 on mismatched bearer", async () => {
    const res = await POST(makeReq({ auth: "Bearer wrong-secret" }) as never);
    expect(res.status).toBe(401);
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("returns 400 on invalid JSON body", async () => {
    const req = new Request("http://localhost/api/admin/webhooks/vercel", {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.VERCEL_WEBHOOK_SECRET}` },
      body: "not-json",
    });
    const res = await POST(req as never);
    expect(res.status).toBe(400);
  });

  it("logs deployment.error events as severity=error", async () => {
    const res = await POST(
      makeReq({
        body: {
          type: "deployment.error",
          id: "vercel-evt-123",
          createdAt: 1715284200000,
          payload: {
            target: "production",
            project: { name: "icareeros" },
            deployment: { id: "dpl_xyz", url: "icareeros.vercel.app" },
          },
        },
      }) as never,
    );
    expect(res.status).toBe(200);
    expect(logSpy).toHaveBeenCalledOnce();
    const arg = logSpy.mock.calls[0][0];
    expect(arg.source).toBe("vercel");
    expect(arg.event_type).toBe("deployment.error");
    expect(arg.severity).toBe("error");
    expect(arg.payload.deployment_id).toBe("dpl_xyz");
  });

  it("logs deployment.succeeded as severity=info", async () => {
    const res = await POST(makeReq({ body: { type: "deployment.succeeded", payload: {} } }) as never);
    expect(res.status).toBe(200);
    const arg = logSpy.mock.calls[0][0];
    expect(arg.severity).toBe("info");
  });
});
