/**
 * POST /api/hire/invite
 *
 * Phase 3 (2026-05-17). Recruiter→candidate outreach.
 *
 * Body shape:
 *   { candidateUserId: string;   // uuid
 *     jobTitle:        string;   // required, max 200 chars
 *     message?:        string;   // optional, max 500 chars }
 *
 * Gates:
 *   - 401 unauthenticated
 *   - 403 non-employer
 *   - 400 missing/invalid candidateUserId or jobTitle
 *   - 409 a PENDING invite already exists for this recruiter+candidate
 *         pair (returns `existingInviteId` so the UI can show "Already
 *         invited")
 *
 * On success: returns { inviteId, status: 'sent' }.
 *
 * RLS on recruiter_invites already enforces recruiter_user_id =
 * auth.uid() for INSERT plus an employer-role check, so the explicit
 * role gate here is defence in depth + cleaner error messaging.
 *
 * NOTE: distinct from the legacy public.talent_invites table, which
 * is for email-based onboarding invites. See migration
 * hired_phase3_employer_profiles_and_recruiter_invites.
 */

import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { withCrossSubdomainCookie } from "@/lib/supabase-cookie-options";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function makeSupabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cs: Array<{ name: string; value: string; options: CookieOptions }>) {
          cs.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, withCrossSubdomainCookie(options)),
          );
        },
      },
    },
  );
}

export async function POST(req: Request) {
  try {
    const supabase = await makeSupabaseServer();

    // ── Auth ──────────────────────────────────────────────────────
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── Role gate ─────────────────────────────────────────────────
    const { data: roleRows, error: roleErr } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);
    if (roleErr) {
      return NextResponse.json({ error: roleErr.message }, { status: 500 });
    }
    const isEmployer = (roleRows ?? []).some(
      (r) => (r as { role?: string }).role === "employer",
    );
    if (!isEmployer) {
      return NextResponse.json(
        { error: "Forbidden — employer role required" },
        { status: 403 },
      );
    }

    // ── Validate body ─────────────────────────────────────────────
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;

    const candidateUserId = typeof body.candidateUserId === "string"
      ? body.candidateUserId.trim()
      : "";
    if (!candidateUserId || !UUID_RE.test(candidateUserId)) {
      return NextResponse.json(
        { error: "candidateUserId must be a uuid" },
        { status: 400 },
      );
    }
    if (candidateUserId === user.id) {
      return NextResponse.json(
        { error: "Cannot invite yourself" },
        { status: 400 },
      );
    }

    const jobTitle = typeof body.jobTitle === "string"
      ? body.jobTitle.replace(/\s+/g, " ").trim()
      : "";
    if (!jobTitle) {
      return NextResponse.json(
        { error: "jobTitle is required" },
        { status: 400 },
      );
    }
    if (jobTitle.length > 200) {
      return NextResponse.json(
        { error: "jobTitle must be 200 characters or fewer" },
        { status: 400 },
      );
    }

    const message = typeof body.message === "string"
      ? body.message.trim().slice(0, 500)
      : "";

    // ── Dedup pending invite ──────────────────────────────────────
    const { data: existing, error: dupErr } = await supabase
      .from("recruiter_invites")
      .select("id")
      .eq("recruiter_user_id", user.id)
      .eq("candidate_user_id", candidateUserId)
      .eq("status", "pending")
      .maybeSingle();
    if (dupErr) {
      return NextResponse.json({ error: dupErr.message }, { status: 500 });
    }
    if (existing?.id) {
      return NextResponse.json(
        {
          error:            "Invite already sent",
          existingInviteId: existing.id,
        },
        { status: 409 },
      );
    }

    // ── Insert ────────────────────────────────────────────────────
    const { data: inserted, error: insErr } = await supabase
      .from("recruiter_invites")
      .insert({
        recruiter_user_id: user.id,
        candidate_user_id: candidateUserId,
        job_title:         jobTitle,
        message,
        status:            "pending",
      })
      .select("id")
      .single();

    if (insErr) {
      // Race-condition fallback: unique index on (recruiter, candidate)
      // WHERE status='pending' could fire if a concurrent invite slipped
      // in between the maybeSingle() check and this insert.
      if (typeof insErr.code === "string" && insErr.code === "23505") {
        return NextResponse.json(
          { error: "Invite already sent" },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }

    return NextResponse.json(
      { inviteId: inserted.id, status: "sent" },
      { status: 201 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
