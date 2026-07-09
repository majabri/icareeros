/**
 * /auth/callback — PKCE code exchange handler.
 *
 * Supabase Auth sends a confirmation email containing a link to
 *   https://<project>.supabase.co/auth/v1/verify?token=...&redirect_to=https://icareeros.com/auth/callback
 *
 * After the token verifies, Supabase redirects to /auth/callback?code=<PKCE_CODE>.
 * We exchange the code for a session and then decide what to do based on
 * whether the caller passed an explicit `?next=` destination:
 *
 *   - No `next` provided (the email-signup confirmation case): we IMMEDIATELY
 *     sign the user out and redirect to /auth/login?confirmed=true so they
 *     are forced to authenticate with their password. This is the auth-hygiene
 *     posture — clicking a confirmation link should NOT also constitute proof
 *     of identity (the link could have been forwarded, the email account could
 *     be on a shared device, etc.).
 *
 *   - Explicit `next` provided (OAuth social login, linked-accounts flow):
 *     the user clicked an intentional "sign me in" / "link this account" UI,
 *     so we keep the session and forward them to the requested destination.
 *
 * If the code is missing or the exchange fails, we send the user back to
 * /auth/login with an error query so AuthForm can surface a helpful message.
 *
 * Password recovery (2026-07-07):
 *   - When the caller passes `?type=recovery` (set by
 *     `resetPasswordForEmail`\'s `redirectTo`), we exchange the code so
 *     the recovery session is established, then redirect to
 *     /auth/reset-password. This branch is additive — OAuth (`next=…`)
 *     and email-confirm (no `next`) paths are unchanged.
 */

import { createServerClient } from "@supabase/ssr";
import { withCrossSubdomainCookie } from "@/lib/supabase-cookie-options";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");

  // Detect whether the caller explicitly opted into a destination.
  // When `next` is absent we're in the signup-confirmation flow and will
  // force a fresh login. When `next` is provided (OAuth, linked-accounts)
  // we keep the session and forward.
  const explicitNext = url.searchParams.get("next");

  // Password recovery — resetPasswordForEmail sets ?type=recovery on
  // its redirectTo. After the code exchange we redirect to the
  // reset-password page WITH the session kept, so `updateUser` can
  // succeed there.
  const isRecovery = url.searchParams.get("type") === "recovery";

  if (!code) {
    return NextResponse.redirect(
      new URL("/auth/login?error=missing_code", req.url)
    );
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(toSet: Array<{ name: string; value: string; options?: import("@supabase/ssr").CookieOptions }>) {
          for (const c of toSet) {
            cookieStore.set(c.name, c.value, withCrossSubdomainCookie(c.options));
          }
        },
      },
    }
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      new URL(
        `/auth/login?error=verification_failed&detail=${encodeURIComponent(error.message)}`,
        req.url
      )
    );
  }

  // Password-recovery flow → keep session, forward to /auth/reset-password
  // where the user submits their new password. Placed BEFORE the
  // signup-confirmation branch so a recovery link never triggers the
  // sign-out-on-confirm rule.
  if (isRecovery) {
    return NextResponse.redirect(new URL("/auth/reset-password", req.url));
  }

  // Signup-confirmation flow → sign out, then bounce to login with banner.
  // Per auth-hygiene rule: an email link verifies the email, not the user.
  if (!explicitNext) {
    await supabase.auth.signOut();
    return NextResponse.redirect(
      new URL("/auth/login?confirmed=true", req.url)
    );
  }

  // Intentional sign-in flow (OAuth, linked accounts) → keep session.
  return NextResponse.redirect(new URL(explicitNext, req.url));
}
