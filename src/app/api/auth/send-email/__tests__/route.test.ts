/**
 * /api/auth/send-email route tests.
 *
 * Covers:
 *  - Missing AUTH_HOOK_RELAY_SECRET → 500
 *  - Missing/invalid bearer         → 401 (timing-safe)
 *  - Invalid JSON                   → 400
 *  - Missing required fields        → 400
 *  - Unknown emailActionType        → 400
 *  - Happy path (recovery)          → 200 { ok: true, messageId }
 *  - Happy path (signup)            → 200 { ok: true, messageId }
 *  - mailer returns null            → 500 (SMTP not configured)
 *  - mailer returns rejected[]      → 502
 *  - Template selection             — subject differs per type
 *
 * Feat: platform-auth-send-email-hook (2026-07-16)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the shared mailer to a controllable spy.
const mockSendMail = vi.fn();
vi.mock("@/lib/mailer", () => ({
  sendMail: (opts: unknown) => mockSendMail(opts),
}));

// Import AFTER vi.mock — Next.js/Vitest ESM ordering.
import { POST } from "@/app/api/auth/send-email/route";
import { NextRequest } from "next/server";

const RELAY_SECRET = "test-relay-secret-x".repeat(2); // 40 chars

function makeReq(body: unknown, opts: { auth?: string; bad?: boolean } = {}): NextRequest {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (opts.auth !== undefined) headers["authorization"] = opts.auth;
  return new NextRequest("http://localhost/api/auth/send-email", {
    method:  "POST",
    headers,
    body:    opts.bad ? "not-json{" : JSON.stringify(body),
  });
}

const goodBody = {
  to:               "user@example.com",
  emailActionType:  "recovery" as const,
  confirmationUrl:  "https://icareeros.com/auth/confirm?token_hash=abc&type=recovery",
};

beforeEach(() => {
  process.env.AUTH_HOOK_RELAY_SECRET = RELAY_SECRET;
  mockSendMail.mockReset();
  mockSendMail.mockResolvedValue({
    accepted:  ["user@example.com"],
    rejected:  [],
    messageId: "<test-msg-id@icareeros.com>",
  });
});

describe("/api/auth/send-email — POST", () => {
  it("500s when AUTH_HOOK_RELAY_SECRET is unset", async () => {
    delete process.env.AUTH_HOOK_RELAY_SECRET;
    const res = await POST(makeReq(goodBody, { auth: `Bearer ${RELAY_SECRET}` }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "server not configured" });
  });

  it("401s when Authorization header is missing", async () => {
    const res = await POST(makeReq(goodBody));
    expect(res.status).toBe(401);
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it("401s when bearer token is wrong", async () => {
    const res = await POST(makeReq(goodBody, { auth: `Bearer wrong-secret` }));
    expect(res.status).toBe(401);
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it("401s when bearer token is right-length but wrong content", async () => {
    // Same length as the real secret — exercises the timing-safe path.
    const sameLen = "X".repeat(RELAY_SECRET.length);
    const res = await POST(makeReq(goodBody, { auth: `Bearer ${sameLen}` }));
    expect(res.status).toBe(401);
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it("400s on malformed JSON body", async () => {
    const res = await POST(makeReq(null, { auth: `Bearer ${RELAY_SECRET}`, bad: true }));
    expect(res.status).toBe(400);
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it("400s when 'to' is missing or not an email", async () => {
    const bad = { ...goodBody, to: "not-an-email" };
    const res = await POST(makeReq(bad, { auth: `Bearer ${RELAY_SECRET}` }));
    expect(res.status).toBe(400);
  });

  it("400s when 'confirmationUrl' is missing", async () => {
    const bad = { ...goodBody, confirmationUrl: "" };
    const res = await POST(makeReq(bad, { auth: `Bearer ${RELAY_SECRET}` }));
    expect(res.status).toBe(400);
  });

  it("400s on unknown emailActionType", async () => {
    const bad = { ...goodBody, emailActionType: "something-else" as unknown as "recovery" };
    const res = await POST(makeReq(bad, { auth: `Bearer ${RELAY_SECRET}` }));
    expect(res.status).toBe(400);
  });

  it("200s and calls sendMail with the recovery subject", async () => {
    const res = await POST(makeReq(goodBody, { auth: `Bearer ${RELAY_SECRET}` }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, messageId: "<test-msg-id@icareeros.com>" });
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const args = mockSendMail.mock.calls[0][0];
    expect(args.to).toBe("user@example.com");
    expect(args.subject).toBe("Reset your iCareerOS password");
    expect(args.html).toContain(goodBody.confirmationUrl);
    expect(args.text).toContain(goodBody.confirmationUrl);
  });

  it("selects the signup subject for emailActionType=signup", async () => {
    const body = { ...goodBody, emailActionType: "signup" as const };
    await POST(makeReq(body, { auth: `Bearer ${RELAY_SECRET}` }));
    expect(mockSendMail.mock.calls[0][0].subject).toBe("Confirm your iCareerOS email");
  });

  it("selects the magiclink subject for emailActionType=magiclink", async () => {
    const body = { ...goodBody, emailActionType: "magiclink" as const };
    await POST(makeReq(body, { auth: `Bearer ${RELAY_SECRET}` }));
    expect(mockSendMail.mock.calls[0][0].subject).toBe("Your iCareerOS sign-in link");
  });

  it("selects the email_change subject for emailActionType=email_change", async () => {
    const body = { ...goodBody, emailActionType: "email_change" as const };
    await POST(makeReq(body, { auth: `Bearer ${RELAY_SECRET}` }));
    expect(mockSendMail.mock.calls[0][0].subject).toBe("Confirm your new email address");
  });

  it("selects the invite subject for emailActionType=invite", async () => {
    const body = { ...goodBody, emailActionType: "invite" as const };
    await POST(makeReq(body, { auth: `Bearer ${RELAY_SECRET}` }));
    expect(mockSendMail.mock.calls[0][0].subject).toBe("You've been invited to iCareerOS");
  });

  it("500s when sendMail returns null (SMTP env not configured)", async () => {
    mockSendMail.mockResolvedValueOnce(null);
    const res = await POST(makeReq(goodBody, { auth: `Bearer ${RELAY_SECRET}` }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("mailer not configured");
  });

  it("502s when the recipient is rejected", async () => {
    mockSendMail.mockResolvedValueOnce({
      accepted:  [],
      rejected:  ["user@example.com"],
      messageId: "<x@icareeros.com>",
    });
    const res = await POST(makeReq(goodBody, { auth: `Bearer ${RELAY_SECRET}` }));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("recipient rejected");
    expect(body.rejected).toEqual(["user@example.com"]);
  });

  it("500s and surfaces the error message when sendMail throws", async () => {
    mockSendMail.mockRejectedValueOnce(new Error("boom"));
    const res = await POST(makeReq(goodBody, { auth: `Bearer ${RELAY_SECRET}` }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("send failed");
  });
});
