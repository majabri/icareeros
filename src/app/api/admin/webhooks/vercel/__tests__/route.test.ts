import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "node:crypto";

const logSpy = vi.fn().mockResolvedValue({ ok: true, id: "evt-1" });
vi.mock("@/lib/observability/logInfrastructureEvent", () => ({
  logInfrastructureEvent: (input: unknown) => logSpy(input),
}));

// Sprint 2 W2-C: route now upserts into deployment_history via Supabase.
// Stub the client so tests don't need real credentials.
const upsertSpy = vi.fn().mockResolvedValue({ error: null });
const selectMaybeSpy = vi.fn().mockResolvedValue({ data: [], error: null });
vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      upsert: upsertSpy,
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => ({
            limit: selectMaybeSpy,
          })),
        })),
      })),
    })),
  })),
}));

import { POST } from "../route";

const SECRET = "this-is-a-real-secret-with-enough-entropy";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.VERCEL_WEBHOOK_SECRET = SECRET;
});

function makeReq(opts: { sig?: string | null; body?: unknown } = {}) {
  const bodyStr = JSON.stringify(opts.body ?? {});
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.sig === undefined) {
    headers["x-vercel-signature"] = createHmac("sha1", SECRET).update(bodyStr).digest("hex");
  } else if (opts.sig !== null) {
    headers["x-vercel-signature"] = opts.sig;
  }
  return new Request("http://localhost/api/admin/webhooks/vercel", { method: "POST", headers, body: bodyStr });
}

describe("POST /api/admin/webhooks/vercel", () => {
  it("returns 401 when no secret is configured", async () => {
    delete process.env.VERCEL_WEBHOOK_SECRET;
    const res = await POST(makeReq() as never);
    expect(res.status).toBe(401);
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("returns 401 when signature is missing", async () => {
    const res = await POST(makeReq({ sig: null, body: { type: "deployment.created" } }) as never);
    expect(res.status).toBe(401);
  });

  it("returns 401 on a tampered signature", async () => {
    const res = await POST(makeReq({ sig: "0".repeat(40), body: { type: "deployment.created" } }) as never);
    expect(res.status).toBe(401);
  });

  it("returns 400 on invalid JSON body (after passing HMAC)", async () => {
    const bad = "not-json";
    const headers: Record<string, string> = {
      "x-vercel-signature": createHmac("sha1", SECRET).update(bad).digest("hex"),
    };
    const res = await POST(new Request("http://localhost/api/admin/webhooks/vercel", { method: "POST", headers, body: bad }) as never);
    expect(res.status).toBe(400);
  });

  it("logs deployment.error events with severity=error", async () => {
    const body = {
      type: "deployment.error",
      id: "vercel-evt-123",
      createdAt: 1715284200000,
      payload: {
        target: "production",
        project: { name: "icareeros" },
        deployment: { id: "dpl_xyz", url: "icareeros.vercel.app" },
      },
    };
    const res = await POST(makeReq({ body }) as never);
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

  it("upserts into deployment_history on deployment.succeeded (W2-C)", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key-test";
    upsertSpy.mockClear();

    const body = {
      type: "deployment.succeeded",
      id: "vercel-evt-456",
      payload: {
        target: "production",
        project: { name: "icareeros" },
        deployment: {
          id: "dpl_abc123",
          url: "icareeros-abc.vercel.app",
          meta: {
            githubCommitSha: "deadbeef",
            githubCommitRef: "main",
            githubCommitMessage: "Test commit",
          },
        },
      },
    };

    const res = await POST(makeReq({ body }) as never);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.deployment_recorded).toBe(true);
    expect(upsertSpy).toHaveBeenCalledOnce();
    const upserted = upsertSpy.mock.calls[0][0];
    expect(upserted.vercel_deployment_id).toBe("dpl_abc123");
    expect(upserted.state).toBe("READY");
    expect(upserted.commit_sha).toBe("deadbeef");
    expect(upserted.gate_decision).toBe("pending");
  });

  it("marks gate_decision=fail on deployment.error (W2-C)", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key-test";
    upsertSpy.mockClear();

    const body = {
      type: "deployment.error",
      payload: {
        target: "production",
        deployment: { id: "dpl_xyz", url: "x.vercel.app", meta: { githubCommitSha: "abc", githubCommitRef: "main" } },
      },
    };

    const res = await POST(makeReq({ body }) as never);
    expect(res.status).toBe(200);
    expect(upsertSpy).toHaveBeenCalledOnce();
    const upserted = upsertSpy.mock.calls[0][0];
    expect(upserted.state).toBe("ERROR");
    expect(upserted.gate_decision).toBe("fail");
    expect(upserted.gate_rationale).toContain("deployment.error");
  });
});
