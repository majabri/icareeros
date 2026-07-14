/**
 * Tests for T-017 — SMTP health-check cron.
 *
 * See route.ts header for the incident context.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const logSpy  = vi.fn().mockResolvedValue({ ok: true, id: "evt-smtp" });
const mailSpy = vi.fn();

vi.mock("@/lib/observability/logInfrastructureEvent", () => ({
  logInfrastructureEvent: (input: unknown) => logSpy(input),
}));
vi.mock("@/lib/mailer", () => ({
  sendMail: (...args: unknown[]) => mailSpy(...args),
}));

import { POST } from "../route";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "cron-secret-with-enough-bytes";
  process.env.EMAIL_USER = "bugs@icareeros.com";
});

function makeReq(secret?: string) {
  return new Request("http://localhost/api/cron/smtp-health-check", {
    method:  "POST",
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });
}

describe("POST /api/cron/smtp-health-check", () => {
  it("rejects requests without the CRON_SECRET", async () => {
    const res = await POST(makeReq("wrong") as never);
    expect(res.status).toBe(401);
    expect(mailSpy).not.toHaveBeenCalled();
  });

  it("logs smtp.ok and returns 200 when the send succeeds", async () => {
    mailSpy.mockResolvedValueOnce({
      accepted:  ["bugs@icareeros.com"],
      rejected:  [],
      messageId: "<probe-1@icareeros.com>",
    });
    const res = await POST(makeReq(process.env.CRON_SECRET!) as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.message_id).toBe("<probe-1@icareeros.com>");
    expect(mailSpy).toHaveBeenCalledOnce();
    const sendArgs = mailSpy.mock.calls[0][0];
    expect(sendArgs.to).toBe("bugs@icareeros.com");
    expect(sendArgs.subject).toMatch(/^\[SMTP-HEALTH\] Probe /);
    expect(logSpy).toHaveBeenCalledWith(expect.objectContaining({
      source:     "smtp-cron",
      event_type: "smtp.ok",
      severity:   "info",
    }));
  });

  it("logs smtp.skipped (warning) when sendMail returns null — local/dev SMTP-less env", async () => {
    mailSpy.mockResolvedValueOnce(null);
    const res = await POST(makeReq(process.env.CRON_SECRET!) as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.skipped).toBe(true);
    expect(logSpy).toHaveBeenCalledWith(expect.objectContaining({
      source:     "smtp-cron",
      event_type: "smtp.skipped",
      severity:   "warning",
    }));
  });

  it("logs smtp.send_failed (CRITICAL) and returns 500 when the send throws", async () => {
    mailSpy.mockRejectedValueOnce(Object.assign(new Error("ECONNREFUSED 50.87.199.84:465"), { code: "ECONNREFUSED" }));
    const res = await POST(makeReq(process.env.CRON_SECRET!) as never);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/ECONNREFUSED/);
    expect(logSpy).toHaveBeenCalledWith(expect.objectContaining({
      source:     "smtp-cron",
      event_type: "smtp.send_failed",
      severity:   "critical",
      payload:    expect.objectContaining({
        error_code: "ECONNREFUSED",
        suspected:  expect.stringContaining("rotation-runbook"),
      }),
    }));
  });

  it("captures non-Error throws gracefully", async () => {
    mailSpy.mockRejectedValueOnce("Bluehost rate limit hit");
    const res = await POST(makeReq(process.env.CRON_SECRET!) as never);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Bluehost rate limit hit");
    expect(logSpy).toHaveBeenCalledWith(expect.objectContaining({
      event_type: "smtp.send_failed",
      severity:   "critical",
    }));
  });
});
