/**
 * iCareerOS — Supabase Client
 * Single shared instance for the Next.js 14 app.
 * Adapted from azjobs/src/integrations/supabase/client.ts.
 *
 * Server components: use createServerClient() from @supabase/ssr
 * Client components: use createClient() from this file
 *
 * Phase 1 subdomain hotfix (2026-05-17, fix/auth-subdomain-loop) —
 * The browser client now writes its session cookies with
 * `domain: .icareeros.com` when running on production hosts, so a
 * sign-in on icareeros.com is valid on jobs.icareeros.com and
 * hired.icareeros.com without bouncing through another login.
 *
 * The check is hostname-based (not NODE_ENV-based) on purpose:
 *   - localhost:3000           → no domain attribute (per-host cookie)
 *   - *.vercel.app previews    → no domain attribute (per-host cookie)
 *   - icareeros.com / *.icareeros.com → domain=".icareeros.com"
 *
 * That matches what middleware.ts does on the server side via
 * `isProductionHost(host)`, and is more precise than NODE_ENV
 * (Vercel preview deploys run with NODE_ENV='production' too).
 */

import { createBrowserClient } from "@supabase/ssr";

/**
 * Resolve the cookie-Domain attribute for the current page. Returns
 * undefined when we should let the browser default to per-host scope.
 */
export function resolveBrowserCookieDomain(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return window.location.hostname.endsWith("icareeros.com")
    ? ".icareeros.com"
    : undefined;
}

export function createClient() {
  const domain = resolveBrowserCookieDomain();
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    domain ? { cookieOptions: { domain } } : undefined,
  );
}

// Convenience singleton for client-component use
// (React-safe: createBrowserClient is idempotent)
export const supabase = createClient();
