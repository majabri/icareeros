/**
 * DELETE /api/career-os/cycles/[id]
 *
 * Hard delete a career_os_cycles row (cascades to career_os_stages via the
 * FK ON DELETE CASCADE). The dashboard's CycleManagementPanel hits this
 * endpoint when the user confirms a delete.
 *
 * Auth:
 *   401 — not authenticated
 *   404 — cycle does not exist for this user (RLS scopes the lookup so a
 *         cycle owned by a different user is indistinguishable from a
 *         cycle that doesn't exist — both surface as 404, never as 403,
 *         to avoid an existence-oracle).
 *   500 — unexpected DB error
 *   204 — success
 *
 * For SOFT archival (status='abandoned') keep using the in-memory abandon
 * flow on the dashboard, which calls abandonCycle() directly via Supabase
 * client-side. This route is the only path for HARD delete.
 */

import { NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { withCrossSubdomainCookie } from "@/lib/supabase-cookie-options";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
              cookieStore.set(name, value, withCrossSubdomainCookie(options))
            );
          } catch {
            /* server component — set is a no-op */
          }
        },
      },
    },
  );
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await makeSupabaseServer();

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify the cycle exists AND is owned by this user. We intentionally
  // collapse "doesn't exist" and "exists but owned by someone else" into
  // a single 404 — leaking the difference would create an existence
  // oracle for cycle ids.
  const { data: cycle } = await supabase
    .from("career_os_cycles")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!cycle) {
    return NextResponse.json({ error: "Cycle not found" }, { status: 404 });
  }

  const { error } = await supabase
    .from("career_os_cycles")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
