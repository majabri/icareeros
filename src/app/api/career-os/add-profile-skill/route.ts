/**
 * POST /api/career-os/add-profile-skill   (Sprint 5 hotfix, 2026-05-15)
 * GET  /api/career-os/add-profile-skill   — list current career_profiles.skills
 *
 * Parallel to /api/career-os/add-target-skill, but operates on
 * `career_profiles.skills` ("skills I already have") instead of
 * `career_profiles.target_skills` ("skills I want to learn").
 *
 * Used by the dual-button skill pills on /evaluate, /advise, and /learn
 * so the user can mark a skill as either "want to learn" (🎯) or
 * "already have" (✅) independently — both, either, or neither.
 *
 * Side-effect: once a skill is on the profile it no longer makes sense
 * to keep it on the target list ("things I want to learn"), so this
 * route also REMOVES any added skill from `career_profiles.target_skills`
 * in the same DB update — atomic from the user's POV. The list of
 * removed skills comes back as `removedFromTargets` so the client can
 * keep its target-skills cache in sync.
 *
 * POST body:  { skills: string[] }
 * POST reply: {
 *   added:              string[];
 *   skipped:            string[];
 *   skills:             string[];   // new career_profiles.skills
 *   removedFromTargets: string[];   // entries dropped from target_skills
 * }
 * GET reply:  { skills: string[] }
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

function normalize(skill: string): string {
  return skill.replace(/\s+/g, " ").trim();
}

export async function GET() {
  try {
    const supabase = await makeSupabaseServer();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("career_profiles")
      .select("skills")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const skills = (data?.skills as string[] | null) ?? [];
    return NextResponse.json({ skills });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
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

    const incoming = (body.skills as string[])
      .map(normalize)
      .filter((s) => s.length > 0);

    if (incoming.length === 0) {
      return NextResponse.json({ added: [], skipped: [], skills: [] });
    }

    const { data: profile, error: readErr } = await supabase
      .from("career_profiles")
      .select("skills, target_skills")
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

    const current: string[] = (profile.skills as string[] | null) ?? [];
    const currentLower = new Set(current.map((s) => s.toLowerCase()));

    const added: string[] = [];
    const skipped: string[] = [];
    const seenInBatch = new Set<string>();

    for (const s of incoming) {
      const key = s.toLowerCase();
      if (currentLower.has(key) || seenInBatch.has(key)) {
        skipped.push(s);
      } else {
        added.push(s);
        seenInBatch.add(key);
      }
    }

    if (added.length === 0) {
      // Nothing to add. Don't touch target_skills either — `skipped`
      // skills were already on the profile (or duplicates within the
      // batch). They may or may not also be on target_skills; leaving
      // that as-is preserves user intent.
      return NextResponse.json({
        added,
        skipped,
        skills: current,
        removedFromTargets: [],
      });
    }

    const next = [...current, ...added];

    // Atomic side-effect — strip any newly-added skill out of
    // target_skills (case-insensitive). A skill on the profile no
    // longer belongs on the "want to learn" list.
    const currentTargets: string[] = (profile.target_skills as string[] | null) ?? [];
    const addedLower = new Set(added.map((s) => s.toLowerCase()));
    const removedFromTargets: string[] = [];
    const nextTargets: string[] = [];
    for (const t of currentTargets) {
      if (addedLower.has(t.toLowerCase())) {
        removedFromTargets.push(t);
      } else {
        nextTargets.push(t);
      }
    }

    const updatePayload: Record<string, unknown> = { skills: next };
    if (removedFromTargets.length > 0) {
      updatePayload.target_skills = nextTargets;
    }

    const { error: updErr } = await supabase
      .from("career_profiles")
      .update(updatePayload)
      .eq("user_id", user.id);

    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }

    return NextResponse.json(
      { added, skipped, skills: next, removedFromTargets },
      { status: 201 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
