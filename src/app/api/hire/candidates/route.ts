/**
 * POST /api/hire/candidates — recruiter candidate search.
 *
 * Phase 2 recruiter discoverability (2026-05-17). Auth-required;
 * requires the caller to have `role='employer'` in `user_roles`. Any
 * other role gets 403.
 *
 * Body shape:
 *   {
 *     skills?:        string[];       // any-of match against career_profiles.skills (text[])
 *     targetRole?:    string;         // ILIKE match against any element of user_profiles.target_roles
 *     location?:      string;         // ILIKE match against career_profiles.location (substring)
 *     remote?:        boolean;        // user_profiles.open_to_remote = true
 *     experienceLevel?: string;       // exact match user_profiles.experience_level
 *     page?:          number;         // 1-based, default 1
 *     pageSize?:      number;         // default 20, max 50
 *   }
 *
 * Returns:
 *   {
 *     candidates: Array<CandidateCard>,
 *     total:      number,
 *     page:       number,
 *     pageSize:   number,
 *   }
 *
 * Server-side enforces:
 *   - is_discoverable = true (RLS does this too, but belt + suspenders)
 *   - the recruiter's company (when known) is not in the row's
 *     blocked_companies. Today we don't have an employer→company link
 *     yet (employer_profiles doesn't exist), so we accept the company
 *     from the request body as `viewerCompany?: string` and filter
 *     accordingly. Phase 3 should pull this from a server-trusted source.
 */

import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { withCrossSubdomainCookie } from "@/lib/supabase-cookie-options";
import { filterByBlockedCompanies } from "@/lib/hire/blockedCompaniesFilter";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE     = 50;

interface SearchBody {
  skills?:          unknown;
  targetRole?:      unknown;
  location?:        unknown;
  remote?:          unknown;
  experienceLevel?: unknown;
  page?:            unknown;
  pageSize?:        unknown;
  // Phase 3 (2026-05-17): viewerCompany is no longer accepted from
  // the request body. It is server-derived from employer_profiles for
  // the authenticated user, so a recruiter cannot bypass another job
  // seeker's block list by claiming a different company.
}

interface ProfileGateResult {
  hasProfile: boolean;
  company:    string;
}

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

function arrayOfStrings(x: unknown): string[] {
  if (!Array.isArray(x)) return [];
  return (x as unknown[]).filter((v): v is string => typeof v === "string" && v.trim().length > 0);
}

function trimmedString(x: unknown): string {
  return typeof x === "string" ? x.trim() : "";
}

function intInRange(x: unknown, min: number, max: number, dflt: number): number {
  const n = typeof x === "number" ? Math.floor(x) : NaN;
  if (!Number.isFinite(n)) return dflt;
  return Math.min(Math.max(min, n), max);
}

export async function POST(req: Request) {
  try {
    const supabase = await makeSupabaseServer();

    // ── Auth gate ──────────────────────────────────────────────────
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Role gate — must be employer.
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
      return NextResponse.json({ error: "Forbidden — employer role required" }, { status: 403 });
    }

    // ── Parse + validate body ─────────────────────────────────────
    const body = await req.json().catch(() => ({})) as SearchBody;

    const skills         = arrayOfStrings(body.skills);
    const targetRole     = trimmedString(body.targetRole);
    const location       = trimmedString(body.location);
    const remote         = body.remote === true;
    const experienceLevel = trimmedString(body.experienceLevel);
    const page           = intInRange(body.page,     1, 10_000, 1);
    const pageSize       = intInRange(body.pageSize, 1, MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE);

    // Phase 3 (2026-05-17) — server-trusted viewerCompany.
    const { data: empProfile, error: empErr } = await supabase
      .from("employer_profiles")
      .select("company_name")
      .eq("user_id", user.id)
      .maybeSingle();
    if (empErr) {
      return NextResponse.json({ error: empErr.message }, { status: 500 });
    }
    const viewerCompany = typeof empProfile?.company_name === "string"
      ? empProfile.company_name.trim()
      : "";
    if (!viewerCompany) {
      return NextResponse.json(
        {
          error:              "Company profile incomplete",
          profileIncomplete:  true,
        } satisfies { error: string; profileIncomplete: true },
        { status: 422 },
      );
    }

    // ── Query career_profiles ─────────────────────────────────────
    // RLS limits us to is_discoverable=true rows already, but the
    // explicit filter makes the intent obvious in logs/queries.
    let q = supabase
      .from("career_profiles")
      .select(
        "user_id, headline, summary, skills, location, target_skills, blocked_companies",
        { count: "exact" },
      )
      .eq("is_discoverable", true);

    if (skills.length > 0)        q = q.overlaps("skills", skills);
    if (location)                 q = q.ilike("location", `%${location}%`);

    const from = (page - 1) * pageSize;
    const to   = from + pageSize - 1;
    q = q.range(from, to).order("updated_at", { ascending: false });

    const { data: profiles, error: profilesErr, count } = await q;
    if (profilesErr) {
      return NextResponse.json({ error: profilesErr.message }, { status: 500 });
    }

    // Server-side blocked_companies enforcement. RLS can't see the
    // recruiter's company so we filter here via the shared helper
    // (unit-tested in src/lib/hire/__tests__/blockedCompaniesFilter.test.ts).
    const filtered = filterByBlockedCompanies(profiles ?? [], viewerCompany);

    // ── Join user_profiles for the candidate cards ────────────────
    const userIds = filtered.map((r) => (r as { user_id: string }).user_id);
    let userProfileById = new Map<string, Record<string, unknown>>();
    if (userIds.length > 0) {
      let uq = supabase
        .from("user_profiles")
        .select("user_id, full_name, current_position, target_roles, experience_level, open_to_remote, avatar_url, location")
        .in("user_id", userIds);
      if (targetRole)       uq = uq.contains("target_roles", [targetRole]);
      if (remote)           uq = uq.eq("open_to_remote", true);
      if (experienceLevel)  uq = uq.eq("experience_level", experienceLevel);
      const { data: ups, error: upsErr } = await uq;
      if (upsErr) {
        return NextResponse.json({ error: upsErr.message }, { status: 500 });
      }
      userProfileById = new Map(
        (ups ?? []).map((u) => [(u as { user_id: string }).user_id, u as Record<string, unknown>]),
      );
    }

    // Keep only profiles whose user_profile passed the user_profile filters.
    const candidates = filtered
      .filter((r) => userProfileById.has((r as { user_id: string }).user_id))
      .map((r) => {
        const cp = r as Record<string, unknown>;
        const up = userProfileById.get(cp.user_id as string)!;
        return {
          user_id:         cp.user_id,
          headline:        typeof cp.headline === "string" ? cp.headline : null,
          summary:         typeof cp.summary  === "string" ? cp.summary  : null,
          skills:          Array.isArray(cp.skills) ? cp.skills as string[] : [],
          location:        typeof cp.location === "string" ? cp.location : (up.location as string ?? null),
          full_name:       typeof up.full_name === "string" ? up.full_name : null,
          avatar_url:      typeof up.avatar_url === "string" ? up.avatar_url : null,
          target_roles:    Array.isArray(up.target_roles) ? up.target_roles as string[] : [],
          experience_level: typeof up.experience_level === "string" ? up.experience_level : null,
          open_to_remote:  up.open_to_remote === true,
          current_position: typeof up.current_position === "string" ? up.current_position : null,
        };
      });

    return NextResponse.json({
      candidates,
      total:    count ?? candidates.length,
      page,
      pageSize,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
