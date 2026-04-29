/**
 * Unit tests for emailService.ts
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { sendEmail } from "@/services/emailService";

// ── Mock fetch ─────────────────────────────────────────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("sendEmail", () => {
  it("sends email and returns result on 200", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, messageId: "msg-123", skipped: false }),
    });

    const result = await sendEmail({
      to: "user@example.com",
      subject: "Test subject",
      html: "<p>Hello</p>",
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/email/send",
      expect.objectContaining({ method: "POST" }),
    );
    expect(result.ok).toBe(true);
    expect(result.messageId).toBe("msg-123");
    expect(result.skipped).toBe(false);
  });

  it("returns skipped=true when SMTP not configured", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, messageId: null, skipped: true }),
    });

    const result = await sendEmail({
      to: "user@example.com",
      subject: "Test",
      html: "<p>Hi</p>",
    });

    expect(result.skipped).toBe(true);
    expect(result.messageId).toBeNull();
  });

  it("accepts an array of recipients", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, messageId: "msg-456", skipped: false }),
    });

    const result = await sendEmail({
      to: ["a@example.com", "b@example.com"],
      subject: "Batch",
      html: "<p>Hi</p>",
    });

    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.to).toEqual(["a@example.com", "b@example.com"]);
    expect(result.ok).toBe(true);
  });

  it("throws when server returns 401", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: "Unauthorised" }),
    });

    await expect(
      sendEmail({ to: "x@example.com", subject: "s", html: "<p>h</p>" }),
    ).rejects.toThrow("Unauthorised");
  });

  it("throws when server returns 500", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: "Mail send failed" }),
    });

    await expect(
      sendEmail({ to: "x@example.com", subject: "s", html: "<p>h</p>" }),
    ).rejects.toThrow("Mail send failed");
  });

  it("includes optional text field in request body", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, messageId: "msg-789", skipped: false }),
    });

    await sendEmail({
      to: "user@example.com",
      subject: "With text",
      html: "<p>HTML</p>",
      text: "Plain text",
    });

    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.text).toBe("Plain text");
  });
});
