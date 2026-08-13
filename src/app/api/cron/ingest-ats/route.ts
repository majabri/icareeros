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
import { logInfrastructureEvent } from "@/lib/observability/logInfrastructureEvent";

export const dynamic = "force-dynamic";
// Max runtime — the edge function takes ~6s for 10 companies × 25 jobs.
// We leave generous headroom for slow ATSes.
export const maxDuration = 60;

/**
 * feat/jobs-search-db Task 1 — response shape aligned with the edge
 * function's post-PR-#N output. Prior interface expected `upsert.inserted`
 * which never appeared in the actual body — the log line hard-coded
 * `inserted=?` as a symptom.
 */
interface IngestResponse {
  success:      boolean;
  ok:           boolean;
  ingested:     number;
  updated:      number;
  deactivated:  number;
  sources:      Record<string, number>;
  duration_ms:  number;
  errors:       number | Array<{ source: string; company?: string; error: string }>;
  runStartedAt?: string;
  finishedAt?:  string;
  // fix/jobs-ingest-adapter-bugs Bug 4 — rolled-up counts + per-source
  // detail. The edge function returns both `errors` as a number (rolled)
  // and `errorDetails` as an array.
  inserted?:    number;
  errorDetails?: Array<{ source: string; company?: string; error: string }>;
  greenhouse?:      { upserted: number; errors: number };
  lever?:           { upserted: number; errors: number };
  ashby?:           { upserted: number; errors: number };
  workday?:         { upserted: number; errors: number };
  smartrecruiters?: { upserted: number; errors: number };
}

export async function POST(req: NextRequest) {
  // ── Layer 1: Vercel-cron token check ────────────────────────────────
  const auth = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // ── HEARTBEAT (invocation.start) — mirrors the edge-fn pattern for the Vercel-cron path ──
  const __hbStart = Date.now();
  const __hbInvocationId = crypto.randomUUID();
  await logInfrastructureEvent({
    source: "edge-fn.ingest-ats-direct",       // same source-name-space as the edge fn heartbeat
    event_type: "invocation.start",
    severity: "info",
    payload: {
      invocation_id: __hbInvocationId,
      invoked_by: "vercel_cron",                // this path IS the Vercel cron
      via: "api-route",                          // distinguishes route-fired vs direct edge-fn heartbeats
      version: null,
      chain_depth: 0,
    },
  });

  try {
    const __hbResponse: NextResponse = await (async (): Promise<NextResponse> => {

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

    // fix/jobs-ingest-adapter-bugs Bug 4 — new log line reads the rolled-up
    // `inserted`/`errors` from the edge function's v4 response, with the
    // per-source detail in brackets.
    const totalIngested = json?.inserted ?? json?.ingested ?? 0;
    const totalErrors   = typeof json?.errors === "number" ? json.errors
                        : (Array.isArray(json?.errors) ? json.errors.length : 0);
    const perSourceParts = [
      json?.greenhouse      ? `gh=${json.greenhouse.upserted}(err=${json.greenhouse.errors})`         : null,
      json?.lever           ? `lev=${json.lever.upserted}(err=${json.lever.errors})`                  : null,
      json?.ashby           ? `ash=${json.ashby.upserted}(err=${json.ashby.errors})`                  : null,
      json?.workday         ? `wd=${json.workday.upserted}(err=${json.workday.errors})`               : null,
      json?.smartrecruiters ? `sr=${json.smartrecruiters.upserted}(err=${json.smartrecruiters.errors})` : null,
    ].filter(Boolean);
    console.info(
      `[cron/ingest-ats] ok in ${elapsedMs}ms — ingested=${totalIngested} ` +
      `deactivated=${json?.deactivated ?? 0} errors=${totalErrors} ` +
      `[${perSourceParts.join(" ")}]`
    );
    return NextResponse.json({ ok: true, elapsedMs, result: json ?? null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    console.error("[cron/ingest-ats] fetch failed:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
    })();
    const __hbOutcome: "ok"|"error" = __hbResponse.status >= 200 && __hbResponse.status < 400 ? "ok" : "error";
    await logInfrastructureEvent({
      source: "edge-fn.ingest-ats-direct",
      event_type: "invocation.complete",
      severity: __hbOutcome === "ok" ? "info" : "error",
      payload: {
        invocation_id: __hbInvocationId,
        outcome: __hbOutcome,
        duration_ms: Date.now() - __hbStart,
        error: __hbOutcome === "error" ? `HTTP ${__hbResponse.status}` : null,
        http_status: __hbResponse.status,
        via: "api-route",
      },
    });
    return __hbResponse;
  } catch (__hbE) {
    await logInfrastructureEvent({
      source: "edge-fn.ingest-ats-direct",
      event_type: "invocation.complete",
      severity: "error",
      payload: {
        invocation_id: __hbInvocationId,
        outcome: "error",
        duration_ms: Date.now() - __hbStart,
        error: (__hbE as Error)?.message ?? String(__hbE),
        via: "api-route",
      },
    });
    throw __hbE;
  }
}

// Vercel cron sends GET by default; mirror health-check route pattern.
export async function GET(req: NextRequest) { return POST(req); }

