/**
 * src/lib/observability/verifyHmacSignature.ts
 *
 * HMAC signature verification for inbound webhooks where the provider signs
 * the raw request body with a shared secret.
 *
 *   - Vercel: signs HMAC-SHA1, sends hex digest in `x-vercel-signature`.
 *   - Sentry: signs HMAC-SHA256, sends hex digest in `sentry-hook-signature`.
 *
 * BetterStack does NOT sign — they let you configure a custom Authorization
 * header per alert destination, so it stays on the simpler shared-secret
 * `verifyWebhookSecret` path.
 *
 * ADR-005 Phase 1 (W6-D follow-up).
 */

import { createHmac, timingSafeEqual as nodeTimingSafeEqual } from "node:crypto";

export type HmacAlgo = "sha1" | "sha256";

export interface VerifyHmacResult {
  ok:      boolean;
  reason?: "no_secret_configured" | "missing_signature" | "mismatch" | "invalid_hex";
}

/**
 * Verifies that `signature` is a hex-encoded HMAC of `rawBody` using
 * `secret` and the given digest algorithm. Constant-time compare.
 */
export function verifyHmacSignature(
  rawBody: string,
  signature: string | null,
  secret: string | undefined,
  algo: HmacAlgo,
): VerifyHmacResult {
  if (!secret || secret.length < 16) return { ok: false, reason: "no_secret_configured" };
  if (!signature)                    return { ok: false, reason: "missing_signature" };

  // Some providers prefix the digest (e.g. "sha256=…"). Strip the prefix if present.
  const presented = signature.includes("=") ? signature.split("=").pop()! : signature;
  if (!/^[0-9a-fA-F]+$/.test(presented)) return { ok: false, reason: "invalid_hex" };

  const expectedHex = createHmac(algo, secret).update(rawBody, "utf8").digest("hex");
  if (presented.length !== expectedHex.length) return { ok: false, reason: "mismatch" };

  // Convert both to Buffers for constant-time compare.
  const a = Buffer.from(presented.toLowerCase(), "hex");
  const b = Buffer.from(expectedHex,           "hex");
  if (a.length !== b.length) return { ok: false, reason: "mismatch" };

  return nodeTimingSafeEqual(a, b) ? { ok: true } : { ok: false, reason: "mismatch" };
}
