/**
 * /auth/confirm — token_hash verification handler.
 *
 * Called by links in the branded confirmation email:
 *   https://icareeros.com/auth/confirm?token_hash=<hash>&type=signup
 *
 * The user NEVER sees supabase.co — verification happens server-side via
 * supabase.auth.verifyOtp(), which exchanges the token_hash for a session
 * and sets the auth cookies. On success, we redirect to /auth/confirmed.
 *
 * This complements /auth/callback (PKCE code exchange). Old links generated
 * by signUp({ emailRedirectTo: ... }) still hit /auth/callback; new template
 * links use this token_hash flow which keeps the URL on our domain.
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = (url.searchParams.get("type") ?? "signup") as EmailOtpType;
  const next = url.searchParams.get("next") || "/auth/confirmed";

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
            cookieStore.set(c.name, c.value, c.options);
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

  return NextResponse.redirect(new URL(next, req.url));
}
