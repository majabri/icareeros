/**
 * /api/job-alerts
 *
 * GET  — fetch the authenticated user's current alert subscription
 * POST — create or update (upsert) the user's alert subscription
 * DELETE — deactivate the user's alert subscription
 */

import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

// ── Helpers ───────────────────────────────────────────────────────────────────

async function makeSupabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );
}

// ── GET — fetch current subscription ─────────────────────────────────────────

export async function GET() {
  try {
    const supabase = await makeSupabaseServer();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("job_alert_subscriptions")
      .select("id, query, is_remote, job_type, frequency, is_active, last_sent_at, created_at")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) throw error;

    return NextResponse.json({ subscription: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("[job-alerts GET] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── POST — upsert subscription ────────────────────────────────────────────────

export interface JobAlertSubscription {
  query?: string | null;
  is_remote?: boolean;
  job_type?: string | null;
  frequency?: "daily" | "weekly";
}

export async function POST(req: Request) {
  try {
    const supabase = await makeSupabaseServer();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({})) as JobAlertSubscription;
    const { query, is_remote, job_type, frequency } = body;

    if (frequency && !["daily", "weekly"].includes(frequency)) {
      return NextResponse.json({ error: "frequency must be 'daily' or 'weekly'" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("job_alert_subscriptions")
      .upsert(
        {
          user_id: user.id,
          query: query ?? null,
          is_remote: is_remote ?? false,
          job_type: job_type ?? null,
          frequency: frequency ?? "daily",
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      )
      .select("id, query, is_remote, job_type, frequency, is_active, created_at")
      .single();

    if (error) throw error;

    return NextResponse.json({ subscription: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("[job-alerts POST] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── DELETE — deactivate subscription ─────────────────────────────────────────

export async function DELETE() {
  try {
    const supabase = await makeSupabaseServer();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { error } = await supabase
      .from("job_alert_subscriptions")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("user_id", user.id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("[job-alerts DELETE] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
