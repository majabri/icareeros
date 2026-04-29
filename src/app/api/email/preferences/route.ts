/**
 * GET  /api/email/preferences  — fetch current user's email preferences
 * POST /api/email/preferences  — upsert current user's email preferences
 * GET  /api/email/preferences?token=<unsubscribe_token> — unsubscribe (no auth needed)
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import type { CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

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

export interface EmailPreferences {
  id: string;
  weekly_insights: boolean;
  job_alerts: boolean;
  marketing: boolean;
  unsubscribe_token: string;
  updated_at: string;
}

// ── GET ────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  // Unsubscribe via token (no auth required)
  const token = req.nextUrl.searchParams.get("token");
  if (token) {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) {
      return NextResponse.json({ error: "Service not configured" }, { status: 500 });
    }
    const serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceKey,
    );
    const { error } = await serviceClient
      .from("email_preferences")
      .update({ weekly_insights: false, job_alerts: false })
      .eq("unsubscribe_token", token);

    if (error) {
      return NextResponse.json({ error: "Invalid unsubscribe token" }, { status: 400 });
    }
    return NextResponse.json({ ok: true, message: "Unsubscribed successfully" });
  }

  // Authenticated fetch
  const supabase = await makeSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { data, error } = await supabase
    .from("email_preferences")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (error && error.code !== "PGRST116") {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Return defaults if no row yet
  if (!data) {
    return NextResponse.json({
      preferences: null, // null = use defaults (weekly_insights: true, job_alerts: true)
    });
  }

  return NextResponse.json({ preferences: data as EmailPreferences });
}

// ── POST ───────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const supabase = await makeSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { weekly_insights, job_alerts, marketing } = body as {
    weekly_insights?: boolean;
    job_alerts?: boolean;
    marketing?: boolean;
  };

  const update: Record<string, boolean> = {};
  if (typeof weekly_insights === "boolean") update.weekly_insights = weekly_insights;
  if (typeof job_alerts === "boolean") update.job_alerts = job_alerts;
  if (typeof marketing === "boolean") update.marketing = marketing;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("email_preferences")
    .upsert({ user_id: user.id, ...update }, { onConflict: "user_id" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ preferences: data as EmailPreferences });
}
