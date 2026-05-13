/**
 * URL canonicalization + hashing for cross-source dedupe.
 *
 * Strips tracking params, normalizes case, removes trailing slashes,
 * keeps only the "stable" parts of the URL. Then sha-256 → hex.
 */

import { createHash } from "crypto";

const TRACKING_PARAMS = new Set([
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
  "fbclid", "gclid", "msclkid", "mc_cid", "mc_eid", "ref", "referer",
  "source", "src", "ref_src", "_ga", "_gl", "yclid",
]);

export function canonicalizeUrl(raw: string): string {
  try {
    const u = new URL(raw.trim());
    u.hash = "";
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
    // Strip tracking params; keep job-id-like params (id, jobId, j, etc.)
    const kept: [string, string][] = [];
    for (const [k, v] of u.searchParams) {
      if (TRACKING_PARAMS.has(k.toLowerCase())) continue;
      kept.push([k, v]);
    }
    u.search = "";
    kept.sort(([a], [b]) => a.localeCompare(b));
    for (const [k, v] of kept) u.searchParams.append(k, v);
    // Remove trailing slash unless it's the only path segment
    if (u.pathname.length > 1 && u.pathname.endsWith("/")) {
      u.pathname = u.pathname.replace(/\/+$/, "");
    }
    return u.toString();
  } catch {
    return raw.trim();
  }
}

export function hashUrl(raw: string): string {
  return createHash("sha256").update(canonicalizeUrl(raw)).digest("hex");
}
