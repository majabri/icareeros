/**
 * POST /api/settings/delete-account
 * Permanently delete the authenticated user's account and all their data.
 *
 * Requires: { confirm: "DELETE" } in the request body as an explicit safety check.
 *
 * Process:
 *  1. Verify the user is authenticated.
 *  2. Verify the confirmation string.
 *  3. Delete all user-owned rows (RLS tables) via service role — cascade handles FKs.
 *  4. Delete the auth user record via admin API.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

async function makeSupabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch { /* server component */ }
        },
      },
    },
  );
}

function makeServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

// Tables to purge in order (respect FK dependencies — children before parents)
const USER_TABLES = [
  "support_tickets",
  "email_preferences",
  "job_offers",
  "resume_versions",
  "alert_subscriptions",
  "opportunities",
  "career_os_cycles",
] as const;

export async function POST(req: NextRequest) {
  const supabase = await makeSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  // Safety confirmation
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { confirm } = body as { confirm?: unknown };
  if (confirm !== "DELETE") {
    return NextResponse.json(
      { error: 'Body must include { "confirm": "DELETE" }' },
      { status: 400 },
    );
  }

  const svc = makeServiceClient();
  const uid = user.id;

  // Purge user-owned rows from all tables
  for (const table of USER_TABLES) {
    await svc.from(table).delete().eq("user_id", uid);
    // Ignore errors — table may not have rows or may not exist yet
  }

  // Delete the auth user (this also removes auth.users entry and cascades)
  const { error: deleteErr } = await svc.auth.admin.deleteUser(uid);
  if (deleteErr) {
    return NextResponse.json(
      { error: `Failed to delete account: ${deleteErr.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ deleted: true });
}
