/**
 * POST /api/jobs/for-you — 3-tier deterministic curator.
 *
 * feat/jobs-for-you-curator Task 6.
 * No LLM calls. Reads user context from session, returns
 * { strongMatch, worthConsidering, stretch, tierExplanations, ... }.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { withCrossSubdomainCookie } from "@/lib/supabase-cookie-options";
import type { CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { curateForYou } from "@/services/curator/forYouCurator";

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

export async function POST(_req: NextRequest) {
  const supabase = await makeSupabaseServer();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await curateForYou(user.id, supabase);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Curator failed";
    console.error("[for-you] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
