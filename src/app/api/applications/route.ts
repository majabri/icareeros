/**
 * /api/applications
 *
 * GET   — list the calling user's applications (filtered by ?status=, sorted
 *         newest-first by applied_at by default).
 * POST  — create a new application row. cycle_id is auto-filled from the
 *         user's current active Career OS cycle when omitted.
 *
 * Phase 5 Item 4 — see docs/specs/COWORK-BRIEF-phase5-v1.md.
 *
 * No new edge functions per CLAUDE.md. The existing applications table +
 * RLS policies (insert/select/update/delete on auth.uid() = user_id) cover
 * authorization; route handlers just wrap the queries.
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

interface CreateBody {
  job_title:      string;
  company:        string;
  job_url?:       string | null;
  status?:        ApplicationStatus;
  notes?:         string | null;
  opportunity_id?: string | null;
  applied_at?:    string | null;
}

function isCreateBody(b: unknown): b is CreateBody {
  if (!b || typeof b !== "object") return false;
  const o = b as Record<string, unknown>;
  return typeof o.job_title === "string" && o.job_title.trim().length > 0
    && typeof o.company === "string" && o.company.trim().length > 0;
}

export async function GET(req: Request) {
  const supabase = await makeSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const statusFilter = url.searchParams.get("status");
  const sort = url.searchParams.get("sort") ?? "applied_at_desc";

  let q = supabase
    .from("applications")
    .select("id, user_id, cycle_id, opportunity_id, job_title, company, job_url, status, notes, applied_at, updated_at, follow_up_date, follow_up_notes, followed_up, outcome_detail, interview_stage")
    .eq("user_id", user.id);

  if (statusFilter && VALID_STATUSES.includes(statusFilter as ApplicationStatus)) {
    q = q.eq("status", statusFilter);
  }

  if (sort === "applied_at_asc")     q = q.order("applied_at", { ascending: true });
  else if (sort === "status_asc")    q = q.order("status",     { ascending: true }).order("applied_at", { ascending: false });
  else                               q = q.order("applied_at", { ascending: false });

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ applications: data ?? [] });
}

export async function POST(req: Request) {
  const supabase = await makeSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "invalid_body" }, { status: 400 }); }
  if (!isCreateBody(body)) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const status: ApplicationStatus = body.status && VALID_STATUSES.includes(body.status)
    ? body.status
    : "applied";

  // Auto-fill cycle_id from the user's currently-active cycle when not provided
  // by the caller. Best-effort — we don't fail the create if there is none.
  let cycleId: string | null = null;
  const { data: activeCycle } = await supabase
    .from("career_os_cycles")
    .select("id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("cycle_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (activeCycle?.id) cycleId = activeCycle.id;

  const insertRow = {
    user_id:       user.id,
    cycle_id:      cycleId,
    opportunity_id: typeof body.opportunity_id === "string" ? body.opportunity_id : null,
    job_title:     body.job_title.trim(),
    company:       body.company.trim(),
    job_url:       typeof body.job_url === "string" && body.job_url.trim().length > 0 ? body.job_url.trim() : null,
    status,
    notes:         typeof body.notes === "string" ? body.notes : "",
    applied_at:    body.applied_at ?? new Date().toISOString(),
    updated_at:    new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("applications")
    .insert(insertRow)
    .select("id, user_id, cycle_id, opportunity_id, job_title, company, job_url, status, notes, applied_at, updated_at, follow_up_date, follow_up_notes, followed_up, outcome_detail, interview_stage")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "insert_failed" }, { status: 500 });
  }
  return NextResponse.json({ application: data }, { status: 200 });
}
