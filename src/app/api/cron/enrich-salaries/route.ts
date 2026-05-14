/**
 * POST /api/cron/enrich-salaries  (GET delegates to POST — Vercel cron pattern)
 *
 * Nightly job that fills opportunities.salary_min / salary_max for rows
 * that don't yet have salary data. Uses Adzuna's salary-histogram endpoint
 * as the source. Processes a configurable batch per invocation (default 50)
 * so we stay under Adzuna's free-tier rate limit.
 *
 * Auth: Authorization: Bearer ${CRON_SECRET}
 * Kill: feature_flags.key='enrich_salaries_cron' (true = enabled)
 *
 * Idempotency: every processed row gets last_salary_enrichment_at set to
 * now() — even when the histogram is empty or the request fails. The
 * salary_source column distinguishes hits ('adzuna_histogram') from misses
 * ('enrichment_failed'). The partial index opportunities_salary_enrichment_pending_idx
 * ensures the SELECT picks up only the pending rows in O(log n).
 *
 * Observability: writes one infrastructure_event per run with
 * source='cron.enrich-salaries', event_type='run_summary', and a payload
 * containing the batch stats.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchSalaryRange, type EnrichmentOutcome } from "@/services/integrations/adzunaSalaryAdapter";
import { logInfrastructureEvent } from "@/lib/observability/logInfrastructureEvent";

export const dynamic     = "force-dynamic";
export const fetchCache  = "force-no-store";
export const maxDuration = 60;

const BATCH_SIZE = 50;        // jobs per cron tick
const REQUEST_DELAY_MS = 250; // ~4 req/sec — well under Adzuna free tier

interface RunReport {
  ok:        boolean;
  selected:  number;
  enriched:  number;
  no_data:   number;
  low_conf:  number;
  errors:    number;
  config_missing: boolean;
  disabled:  boolean;
}

async function isCronEnabled(sb: ReturnType<typeof createClient>): Promise<boolean> {
  const { data } = await sb
    .from("feature_flags")
    .select("enabled")
    .eq("key", "enrich_salaries_cron")
    .maybeSingle();
  // Default to ENABLED if the flag row doesn't exist — the cron is
  // safe-to-run by design. The flag gives ops a kill switch.
  return data?.enabled !== false;
}

export async function POST(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const auth     = req.headers.get("authorization") ?? "";
  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: "supabase_env_missing" }, { status: 500 });
  }

  const sb = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

  const report: RunReport = {
    ok: true, selected: 0, enriched: 0, no_data: 0, low_conf: 0, errors: 0,
    config_missing: false, disabled: false,
  };

  if (!(await isCronEnabled(sb))) {
    report.disabled = true;
    await logInfrastructureEvent({
      source: "cron.enrich-salaries", event_type: "run_summary",
      severity: "info", payload: { ...report },
    });
    return NextResponse.json({ ok: true, disabled: true });
  }

  if (!process.env.ADZUNA_APP_ID || !process.env.ADZUNA_APP_KEY) {
    report.config_missing = true;
    report.ok = false;
    await logInfrastructureEvent({
      source: "cron.enrich-salaries", event_type: "run_summary",
      severity: "warning", payload: { ...report, detail: "ADZUNA_APP_ID / ADZUNA_APP_KEY not configured" },
    });
    return NextResponse.json({ ok: false, ...report }, { status: 503 });
  }

  // Select the next batch — the partial index makes this fast.
  const { data: rows, error: selErr } = await sb
    .from("opportunities")
    .select("id, title, location")
    .is("last_salary_enrichment_at", null)
    .is("salary_min", null)
    .is("salary_max", null)
    .order("first_seen_at", { ascending: false, nullsFirst: false })
    .limit(BATCH_SIZE);

  if (selErr) {
    await logInfrastructureEvent({
      source: "cron.enrich-salaries", event_type: "select_failed",
      severity: "error", payload: { error: selErr.message },
    });
    return NextResponse.json({ ok: false, error: selErr.message }, { status: 500 });
  }

  report.selected = rows?.length ?? 0;

  for (const row of rows ?? []) {
    const outcome = await fetchSalaryRange({
      title:    row.title as string,
      location: row.location as string | null,
    });

    const update = updateFromOutcome(outcome);
    const { error: updErr } = await sb
      .from("opportunities")
      .update(update)
      .eq("id", row.id);

    if (updErr) {
      report.errors++;
      continue;
    }

    if (outcome.ok)                              report.enriched++;
    else if (outcome.reason === "no_data")       report.no_data++;
    else if (outcome.reason === "low_confidence") report.low_conf++;
    else                                          report.errors++;

    // Rate-limit a touch — 4 req/sec is polite and keeps us under Adzuna's
    // free tier of ~250 req/day even on a long catch-up run.
    if (REQUEST_DELAY_MS > 0) await sleep(REQUEST_DELAY_MS);
  }

  await logInfrastructureEvent({
    source: "cron.enrich-salaries", event_type: "run_summary",
    severity: report.errors > 0 ? "warning" : "info",
    payload:  { ...report },
  });

  return NextResponse.json({ ok: report.ok, ...report });
}

export async function GET(req: NextRequest) { return POST(req); }

/**
 * Translate the adapter's EnrichmentOutcome into the columns we write back
 * to opportunities. Always sets last_salary_enrichment_at so this row
 * drops out of the pending index — even on miss — to avoid retry loops.
 */
function updateFromOutcome(o: EnrichmentOutcome): Record<string, unknown> {
  const base = {
    last_salary_enrichment_at: new Date().toISOString(),
  };
  if (o.ok) {
    return {
      ...base,
      salary_min:      o.min,
      salary_max:      o.max,
      salary_currency: "USD",
      salary_source:   "adzuna_histogram",
    };
  }
  return {
    ...base,
    salary_source: `enrichment_failed:${o.reason}`,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
