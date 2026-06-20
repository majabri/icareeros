/**
 * POST /api/opportunities/feedback
 *
 * Brief Task 10 — record a per-job action signal that the aggregator will
 * fold into fit_score on the next search.
 *
 * Action -> signal mapping:
 *   saved | applied | tracked        -> "positive" (+10 fit boost)
 *   dismissed | hidden | not_for_me  -> "negative" (-15 fit penalty)
 *
 * Owner-only RLS; the table is created in migration
 * 20260620054200_opportunity_feedback.sql.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { withCrossSubdomainCookie } from "@/lib/supabase-cookie-options";

async function makeSupabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, withCrossSubdomainCookie(options))
          );
        },
      },
    }
  );
}

const POSITIVE_ACTIONS = new Set(["saved", "applied", "tracked"]);
const NEGATIVE_ACTIONS = new Set(["dismissed", "hidden", "not_for_me"]);

interface FeedbackPayload {
  action?: string;
  job_url?: string;
  company?: string;
  source?: string;
  reason?: string;
}

export async function POST(req: NextRequest) {
  let body: FeedbackPayload;
  try {
    body = (await req.json()) as FeedbackPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const action = (body.action ?? "").toLowerCase().trim();
  if (!action) {
    return NextResponse.json({ error: "Missing action" }, { status: 400 });
  }

  let signal: "positive" | "negative";
  if (POSITIVE_ACTIONS.has(action)) {
    signal = "positive";
  } else if (NEGATIVE_ACTIONS.has(action)) {
    signal = "negative";
  } else {
    return NextResponse.json({ error: `Unknown action "${action}"` }, { status: 400 });
  }

  const supabase = await makeSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { error } = await supabase.from("opportunity_feedback").insert({
    user_id: user.id,
    job_url: body.job_url ?? null,
    company: body.company ?? null,
    source: body.source ?? null,
    action,
    signal,
    reason: body.reason ?? null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, signal }, { status: 201 });
}
