/**
 * POST /api/email/send
 *
 * Internal transactional email endpoint.
 * Protected: requires a valid Supabase session OR the INTERNAL_API_SECRET header.
 *
 * Body: { to: string | string[], subject: string, html: string, text?: string }
 * Response: { ok: true, messageId?: string, skipped?: boolean } | { error: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { sendMail } from "@/lib/mailer";

// ── Supabase server client ─────────────────────────────────────────────────────

async function makeSupabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(
          cookiesToSet: Array<{
            name: string;
            value: string;
            options: CookieOptions;
          }>,
        ) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server component — ignore
          }
        },
      },
    },
  );
}

// ── Auth check ─────────────────────────────────────────────────────────────────

async function isAuthorised(req: NextRequest): Promise<boolean> {
  // 1. Internal secret (server-to-server: cron jobs, edge functions)
  const secret = process.env.INTERNAL_API_SECRET;
  if (secret && req.headers.get("x-internal-secret") === secret) return true;

  // 2. Valid Supabase user session (cookie-based)
  try {
    const supabase = await makeSupabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) return true;
  } catch {
    // ignore
  }

  return false;
}

// ── Route handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!(await isAuthorised(req))) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { to, subject, html, text } = body as {
    to?: unknown;
    subject?: unknown;
    html?: unknown;
    text?: unknown;
  };

  if (!to || !subject || !html) {
    return NextResponse.json(
      { error: "Missing required fields: to, subject, html" },
      { status: 400 },
    );
  }

  if (
    (typeof to !== "string" && !Array.isArray(to)) ||
    typeof subject !== "string" ||
    typeof html !== "string"
  ) {
    return NextResponse.json({ error: "Invalid field types" }, { status: 400 });
  }

  try {
    const result = await sendMail({
      to: to as string | string[],
      subject,
      html,
      text: typeof text === "string" ? text : undefined,
    });

    return NextResponse.json({
      ok: true,
      messageId: result?.messageId ?? null,
      skipped: result === null,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Mail send failed";
    console.error("[/api/email/send]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
