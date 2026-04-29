/**
 * GET /api/settings/export
 * Collect all data owned by the current user and return as a JSON download.
 * Uses service role key to bypass per-table RLS (user is already authenticated).
 */

import { NextResponse } from "next/server";
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

export async function GET() {
  // Auth check via cookie session
  const supabase = await makeSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const svc = makeServiceClient();
  const uid = user.id;

  // Collect data from all user-scoped tables (best-effort — skip if table doesn't exist)
  const tables: Record<string, unknown[]> = {};

  const fetches: Array<[string, string]> = [
    ["career_os_cycles",   "id, current_stage, created_at, updated_at"],
    ["opportunities",      "id, title, company, location, salary_min, salary_max, source, created_at"],
    ["alert_subscriptions","id, query, frequency, location, created_at"],
    ["resume_versions",    "id, version_name, job_type, created_at"],
    ["job_offers",         "id, company, role_title, base_salary, total_comp, status, created_at"],
    ["email_preferences",  "weekly_insights, job_alerts, marketing, updated_at"],
    ["support_tickets",    "id, subject, priority, status, created_at"],
  ];

  await Promise.all(
    fetches.map(async ([table, select]) => {
      const { data } = await svc
        .from(table)
        .select(select)
        .eq("user_id", uid)
        .order("created_at", { ascending: true })
        .limit(1000);
      tables[table] = data ?? [];
    }),
  );

  const payload = {
    exported_at: new Date().toISOString(),
    user: { id: user.id, email: user.email, created_at: user.created_at },
    data: tables,
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="icareeros-data-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
