/**
 * /api/applications/[id]
 *
 * PATCH  — update one application row (status, notes, follow_up_*).
 * DELETE — remove one application row.
 *
 * Both operations are RLS-scoped to the calling user via the existing
 * "Users can {update,delete} own applications" policies. We additionally
 * verify the row belongs to the user before mutating so we can return a
 * clean 404 instead of relying on RLS silent-row hiding.
 *
 * Phase 5 Item 4 — see docs/specs/COWORK-BRIEF-phase5-v1.md.
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
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, withCrossSubdomainCookie(options)));
          } catch { /* server component context */ }
        },
      },
    },
  );
}

export type ApplicationStatus =
  | "researching" | "applying" | "applied"
  | "screening" | "interviewing" | "final_round"
  | "offer" | "accepted"
  | "rejected" | "withdrawn";

const VALID_STATUSES: ReadonlyArray<ApplicationStatus> =
  ["researching", "applying", "applied", "screening", "interviewing", "final_round", "offer", "accepted", "rejected", "withdrawn"];

interface PatchBody {
  status?:           ApplicationStatus;
  notes?:            string | null;
  job_title?:        string;
  company?:          string;
  job_url?:          string | null;
  follow_up_date?:   string | null;
  follow_up_notes?:  string | null;
  followed_up?:      boolean;
  interview_stage?:  string | null;
  outcome_detail?:   string | null;
}

function buildPatch(b: unknown): Record<string, unknown> | null {
  if (!b || typeof b !== "object") return null;
  const o = b as PatchBody;
  const patch: Record<string, unknown> = {};
  if (typeof o.status === "string") {
    if (!VALID_STATUSES.includes(o.status as ApplicationStatus)) return null;
    patch.status = o.status;
  }
  if (typeof o.notes === "string" || o.notes === null)             patch.notes = o.notes ?? "";
  if (typeof o.job_title === "string" && o.job_title.trim())       patch.job_title = o.job_title.trim();
  if (typeof o.company   === "string" && o.company.trim())         patch.company   = o.company.trim();
  if (typeof o.job_url   === "string" || o.job_url === null)       patch.job_url   = o.job_url;
  if (typeof o.follow_up_date  === "string" || o.follow_up_date  === null) patch.follow_up_date  = o.follow_up_date;
  if (typeof o.follow_up_notes === "string" || o.follow_up_notes === null) patch.follow_up_notes = o.follow_up_notes ?? "";
  if (typeof o.followed_up === "boolean")                          patch.followed_up = o.followed_up;
  if (typeof o.interview_stage === "string" || o.interview_stage === null) patch.interview_stage = o.interview_stage;
  if (typeof o.outcome_detail  === "string" || o.outcome_detail  === null) patch.outcome_detail  = o.outcome_detail;
  if (Object.keys(patch).length === 0) return null;
  patch.updated_at = new Date().toISOString();
  return patch;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "invalid_id" }, { status: 400 });

  const supabase = await makeSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "invalid_body" }, { status: 400 }); }

  const patch = buildPatch(body);
  if (!patch) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  // Ownership check — clean 404 instead of relying on RLS row-hiding silence.
  const { data: existing } = await supabase
    .from("applications")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!existing) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("applications")
    .update(patch)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id, user_id, cycle_id, opportunity_id, job_title, company, job_url, status, notes, applied_at, updated_at, follow_up_date, follow_up_notes, followed_up, outcome_detail, interview_stage")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "update_failed" }, { status: 500 });
  }
  return NextResponse.json({ application: data });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "invalid_id" }, { status: 400 });

  const supabase = await makeSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: existing } = await supabase
    .from("applications")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!existing) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { error } = await supabase
    .from("applications")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
