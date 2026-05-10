import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "node:crypto";

const logSpy = vi.fn().mockResolvedValue({ ok: true, id: "evt-2" });
vi.mock("@/lib/observability/logInfrastructureEvent", () => ({
  logInfrastructureEvent: (input: unknown) => logSpy(input),
}));

import { POST } from "../route";

const SECRET = "this-is-a-real-secret-with-enough-entropy";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SENTRY_WEBHOOK_SECRET = SECRET;
});

function makeReq(body: unknown, opts: { sig?: string | null } = {}) {
  const bodyStr = JSON.stringify(body);
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.sig === undefined) {
    headers["sentry-hook-signature"] = createHmac("sha256", SECRET).update(bodyStr).digest("hex");
  } else if (opts.sig !== null) {
    headers["sentry-hook-signature"] = opts.sig;
  }
  return new Request("http://localhost/api/admin/webhooks/sentry", { method: "POST", headers, body: bodyStr });
}

describe("POST /api/admin/webhooks/sentry", () => {
  it("rejects unauthorized (no secret env)", async () => {
    delete process.env.SENTRY_WEBHOOK_SECRET;
    const res = await POST(makeReq({ action: "created" }) as never);
    expect(res.status).toBe(401);
  });

  it("rejects when signature header is missing", async () => {
    const res = await POST(makeReq({ action: "created" }, { sig: null }) as never);
    expect(res.status).toBe(401);
  });

  it("maps fatal level to severity=critical (good signature)", async () => {
    const res = await POST(makeReq({
      action: "created",
      data: { issue: { id: "1", title: "t", level: "fatal", project: { slug: "icareeros" } } },
    }) as never);
    expect(res.status).toBe(200);
    const arg = logSpy.mock.calls[0][0];
    expect(arg.severity).toBe("critical");
    expect(arg.event_type).toBe("issue.created");
  });

  it("maps resolved action to severity=info and sets resolved_at", async () => {
    const res = await POST(makeReq({
      action: "resolved",
      data: { issue: { id: "1", title: "t", level: "error" } },
    }) as never);
    expect(res.status).toBe(200);
    const arg = logSpy.mock.calls[0][0];
    expect(arg.severity).toBe("info");
    expect(arg.event_type).toBe("issue.resolved");
    expect(arg.resolved_at).toBeTypeOf("string");
  });
});
