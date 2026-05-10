/**
 * src/lib/observability/verifyWebhookSecret.ts
 *
 * Shared-secret authentication for the 3 inbound webhook receivers.
 * Each provider (Vercel / Sentry / BetterStack) gets its own env var so
 * rotating one doesn't blast the others.
 *
 * Pattern: provider sends `Authorization: Bearer <secret>` (configured in
 * each dashboard). We compare in constant time to avoid timing oracles.
 *
 * Returns true if the request is authorized, false otherwise. The receiver
 * route handler should respond with 401 on false. Per ADR-005 (defaults),
 * this is a v1 simplification — full HMAC verification (Vercel
 * `x-vercel-signature`, Sentry `sentry-hook-signature`) lands in a follow-up.
 */

export interface VerifyResult {
  ok:     boolean;
  reason?: "no_secret_configured" | "missing_header" | "mismatch";
}

/**
 * Constant-time string comparison. Returns false fast on length mismatch
 * (length is not secret), then walks both strings to avoid leaking the
 * matching prefix length via timing.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export function verifyWebhookSecret(
  authHeader: string | null,
  expectedSecret: string | undefined,
): VerifyResult {
  // Fail closed: if no secret configured, reject all requests.
  // This is intentional — receivers should never accept traffic in an
  // unconfigured state. The W6-D security wall populates these env vars.
  if (!expectedSecret || expectedSecret.length < 16) {
    return { ok: false, reason: "no_secret_configured" };
  }
  if (!authHeader) {
    return { ok: false, reason: "missing_header" };
  }
  const presented = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : authHeader;
  return timingSafeEqual(presented, expectedSecret)
    ? { ok: true }
    : { ok: false, reason: "mismatch" };
}
