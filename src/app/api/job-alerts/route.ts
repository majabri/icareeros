import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

function makeSupabaseClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get:    (name)         => cookieStore.get(name)?.value,
        set:    (name, value, opts) => { try { cookieStore.set({ name, value, ...opts }); } catch {} },
        remove: (name, opts)   => { try { cookieStore.set({ name, value: "", ...opts }); } catch {} },
      },
    }
  );
}

// GET — fetch the current user's alert subscription
export async function GET() {
  const supabase = makeSupabaseClient();

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("job_alert_subscriptions")
    .select("id, query, is_remote, job_type, frequency, is_active, last_sent_at, created_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[job-alerts GET] db error:", error.message);
    return NextResponse.json({ error: "Failed to fetch subscription" }, { status: 500 });
  }

  return NextResponse.json({ subscription: data ?? null });
}

// POST — upsert (create or update) the current user's alert subscription
export async function POST(req: NextRequest) {
  const supabase = makeSupabaseClient();

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { query?: string; is_remote?: boolean; job_type?: string; frequency?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { query, is_remote = false, job_type, frequency = "daily" } = body;

  if (!["daily", "weekly"].includes(frequency)) {
    return NextResponse.json(
      { error: 'frequency must be "daily" or "weekly"' },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("job_alert_subscriptions")
    .upsert(
      {
        user_id:   user.id,
        query:     query ?? null,
        is_remote: is_remote ?? false,
        job_type:  job_type ?? null,
        frequency,
        is_active: true,
      },
      { onConflict: "user_id" }
    )
    .select("id, query, is_remote, job_type, frequency, is_active, last_sent_at, created_at")
    .single();

  if (error) {
    console.error("[job-alerts POST] db error:", error.message);
    return NextResponse.json({ error: "Failed to save subscription" }, { status: 500 });
  }

  return NextResponse.json({ subscription: data }, { status: 201 });
}

// DELETE — deactivate (soft-delete) the current user's alert subscription
export async function DELETE() {
  const supabase = makeSupabaseClient();

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { error } = await supabase
    .from("job_alert_subscriptions")
    .update({ is_active: false })
    .eq("user_id", user.id);

  if (error) {
    console.error("[job-alerts DELETE] db error:", error.message);
    return NextResponse.json({ error: "Failed to deactivate subscription" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
