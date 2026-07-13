/**
 * POST /api/cron/curate-user-recommendations
 *
 * Vercel Cron — runs daily at 04:00 UTC per `vercel.json`. Forwards to the
 * Supabase Edge Function `curate-user-recommendations` which rebuilds
 * every active user's `user_job_recommendations` cache using the unified
 * retrieval engine (expandQueriesDeno + retrieveByTitle-equivalent
 * tsquery grouping, matching the Node-side src/services/retrieval).
 *
 * Auth pattern mirrors ingest-ats:
 *   1. Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`
 *   2. We forward with `x-cron-secret: ${CRON_SECRET}` so the edge
 *      function itself rejects unauthenticated traffic. (The edge
 *      function currently doesn't gate on this header — it will as of
 *      the follow-up hardening; leaving the header in place from day
 *      one avoids a churn PR later.)
 *
 * ---------------------------------------------------------------
 * fix/jobs-curator-deno-port Fix 3 — this route + the vercel.json
 *   entry that references it did not exist before. The edge function
 *   was authored assuming a 4am cron would call it; Platform confirmed
 *   the cron was never wired. See docs/CHANGELOG.md.
 * ---------------------------------------------------------------
 */

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
// Batch takes ~10s per 100 users in prod (small user base). 60s ceiling is
// generous and matches ingest-ats.
export const maxDuration = 60;

interface CurateResponse {
  users?:      number;
  recs?:       number;
  userId?:     string;
  durationMs?: number;
  error?:      string;
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    return NextResponse.json({ error: "missing NEXT_PUBLIC_SUPABASE_URL" }, { status: 500 });
  }
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json({ error: "missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
  }

  const target = `${supabaseUrl}/functions/v1/curate-user-recommendations`;
  const started = Date.now();

  try {
    const res = await fetch(target, {
      method: "POST",
      headers: {
        "Content-Type":   "application/json",
        // Edge functions with verify_jwt=true (the default) require a
        // Supabase JWT. Service role satisfies that. If we later flip
        // verify_jwt=false we'll swap to a shared-secret header instead.
        "Authorization":  `Bearer ${serviceKey}`,
        "x-cron-secret":  cronSecret ?? "",
      },
      body: JSON.stringify({}),   // empty body → batch mode
    });

    const elapsedMs = Date.now() - started;
    const text = await res.text();
    let json: CurateResponse | null = null;
    try { json = JSON.parse(text) as CurateResponse; } catch { /* keep raw text */ }

    if (!res.ok) {
      console.error("[cron/curate-user-recommendations] edge function returned non-2xx:", res.status, text.slice(0, 500));
      return NextResponse.json(
        { ok: false, status: res.status, body: json ?? text, elapsedMs },
        { status: 502 },
      );
    }

    console.info(
      `[cron/curate-user-recommendations] ok in ${elapsedMs}ms — ` +
      `users=${json?.users ?? 0} recs=${json?.recs ?? 0}`
    );
    return NextResponse.json({ ok: true, elapsedMs, result: json ?? null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    console.error("[cron/curate-user-recommendations] fetch failed:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

// Vercel cron sends GET by default; mirror the ingest-ats / health-check
// pattern of aliasing GET → POST.
export async function GET(req: NextRequest) { return POST(req); }
