/**
 * POST /api/career-os/add-target-skill   (Sprint 5 hotfix, 2026-05-15)
 * GET  /api/career-os/add-target-skill   — list current target_skills
 *
 * Lets the UI on /evaluate and /learn push skills into the user's
 * `career_profiles.target_skills` from gap pills and learning-resource
 * cards. Server-side dedupe — a skill already present in target_skills
 * (case-insensitive) is reported in `skipped`, not added again.
 *
 * POST body:  { skills: string[] }
 * POST reply: { added: string[]; skipped: string[]; target_skills: string[] }
 * GET reply:  { target_skills: string[] }
 *
 * Returns 201 on POST success, 200 on GET, 401 unauthenticated, 400
 * malformed body, 404 if the user has no career_profiles row yet (which
 * means /mycareer/profile hasn't been visited — direct the user there).
 */

import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
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
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );
}

/** Trim + collapse whitespace; preserve user casing on insert, but
 *  compare case-insensitively when deduping. */
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
      .select("target_skills")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const target_skills = (data?.target_skills as string[] | null) ?? [];
    return NextResponse.json({ target_skills });
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
      return NextResponse.json({ added: [], skipped: [], target_skills: [] });
    }

    // Load current target_skills
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
    const currentLower = new Set(current.map((s) => s.toLowerCase()));

    // Dedupe (a) against existing target_skills, and (b) against earlier
    // entries in the SAME incoming batch (case-insensitive).
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
      return NextResponse.json({ added, skipped, target_skills: current });
    }

    const next = [...current, ...added];

    const { error: updErr } = await supabase
      .from("career_profiles")
      .update({ target_skills: next })
      .eq("user_id", user.id);

    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }

    return NextResponse.json({ added, skipped, target_skills: next }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
