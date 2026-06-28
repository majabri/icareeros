/**
 * /api/applications/[id]/events
 *
 * GET  — list events for one application, newest first.
 * POST — append a manual event (e.g., user adds a note from the timeline UI).
 *
 * Status-change events are auto-logged from the PATCH handler in
 * /api/applications/[id]/route.ts, so the UI does not need to call POST
 * for the common case.
 */

import { NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { withCrossSubdomainCookie } from "@/lib/supabase-cookie-options";
import { cookies } from "next/headers";

async function makeSupabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll(toSet: Array<{ name: string; value: string; options: CookieOptions }>) {
          try { toSet.forEach(({name,value,options}) => cookieStore.set(name, value, withCrossSubdomainCookie(options))); }
          catch { /* server-component */ }
        },
      },
    },
  );
}

const VALID_EVENT_TYPES = [
  "created", "status_changed", "note", "follow_up",
  "interview_scheduled", "interview_completed",
  "offer_received", "offer_accepted", "rejected", "withdrawn",
] as const;

type EventType = typeof VALID_EVENT_TYPES[number];

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  const supabase = await makeSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("application_events")
    .select("id, application_id, event_type, metadata, created_at")
    .eq("application_id", id)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ events: data ?? [] });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  const supabase = await makeSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { event_type?: string; metadata?: Record<string, unknown> };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "invalid_body" }, { status: 400 }); }

  const eventType = body.event_type;
  if (!eventType || !VALID_EVENT_TYPES.includes(eventType as EventType)) {
    return NextResponse.json({ error: "invalid_event_type" }, { status: 400 });
  }

  // Ownership check
  const { data: appRow } = await supabase
    .from("applications").select("id").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!appRow) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { data, error } = await supabase
    .from("application_events")
    .insert({
      user_id:        user.id,
      application_id: id,
      event_type:     eventType,
      metadata:       body.metadata ?? {},
    })
    .select("id, application_id, event_type, metadata, created_at")
    .single();

  if (error || !data) return NextResponse.json({ error: error?.message ?? "insert_failed" }, { status: 500 });
  return NextResponse.json({ event: data }, { status: 201 });
}
