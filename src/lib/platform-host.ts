/**
 * Phase 1 subdomain (2026-05-16) — Hostname → platform helpers.
 *
 * Extracted from middleware.ts so the same parsing logic can be unit
 * tested AND reused by server components that need to know which
 * platform the current request is for without round-tripping through
 * the `x-platform` request header.
 */

export type Platform = "jobs" | "hired" | "root";

/** True for any host that lives on the real icareeros.com production domain. */
export function isProductionHost(host: string): boolean {
  return host.endsWith("icareeros.com");
}

/** Map a host header value to one of three logical platforms. */
export function platformFromHost(host: string): Platform {
  if (host.startsWith("jobs."))  return "jobs";
  if (host.startsWith("hired.")) return "hired";
  return "root";
}
