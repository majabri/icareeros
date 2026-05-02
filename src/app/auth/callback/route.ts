/**
 * /auth/callback — PKCE code exchange handler.
 *
 * Supabase Auth sends a confirmation email containing a link to
 *   https://<project>.supabase.co/auth/v1/verify?token=...&redirect_to=https://icareeros.com/auth/callback
 *
 * After the token verifies, Supabase redirects to /auth/callback?code=<PKCE_CODE>.
 * We exchange the code for a session (which sets the auth cookies) and then
 * redirect the user to a branded confirmation page.
 *
 * If the code is missing or the exchange fails, we send the user back to
 * /auth/login with an error query so AuthForm can surface a helpful message.
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");

  // Allow callers to override the success destination (?next=/dashboard)
  // for sign-in-with-magic-link or future OAuth flows. Fall back to the
  // branded /auth/confirmed page for email-confirmation specifically.
  const next = url.searchParams.get("next") || "/auth/confirmed";

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
        setAll(toSet) {
          for (const c of toSet) {
            cookieStore.set(c.name, c.value, c.options);
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

  return NextResponse.redirect(new URL(next, req.url));
}
