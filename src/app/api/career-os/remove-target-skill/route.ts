/**
 * POST /api/career-os/remove-target-skill   (Sprint 5 hotfix, 2026-05-15)
 *
 * Removes one or more skills from `career_profiles.target_skills`.
 *
 * Used when the user marks a skill as "I already have this" via ✅ on
 * the dual-button skill pills — once a skill is on the profile, it no
 * longer makes sense to keep it as a target. /api/career-os/add-profile-skill
 * already removes them atomically server-side; this endpoint exists so
 * the client-side `useTargetSkills.remove()` method can keep its local
 * state in sync with a real DB write (idempotent — a redundant remove
 * is a no-op).
 *
 * POST body:  { skills: string[] }
 * POST reply: { removed: string[]; skipped: string[]; target_skills: string[] }
 */

import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { withCrossSubdomainCookie } from "@/lib/supabase-cookie-options";
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
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, withCrossSubdomainCookie(options))
          );
        },
      },
    }
  );
}

function normalize(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

export async function POST(req: Request) {
  try {
    const supabase = await makeSupabaseServer();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({})) as { skills?: unknown };
    if (!Array.isArray(body.skills) || body.skills.some((s) => typeof s !== "string")) {
      return NextResponse.json(
        { error: "Request body must be { skills: string[] }" },
        { status: 400 },
      );
    }

    const incoming = (body.skills as string[]).map(normalize).filter((s) => s.length > 0);
    if (incoming.length === 0) {
      return NextResponse.json({ removed: [], skipped: [], target_skills: [] });
    }

    const { data: profile, error: readErr } = await supabase
      .from("career_profiles")
      .select("target_skills")
      .eq("user_id", user.id)
      .maybeSingle();

    if (readErr) {
      return NextResponse.json({ error: readErr.message }, { status: 500 });
    }
    if (!profile) {
      return NextResponse.json(
        { error: "No career profile found — visit /mycareer/profile to create one." },
        { status: 404 },
      );
    }

    const current: string[] = (profile.target_skills as string[] | null) ?? [];
    const dropLower = new Set(incoming.map((s) => s.toLowerCase()));

    const next: string[] = [];
    const removed: string[] = [];
    for (const s of current) {
      if (dropLower.has(s.toLowerCase())) {
        removed.push(s);
      } else {
        next.push(s);
      }
    }

    // skipped = incoming entries that weren't actually in target_skills
    const removedLower = new Set(removed.map((s) => s.toLowerCase()));
    const skipped = incoming.filter((s) => !removedLower.has(s.toLowerCase()));

    if (removed.length === 0) {
      return NextResponse.json({ removed, skipped, target_skills: current });
    }

    const { error: updErr } = await supabase
      .from("career_profiles")
      .update({ target_skills: next })
      .eq("user_id", user.id);

    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }

    return NextResponse.json({ removed, skipped, target_skills: next });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
