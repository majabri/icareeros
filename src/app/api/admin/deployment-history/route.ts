/**
 * GET /api/admin/deployment-history
 *
 * Returns the last N rows from `public.deployment_history` for the admin
 * surface (/admin/system → AdminDeployHistory). Admin-gated via the same
 * pattern as /api/admin/feature-flags (caller must have role=admin in
 * public.profiles, joined by profiles.user_id = auth.uid()).
 *
 * Bypasses RLS by reading via the service-role client. RLS still protects
 * against unauthenticated/non-admin direct database access; this route is
 * the only safe path for client-side admin UIs to read the table.
 *
 * Created in the UAT-1 fix wave (2026-05-13) — replaces the broken
 * client-side Supabase read in AdminDeployHistory.tsx.
 */

import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { withCrossSubdomainCookie } from "@/lib/supabase-cookie-options";
import type { CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

async function makeSupabaseSession() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(
          cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>,
        ) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, withCrossSubdomainCookie(options)),
          );
        },
      },
    },
  );
}

async function requireAdmin() {
  const supabase = await makeSupabaseSession();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { user: null, adminErr: "Unauthorized" as const };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (profile?.role !== "admin")
    return { user, adminErr: "Forbidden" as const };
  return { user, adminErr: null };
}

export async function GET() {
  try {
    const { adminErr } = await requireAdmin();
    if (adminErr) {
      return NextResponse.json(
        { error: adminErr },
        { status: adminErr === "Unauthorized" ? 401 : 403 },
      );
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return NextResponse.json({ error: "Supabase env missing" }, { status: 500 });
    }

    const sb = createServiceClient(url, key, { auth: { persistSession: false } });
    const { data, error } = await sb
      .from("deployment_history")
      .select("id, vercel_deployment_id, vercel_url, environment, branch, commit_sha, commit_message, state, created_at, ready_at, gate_decision, gate_rationale")
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ deployments: data ?? [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
