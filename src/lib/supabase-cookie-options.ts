/**
 * Phase 1 subdomain (2026-05-16) — Auth cookies must be scoped to the
 * parent domain in production so a session created on `icareeros.com`
 * is valid on `jobs.icareeros.com` and `hire.icareeros.com`.
 *
 * Every `createServerClient` call site uses a Supabase `setAll` callback
 * to write cookies. Wrap the per-cookie `options` through this helper
 * before passing them to `cookieStore.set` so they pick up the
 * `.icareeros.com` Domain attribute in production. In dev (and on
 * `*.vercel.app` previews which run with NODE_ENV='development' or just
 * not 'production'), the default per-host scope is preserved.
 *
 * The middleware uses an equivalent inline check because the request
 * host is already in scope there.
 */
import type { CookieOptions } from "@supabase/ssr";

export function withCrossSubdomainCookie(options?: CookieOptions): CookieOptions {
  if (process.env.NODE_ENV !== "production") return options ?? {};
  return { ...(options ?? {}), domain: ".icareeros.com" };
}
