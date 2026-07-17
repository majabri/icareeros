/**
 * /auth/confirm — token_hash verification handler.
 *
 * Called by links in the branded confirmation email:
 *   https://icareeros.com/auth/confirm?token_hash=<hash>&type=signup
 *
 * The user NEVER sees supabase.co — verification happens server-side via
 * supabase.auth.verifyOtp(), which exchanges the token_hash for a session
 * and sets the auth cookies.
 *
 * Post-verification routing depends on the OTP type:
 *
 *   - `signup` (email confirmation after sign-up): we IMMEDIATELY sign the
 *     user out and redirect to /auth/login?confirmed=true. Clicking a
 *     confirmation link verifies the EMAIL ADDRESS, not the user's identity
 *     — the link could be forwarded, the inbox could be on a shared device.
 *     Forcing a password sign-in after confirmation is the safer default.
 *
 *   - `recovery` (password reset): we keep the session (verifyOtp establishes
 *     the recovery session so `updateUser({ password })` succeeds) and forward
 *     to /auth/reset-password by default. Callers can still override via `next`.
 *
 *   - `magiclink`, `email_change`, `invite` and any other type:
 *     the user has actively initiated a sign-in / account-change flow and
 *     expects to be authenticated. Keep the session and forward to `next`.
 *
 * This complements /auth/callback (PKCE code exchange). Old links generated
 * by signUp({ emailRedirectTo: ... }) still hit /auth/callback; new template
 * links use this token_hash flow which keeps the URL on our domain.
 */

import { createServerClient } from "@supabase/ssr";
import { withCrossSubdomainCookie } from "@/lib/supabase-cookie-options";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = (url.searchParams.get("type") ?? "signup") as EmailOtpType;
  const next = url.searchParams.get("next") || "/dashboard";

  if (!tokenHash) {
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

  const { error } = await supabase.auth.verifyOtp({
    type,
    token_hash: tokenHash,
  });

  if (error) {
    return NextResponse.redirect(
      new URL(
        `/auth/login?error=verification_failed&detail=${encodeURIComponent(error.message)}`,
        req.url
      )
    );
  }

  // Signup confirmation → sign out, force password login.
  if (type === "signup") {
    await supabase.auth.signOut();
    return NextResponse.redirect(
      new URL("/auth/login?confirmed=true", req.url)
    );
  }

  // Password recovery — keep session (so /auth/reset-password can call
  // updateUser({password})) and land the user on the reset form unless
  // the caller passed an explicit `next`. This branch is what makes
  // `/auth/confirm?token_hash=...&type=recovery` a working destination
  // for the Supabase Send Email Hook (feat/platform-auth-send-email-hook).
  // The pre-existing `/auth/callback?type=recovery` PKCE path stays
  // functional as a fallback for legacy links in flight and as an
  // emergency roll-back surface if the hook needs to be disabled.
  if (type === "recovery") {
    const dest = url.searchParams.get("next") ?? "/auth/reset-password";
    return NextResponse.redirect(new URL(dest, req.url));
  }

  // Magic link / invite / email_change → keep session, forward.
  return NextResponse.redirect(new URL(next, req.url));
}
