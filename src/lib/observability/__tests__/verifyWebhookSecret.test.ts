import { describe, it, expect } from "vitest";
import { verifyWebhookSecret } from "../verifyWebhookSecret";

describe("verifyWebhookSecret", () => {
  const SECRET = "this-is-a-real-secret-with-enough-entropy";

  it("rejects when no secret is configured (fail closed)", () => {
    expect(verifyWebhookSecret("Bearer x", undefined)).toEqual({ ok: false, reason: "no_secret_configured" });
    expect(verifyWebhookSecret("Bearer x", "")).toEqual({ ok: false, reason: "no_secret_configured" });
  });

  it("rejects when secret is too short (defense in depth)", () => {
    expect(verifyWebhookSecret("Bearer short", "short")).toEqual({ ok: false, reason: "no_secret_configured" });
  });

  it("rejects when no header is presented", () => {
    expect(verifyWebhookSecret(null, SECRET)).toEqual({ ok: false, reason: "missing_header" });
  });

  it("accepts a matching Bearer token", () => {
    expect(verifyWebhookSecret(`Bearer ${SECRET}`, SECRET)).toEqual({ ok: true });
  });

  it("accepts a raw token (no Bearer prefix)", () => {
    expect(verifyWebhookSecret(SECRET, SECRET)).toEqual({ ok: true });
  });

  it("rejects a mismatched token", () => {
    expect(verifyWebhookSecret(`Bearer ${SECRET}-tampered`, SECRET)).toEqual({ ok: false, reason: "mismatch" });
  });

  it("rejects when only the prefix differs", () => {
    // Even a 1-character difference must be a mismatch (constant-time compare).
    const wrong = SECRET.slice(0, -1) + "X";
    expect(verifyWebhookSecret(`Bearer ${wrong}`, SECRET)).toEqual({ ok: false, reason: "mismatch" });
  });
});
