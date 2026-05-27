/**
 * Refresh-token-not-found guard for the browser Supabase client.
 *
 * Why this exists — 2026-05-27 storm follow-up:
 *
 *   PR #295 wired `navigatorLock` to `auth.lock` so concurrent tabs
 *   serialize their refresh attempts. That fixed the
 *   `refresh_token_already_used` race that caused the 2026-05-24
 *   lockout.
 *
 *   But 2026-05-27 ~02:41 UTC surfaced a SECOND failure mode that
 *   the lock cannot help with:
 *
 *     - A single tab on icareeros.com had a stale refresh_token in
 *       its localStorage (token rotated out of the DB at some point
 *       — maybe a long-running tab, maybe browser sync from another
 *       device).
 *     - The Supabase JS client called POST /auth/v1/token?grant_type=
 *       refresh_token with that stale token.
 *     - GoTrue returned 400 { "error_code": "refresh_token_not_found" }.
 *     - The SDK retried with NO backoff — ~50 req/s sustained.
 *     - Project-wide /token rate-limit bucket drained within seconds.
 *     - The lock buys nothing because there is no contention; one
 *       tab is doing one terminal-error refresh, infinitely.
 *
 *   The fix is to detect this exact response — a 400 on /token
 *   refresh_token grants with error_code=refresh_token_not_found —
 *   and clear the local session state (localStorage entries + sb-*
 *   cookies). The SDK's next attempt will see no stored session,
 *   stop trying to refresh, and emit a SIGNED_OUT auth state change
 *   instead of looping.
 *
 *   The error is terminal by definition — the refresh_token is gone
 *   from the DB and will never come back. Retrying cannot help. The
 *   correct response is "you're signed out, sign in again."
 *
 * Scope:
 *   - This wrapper ONLY watches refresh_token grants returning a
 *     specific error_code. Password grants (login attempts) and
 *     other endpoints pass through untouched.
 *   - It is SSR-safe: when window/localStorage/document aren't
 *     defined, the clearer no-ops.
 *   - It does not throw under any circumstances. If parsing the
 *     response body fails, it leaves the response unchanged and the
 *     SDK handles it normally.
 */

/**
 * Drop‐in for the `global.fetch` option accepted by
 * `createBrowserClient`. Forwards the call to the native fetch and,
 * if the response matches the terminal-refresh-token pattern,
 * clears the local Supabase session state out-of-band.
 */
export const guardedFetch: typeof fetch = async (input, init) => {
  const res = await fetch(input, init);

  // Cheap match first to avoid parsing every response body.
  if (!isRefreshTokenRequest(input) || res.status !== 400) {
    return res;
  }

  try {
    const clone = res.clone();
    const body = (await clone.json()) as { error_code?: string } | null;
    if (body?.error_code === "refresh_token_not_found") {
      // eslint-disable-next-line no-console -- diagnostic breadcrumb is the point
      console.warn(
        "[supabase-refresh-guard] refresh_token_not_found — clearing local Supabase session to break retry loop. See incident memo incident_2026-05-24_auth_lockout_root_cause.",
      );
      clearLocalSupabaseSession();
    }
  } catch {
    // Response body wasn't JSON, or stream was already consumed by
    // another reader — leave it alone. The SDK will handle whatever
    // status code came back.
  }

  return res;
};

function isRefreshTokenRequest(input: Parameters<typeof fetch>[0]): boolean {
  let url: string;
  if (typeof input === "string") url = input;
  else if (input instanceof URL) url = input.toString();
  else if (input instanceof Request) url = input.url;
  else return false;
  // GoTrue's refresh endpoint is /auth/v1/token with the grant_type
  // either in the query string or in the JSON body. We match on the
  // path + query, which covers the JS SDK's call pattern.
  return url.includes("/auth/v1/token") && url.includes("grant_type=refresh_token");
}

/**
 * Remove every `sb-*` key from localStorage AND clear every `sb-*`
 * cookie at both host scope and the `.icareeros.com` parent scope.
 *
 * SSR-safe: each block guards on the presence of the relevant browser
 * global.
 */
function clearLocalSupabaseSession(): void {
  // localStorage — used by the SDK to persist the session even when
  // cookieOptions.domain is set. Both must be cleared.
  if (typeof localStorage !== "undefined") {
    try {
      const toRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.startsWith("sb-") || k.toLowerCase().includes("supabase"))) {
          toRemove.push(k);
        }
      }
      for (const k of toRemove) localStorage.removeItem(k);
    } catch {
      // Quota-exceeded / private-mode / disabled-storage — give up
      // quietly. The cookie clear below still helps.
    }
  }

  // Cookies — clear at both host scope and the .icareeros.com parent
  // scope. The SDK writes with parent-scope when on icareeros.com but
  // we don't know which host we are on right now, so we clear both
  // for defence-in-depth.
  if (typeof document !== "undefined") {
    try {
      const all = document.cookie.split(";");
      for (const raw of all) {
        const name = raw.split("=")[0]?.trim();
        if (!name) continue;
        if (!name.startsWith("sb-")) continue;
        const epoch = "Thu, 01 Jan 1970 00:00:00 UTC";
        document.cookie = `${name}=; expires=${epoch}; path=/`;
        document.cookie = `${name}=; expires=${epoch}; path=/; domain=.icareeros.com`;
        // Try the host-domain explicit form too (some browsers
        // distinguish it from "no domain attribute").
        if (typeof window !== "undefined" && window.location?.hostname) {
          document.cookie = `${name}=; expires=${epoch}; path=/; domain=${window.location.hostname}`;
        }
      }
    } catch {
      // document.cookie can throw in sandboxed iframes — same posture
      // as localStorage: give up silently.
    }
  }
}
