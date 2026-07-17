/**
 * POST /api/cron/cleanup-dead-jobs
 *
 * Vercel Cron — schedule in `vercel.json`. Forwards to the Supabase Edge
 * Function `cleanup-dead-jobs` which soft-deletes ats_jobs that have not been seen in the ingest sweep for N days AND whose apply URLs return 404/410. Runs daily at 05:00 UTC — after enrich/validate have marked rows.
 *
 * Auth pattern mirrors `ingest-ats` and `curate-user-recommendations`:
 *   1. Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`
 *   2. We forward with `x-cron-secret: ${CRON_SECRET}` for the edge
 *      function's own gate. Service-role Bearer satisfies verify_jwt=true.
 *
 * ---------------------------------------------------------------
 * fix/jobs-pipeline-crons — this route + the vercel.json entry that
 *   references it did not exist before. The edge function was
 *   authored assuming a cron would call it; audit in PR #386's
 *   description confirmed the schedule was never wired ("phantom stage").
 * ---------------------------------------------------------------
 */

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

interface CleanupResponse {
  processed?: number;
  updated?:   number;
  errors?:    number;
  durationMs?: number;
  error?:     string;
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

  const target = `${supabaseUrl}/functions/v1/cleanup-dead-jobs`;
  const started = Date.now();

  try {
    const res = await fetch(target, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${serviceKey}`,
        "x-cron-secret": cronSecret ?? "",
      },
      body: JSON.stringify({}),
    });

    const elapsedMs = Date.now() - started;
    const text = await res.text();
    let json: CleanupResponse | null = null;
    try { json = JSON.parse(text) as CleanupResponse; } catch { /* keep raw text */ }

    if (!res.ok) {
      console.error("[cron/cleanup-dead-jobs] edge function returned non-2xx:", res.status, text.slice(0, 500));
      return NextResponse.json(
        { ok: false, status: res.status, body: json ?? text, elapsedMs },
        { status: 502 },
      );
    }
    console.info(
      `[cron/cleanup-dead-jobs] ok in ${elapsedMs}ms — processed=${json?.processed ?? 0} updated=${json?.updated ?? 0} errors=${json?.errors ?? 0}`,
    );
    return NextResponse.json({ ok: true, elapsedMs, result: json ?? null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    console.error("[cron/cleanup-dead-jobs] fetch failed:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

// Vercel cron sends GET by default; mirror the ingest-ats / curate-user-recommendations pattern.
export async function GET(req: NextRequest) { return POST(req); }
