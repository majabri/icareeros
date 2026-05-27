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
 * hire.icareeros.com without bouncing through another login.
 *
 * The check is hostname-based (not NODE_ENV-based) on purpose:
 *   - localhost:3000           → no domain attribute (per-host cookie)
 *   - *.vercel.app previews    → no domain attribute (per-host cookie)
 *   - icareeros.com / *.icareeros.com → domain=".icareeros.com"
 *
 * That matches what middleware.ts does on the server side via
 * `isProductionHost(host)`, and is more precise than NODE_ENV
 * (Vercel preview deploys run with NODE_ENV='production' too).
 *
 * Cross-tab refresh lock (2026-05-25, fix/cross-tab-refresh-token-race) —
 * The shared cookie domain above means every tab across the three
 * subdomains uses the same refresh_token. Without coordination, they
 * all race to refresh near token expiry, the first succeeds, the rest
 * fail with refresh_token_already_used, the SDK retries, and the
 * project-wide /token rate-limit bucket is drained within seconds. See
 * incident memo `incident_2026-05-24_auth_lockout_smtp`. We pass a
 * `navigatorLock` (Web Locks API) to `auth.lock` so only one tab
 * refreshes at a time; the others wait for the first one's result.
 *
 * Refresh-token-not-found guard (2026-05-27, fix/supabase-clear-stale-refresh-token) —
 * Even with the lock in place, a SECOND storm-class failure mode
 * surfaced 2026-05-27: a single tab with a stale refresh_token in
 * localStorage (rotated out of the DB) calling /token at ~50 req/s
 * because the SDK has no backoff on the terminal
 * `refresh_token_not_found` error. We pass a `guardedFetch` to
 * `global.fetch` that intercepts that exact response and clears
 * localStorage + sb-* cookies, breaking the loop. See
 * supabase-refresh-guard.ts for the implementation.
 */

import { createBrowserClient } from "@supabase/ssr";
import { navigatorLock } from "./supabase-browser-lock";
import { guardedFetch } from "./supabase-refresh-guard";

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
    {
      ...(domain ? { cookieOptions: { domain } } : {}),
      auth: {
        // Cross-tab single-flight refresh. See supabase-browser-lock.ts
        // for full rationale (2026-05-24 incident).
        lock: navigatorLock,
      },
      global: {
        // Refresh-token-not-found guard. See supabase-refresh-guard.ts
        // — clears local session when GoTrue says the refresh_token is
        // gone, breaking the retry loop that drained the /token rate-
        // limit bucket on 2026-05-27.
        fetch: guardedFetch,
      },
    },
  );
}

// Convenience singleton for client-component use
// (React-safe: createBrowserClient is idempotent)
export const supabase = createClient();
