/**
 * Cross-tab single-flight lock for Supabase Auth refresh.
 *
 * Why this exists — 2026-05-24/25 production lockout:
 *
 *   - `src/lib/supabase.ts` scopes the auth cookie to `.icareeros.com`
 *     (2026-05-17 subdomain hotfix) so a session is shared across
 *     icareeros.com, jobs.icareeros.com, and hire.icareeros.com.
 *
 *   - Every browser tab on any of those subdomains instantiates a
 *     `@supabase/ssr` browser client. Each client runs its own
 *     auto-refresh timer.
 *
 *   - When the access token approaches expiry, ALL open tabs race to
 *     `POST /auth/v1/token?grant_type=refresh_token` with the same
 *     refresh_token. The first request succeeds and INVALIDATES the
 *     token. Every other tab's parallel request fails with
 *     `refresh_token_already_used`.
 *
 *   - `@supabase/auth-js` retries on that error, the bucket fires
 *     "Possible abuse attempt: 9840", and within seconds the
 *     project-wide `/token` rate-limit bucket is exhausted —
 *     `over_request_rate_limit` 429s for everyone, including existing
 *     logged-in users.
 *
 *   - This happened on 2026-05-23/24 and locked the production app out
 *     for ~26 hours. See `incident_2026-05-24_auth_lockout_smtp`.
 *
 * The fix is a cross-tab mutex around refresh. Only one tab at a time
 * may execute the refresh flow; the others wait. The Web Locks API
 * (`navigator.locks.request`) gives us exactly those semantics, scoped
 * per-origin, and the Supabase JS client already exposes a pluggable
 * `auth.lock` hook to receive a custom locker.
 *
 * Compatibility:
 *
 *   - Web Locks API is supported in every evergreen browser since
 *     ~2022-03 (Safari 15.4+).
 *   - When the API is unavailable (very old browsers, server-side
 *     rendering pre-hydration, some embedded WebViews, or test
 *     environments without `navigator`), we fall back to running the
 *     callback directly. That preserves correctness within a single
 *     tab and degrades to the previous behaviour.
 *   - The `acquireTimeout` argument is honoured by an
 *     `AbortController` so a deadlock cannot block indefinitely.
 */

/**
 * Lock function signature expected by `@supabase/auth-js`. See
 * `@supabase/auth-js/dist/module/lib/locks.d.ts` for the upstream
 * type — we keep our own copy here to avoid taking a direct
 * dependency on a transitive package.
 */
export type LockFn = <R>(
  name: string,
  acquireTimeout: number,
  fn: () => Promise<R>,
) => Promise<R>;

interface NavigatorWithLocks {
  locks?: {
    request: (
      name: string,
      options: { mode?: "exclusive" | "shared"; signal?: AbortSignal },
      callback: () => Promise<unknown>,
    ) => Promise<unknown>;
  };
}

function hasNavigatorLocks(): boolean {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as NavigatorWithLocks;
  return Boolean(nav.locks && typeof nav.locks.request === "function");
}

/**
 * Acquire a global exclusive lock named `name`, then run `fn`. Other
 * callers (in this tab or other tabs of the same origin family) that
 * request the same lock will queue behind it.
 *
 * If `acquireTimeout` is positive, the lock attempt is aborted after
 * that many milliseconds and the returned promise rejects with the
 * underlying `AbortError`.
 *
 * If the Web Locks API isn't available, we just run `fn` directly so
 * the single-tab case continues to work.
 */
export const navigatorLock: LockFn = async <R>(
  name: string,
  acquireTimeout: number,
  fn: () => Promise<R>,
): Promise<R> => {
  if (!hasNavigatorLocks()) {
    return fn();
  }

  const nav = navigator as NavigatorWithLocks;
  const controller = new AbortController();
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  if (acquireTimeout > 0) {
    timeoutHandle = setTimeout(() => controller.abort(), acquireTimeout);
  }

  try {
    const result = await nav.locks!.request(
      name,
      { mode: "exclusive", signal: controller.signal },
      async () => {
        return await fn();
      },
    );
    return result as R;
  } finally {
    if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
  }
};
