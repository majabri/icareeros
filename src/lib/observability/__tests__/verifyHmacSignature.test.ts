import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { verifyHmacSignature } from "../verifyHmacSignature";

const SECRET = "this-is-a-real-secret-with-enough-entropy";

function sign(body: string, algo: "sha1" | "sha256"): string {
  return createHmac(algo, SECRET).update(body, "utf8").digest("hex");
}

describe("verifyHmacSignature", () => {
  it("rejects when no secret is configured", () => {
    expect(verifyHmacSignature("body", "deadbeef", undefined, "sha1")).toEqual({ ok: false, reason: "no_secret_configured" });
  });

  it("rejects when secret is too short", () => {
    expect(verifyHmacSignature("body", "deadbeef", "short", "sha1")).toEqual({ ok: false, reason: "no_secret_configured" });
  });

  it("rejects when the signature header is missing", () => {
    expect(verifyHmacSignature("body", null, SECRET, "sha1")).toEqual({ ok: false, reason: "missing_signature" });
  });

  it("rejects non-hex signatures", () => {
    expect(verifyHmacSignature("body", "not-hex-zzz", SECRET, "sha256")).toEqual({ ok: false, reason: "invalid_hex" });
  });

  it("accepts a valid HMAC-SHA1 (Vercel pattern)", () => {
    const body = '{"type":"deployment.error","id":"x"}';
    expect(verifyHmacSignature(body, sign(body, "sha1"), SECRET, "sha1")).toEqual({ ok: true });
  });

  it("accepts a valid HMAC-SHA256 (Sentry pattern)", () => {
    const body = '{"action":"created"}';
    expect(verifyHmacSignature(body, sign(body, "sha256"), SECRET, "sha256")).toEqual({ ok: true });
  });

  it("accepts a 'sha256=…' prefixed signature (some providers add a prefix)", () => {
    const body = '{"action":"created"}';
    const sig  = "sha256=" + sign(body, "sha256");
    expect(verifyHmacSignature(body, sig, SECRET, "sha256")).toEqual({ ok: true });
  });

  it("rejects a wrong-algo signature even with correct secret", () => {
    const body = '{"x":1}';
    const wrongAlgoSig = sign(body, "sha1");
    expect(verifyHmacSignature(body, wrongAlgoSig, SECRET, "sha256")).toEqual({ ok: false, reason: "mismatch" });
  });

  it("rejects a tampered body (sig is from the original body)", () => {
    const original = '{"x":1}';
    const tampered = '{"x":2}';
    expect(verifyHmacSignature(tampered, sign(original, "sha1"), SECRET, "sha1")).toEqual({ ok: false, reason: "mismatch" });
  });

  it("rejects when the wrong secret was used to sign", () => {
    const body = '{"x":1}';
    const wrongSig = createHmac("sha1", "different-secret-with-enough-bytes").update(body).digest("hex");
    expect(verifyHmacSignature(body, wrongSig, SECRET, "sha1")).toEqual({ ok: false, reason: "mismatch" });
  });
});
