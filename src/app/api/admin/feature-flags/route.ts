/**
 * GET  /api/admin/feature-flags          → list all feature flags
 * PATCH /api/admin/feature-flags          → toggle a flag  { key: string, enabled: boolean }
 *
 * Admin-only: caller must be authenticated as majabri714@gmail.com.
 * Uses the service-role key via SUPABASE_SERVICE_ROLE_KEY if available,
 * otherwise falls back to anon key (RLS must allow admin writes).
 */

import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

const ADMIN_EMAIL = "majabri714@gmail.com";

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
          }>
        ) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );
}

async function requireAdmin() {
  const supabase = await makeSupabaseServer();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return { supabase, user: null, adminErr: "Unauthorized" };
  if (user.email !== ADMIN_EMAIL)
    return { supabase, user, adminErr: "Forbidden" };
  return { supabase, user, adminErr: null };
}

// ── GET — list all flags ──────────────────────────────────────────────────────

export async function GET() {
  try {
    const { supabase, adminErr } = await requireAdmin();
    if (adminErr)
      return NextResponse.json({ error: adminErr }, { status: adminErr === "Unauthorized" ? 401 : 403 });

    const { data, error } = await supabase
      .from("feature_flags")
      .select("key, enabled, updated_at")
      .order("key");

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ flags: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── PATCH — toggle a flag ─────────────────────────────────────────────────────

export async function PATCH(req: Request) {
  try {
    const { supabase, adminErr } = await requireAdmin();
    if (adminErr)
      return NextResponse.json({ error: adminErr }, { status: adminErr === "Unauthorized" ? 401 : 403 });

    const body = (await req.json()) as { key?: string; enabled?: boolean };
    if (typeof body.key !== "string" || typeof body.enabled !== "boolean") {
      return NextResponse.json(
        { error: "Body must be { key: string, enabled: boolean }" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("feature_flags")
      .update({ enabled: body.enabled, updated_at: new Date().toISOString() })
      .eq("key", body.key)
      .select("key, enabled, updated_at")
      .single();

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data)
      return NextResponse.json({ error: "Flag not found" }, { status: 404 });

    return NextResponse.json({ flag: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
