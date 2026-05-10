/**
 * POST /api/cron/cost-check
 *
 * Vercel Cron job — runs daily per `vercel.json`. Reads Langfuse daily spend
 * data; alerts via BetterStack (and writes a `cost.over_threshold` row to
 * `infrastructure_events`) if yesterday's total > $10.
 *
 * Threshold is intentionally conservative for v1 — the goal at pre-launch
 * volume is "did we just burn $50 in an hour" not "fine-grained budget
 * tracking". Tunable via env COST_DAILY_USD_THRESHOLD.
 *
 * Protected by CRON_SECRET (Vercel cron header).
 * Required env vars: LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY, LANGFUSE_BASE_URL.
 *
 * ADR-005 Phase 1 (W6-B).
 */

import { NextRequest, NextResponse } from "next/server";
import { logInfrastructureEvent } from "@/lib/observability/logInfrastructureEvent";

const DEFAULT_THRESHOLD_USD = 10;

interface LangfuseDailyMetric {
  date?:               string;
  countTraces?:        number;
  totalCost?:          number;
  // Langfuse public-API daily metrics include extra fields; we only consume what we need.
  [k: string]: unknown;
}

async function fetchYesterdayCostUsd(): Promise<{ cost: number; raw: unknown } | { cost: null; error: string }> {
  const baseUrl   = process.env.LANGFUSE_BASE_URL ?? "https://cloud.langfuse.com";
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  if (!publicKey || !secretKey) {
    return { cost: null, error: "Langfuse env vars not set (LANGFUSE_PUBLIC_KEY/LANGFUSE_SECRET_KEY)" };
  }

  // Yesterday's window (UTC).
  const now      = new Date();
  const yEndUtc   = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
  const yStartUtc = new Date(yEndUtc.getTime() - 24 * 60 * 60 * 1000);

  const params = new URLSearchParams({
    fromTimestamp: yStartUtc.toISOString(),
    toTimestamp:   yEndUtc.toISOString(),
  });
  const url = `${baseUrl.replace(/\/$/, "")}/api/public/metrics/daily?${params.toString()}`;
  const auth = Buffer.from(`${publicKey}:${secretKey}`).toString("base64");

  try {
    const res = await fetch(url, {
      headers: {
        "Authorization": `Basic ${auth}`,
        "Accept":        "application/json",
      },
      cache: "no-store",
    });
    if (!res.ok) {
      const body = (await res.text()).slice(0, 500);
      return { cost: null, error: `Langfuse ${res.status}: ${body}` };
    }
    const data = (await res.json()) as { data?: LangfuseDailyMetric[] };
    const totalCost = (data.data ?? []).reduce<number>((sum, d) => sum + (typeof d.totalCost === "number" ? d.totalCost : 0), 0);
    return { cost: totalCost, raw: data };
  } catch (err) {
    return { cost: null, error: `Langfuse fetch threw: ${(err as Error).message}` };
  }
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const threshold = Number(process.env.COST_DAILY_USD_THRESHOLD ?? DEFAULT_THRESHOLD_USD);
  const result    = await fetchYesterdayCostUsd();

  if (result.cost === null) {
    // Configuration / fetch error — log as warning, do not alert.
    await logInfrastructureEvent({
      source:     "cost-cron",
      event_type: "cost.error",
      severity:   "warning",
      payload: { error: result.error, threshold_usd: threshold },
    });
    return NextResponse.json({ ok: false, error: result.error, threshold_usd: threshold }, { status: 200 });
  }

  const overThreshold = result.cost > threshold;
  await logInfrastructureEvent({
    source:     "cost-cron",
    event_type: overThreshold ? "cost.over_threshold" : "cost.daily",
    severity:   overThreshold ? "error" : "info",
    payload: {
      yesterday_cost_usd: result.cost,
      threshold_usd:      threshold,
      langfuse_raw:       result.raw,
    },
  });

  return NextResponse.json({
    ok:                 true,
    yesterday_cost_usd: result.cost,
    threshold_usd:      threshold,
    over_threshold:     overThreshold,
  }, { status: 200 });
}

// GET also works — useful for manual probes.
export async function GET(req: NextRequest) { return POST(req); }
