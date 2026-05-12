/**
 * POST /api/cron/ingest-ats
 *
 * Vercel Cron — runs daily at 02:00 UTC per `vercel.json`. Forwards to the
 * Supabase Edge Function `ingest-ats-direct` which pulls fresh jobs from
 * the configured Greenhouse/Ashby boards (and any future ATS sources) and
 * upserts them into `public.opportunities`.
 *
 * Two layers of auth:
 *   1. Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}` — same
 *      pattern used by every other cron in this app.
 *   2. We forward to the Supabase edge function with
 *      `x-ingest-cron-secret: ${INGEST_CRON_SECRET}` so the edge function
 *      itself rejects unauthenticated traffic (it's deployed with
 *      verify_jwt=false to support cron callers, so this header is the
 *      only thing keeping the public URL from being open).
 */

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
// Max runtime — the edge function takes ~6s for 10 companies × 25 jobs.
// We leave generous headroom for slow ATSes.
export const maxDuration = 60;

interface UpsertResult {
  inserted: number;
  updated:  number;
  error?:   string;
}

interface IngestResponse {
  ok:          boolean;
  dry_run:     boolean;
  elapsed_ms:  number;
  total_jobs:  number;
  by_company:  Record<string, { count: number; error?: string }>;
  upsert:      UpsertResult | null;
}

export async function POST(req: NextRequest) {
  // ── Layer 1: Vercel-cron token check ────────────────────────────────
  const auth = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // ── Layer 2: env vars required to forward to Supabase ───────────────
  const supabaseUrl    = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const ingestSecret   = process.env.INGEST_CRON_SECRET;
  if (!supabaseUrl) {
    return NextResponse.json({ error: "missing NEXT_PUBLIC_SUPABASE_URL" }, { status: 500 });
  }
  if (!ingestSecret) {
    return NextResponse.json({ error: "missing INGEST_CRON_SECRET" }, { status: 500 });
  }

  const target = `${supabaseUrl}/functions/v1/ingest-ats-direct`;
  const started = Date.now();

  try {
    const res = await fetch(target, {
      method: "POST",
      headers: {
        "Content-Type":           "application/json",
        "x-ingest-cron-secret":   ingestSecret,
      },
      body: JSON.stringify({ dry_run: false, max_per_company: 25 }),
    });

    const elapsedMs = Date.now() - started;
    const text = await res.text();
    let json: IngestResponse | null = null;
    try { json = JSON.parse(text) as IngestResponse; } catch { /* keep raw text */ }

    if (!res.ok) {
      console.error("[cron/ingest-ats] edge function returned non-2xx:", res.status, text.slice(0, 500));
      return NextResponse.json(
        { ok: false, status: res.status, body: json ?? text, elapsedMs },
        { status: 502 },
      );
    }

    console.info(
      `[cron/ingest-ats] ok in ${elapsedMs}ms — inserted=${json?.upsert?.inserted ?? "?"} ` +
      `total=${json?.total_jobs ?? "?"}`
    );
    return NextResponse.json({ ok: true, elapsedMs, result: json ?? null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    console.error("[cron/ingest-ats] fetch failed:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
