/**
 * POST /api/cron/discover-perplexity
 *
 * Sprint 2 W5-C — Perplexity-powered job discovery with a 4-stage
 * verification gate. Runs once per day per category (5 cats × 1/day).
 *
 * Cost: ~$12.50 / month at sonar-pro pricing.
 *
 * Two-layer auth:
 *   • Authorization: Bearer ${CRON_SECRET}
 *   • feature_flags kill-switch (key='discover_perplexity_cron')
 *
 * The cron picks ONE category per invocation (round-robin by day-of-week)
 * so we make exactly 1 Perplexity request per cron tick.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  DISCOVERY_CATEGORIES,
  askPerplexity,
  verifyPerplexityRow,
  toDiscoveredJob,
} from "@/lib/discovery/perplexityAdapter";
import { logInfrastructureEvent } from "@/lib/observability/logInfrastructureEvent";

export const dynamic     = "force-dynamic";
export const maxDuration = 60;

interface RunReport {
  ok:               boolean;
  category:         string;
  fetched:          number;
  verified:         number;
  inserted:         number;
  rejected_reasons: Record<string, number>;
  errors:           string[];
}

async function isCronEnabled(sb: ReturnType<typeof createClient>): Promise<boolean> {
  const { data } = await sb
    .from("feature_flags")
    .select("enabled")
    .eq("key", "discover_perplexity_cron")
    .maybeSingle();
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
  const ppxKey      = process.env.PERPLEXITY_API_KEY ?? process.env.Perplexity_API_KEY;
  if (!supabaseUrl || !supabaseKey) return NextResponse.json({ error: "supabase_env_missing" }, { status: 500 });
  if (!ppxKey) return NextResponse.json({ error: "perplexity_key_missing" }, { status: 500 });

  const sb = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

  if (!(await isCronEnabled(sb))) {
    return NextResponse.json({ ok: true, disabled: true });
  }

  // Day-of-week → category (rotation)
  const dow = new Date().getUTCDay();
  const category = DISCOVERY_CATEGORIES[dow % DISCOVERY_CATEGORIES.length];

  const report: RunReport = {
    ok: true, category, fetched: 0, verified: 0, inserted: 0,
    rejected_reasons: {}, errors: [],
  };

  // 1) Ask Perplexity
  let rows;
  try {
    rows = await askPerplexity(category, ppxKey);
  } catch (e) {
    report.errors.push(String(e).slice(0, 300));
    return NextResponse.json(report);
  }
  report.fetched = rows.length;

  // 2) Pre-load existing url-hashes for dedupe
  const hashes = rows.map(r => {
    const j = toDiscoveredJob(r);
    return j.raw_url_hash;
  });
  const { data: existing } = await sb
    .from("opportunities")
    .select("raw_url_hash")
    .in("raw_url_hash", hashes);
  const existingHashes = new Set((existing ?? []).map((r: { raw_url_hash: string }) => r.raw_url_hash));

  // 3) Run the 4-stage gate on each row (sequential — kindness to ATS hosts)
  const verifiedRows: typeof rows = [];
  for (const r of rows) {
    const v = await verifyPerplexityRow(r, existingHashes);
    if (v.ok) {
      verifiedRows.push(r);
    } else {
      const reason = v.reason ?? "unknown";
      report.rejected_reasons[reason] = (report.rejected_reasons[reason] ?? 0) + 1;
    }
  }
  report.verified = verifiedRows.length;

  // 4) Insert verified rows
  if (verifiedRows.length > 0) {
    const insertRows = verifiedRows.map(r => {
      const j = toDiscoveredJob(r);
      return {
        title:               j.title,
        company:             j.company ?? "Unknown",
        description:         j.description ?? "",
        location:            j.location,
        url:                 j.raw_url,
        raw_url:             j.raw_url,
        raw_url_hash:        j.raw_url_hash,
        external_id:         j.external_id,
        source:              j.source,
        source_type:         j.source_type,
        posted_date:         j.posted_date,
        discovered_at:       new Date().toISOString(),
        verification_status: "verified",
        verified_at:         new Date().toISOString(),
        raw_payload:         j.raw_payload,
      };
    });

    const { error: insErr, count } = await sb
      .from("opportunities")
      .insert(insertRows, { count: "exact" });

    if (insErr) {
      report.errors.push(`insert: ${insErr.message.slice(0, 300)}`);
    } else {
      report.inserted = count ?? insertRows.length;
    }
  }

  await logInfrastructureEvent({
    source:     "discover-perplexity-cron",
    event_type: report.errors.length > 0 ? "discovery.run_with_errors" : "discovery.run_success",
    severity:   report.errors.length > 0 ? "warning" : "info",
    payload:    report as unknown as Record<string, unknown>,
  });

  return NextResponse.json(report);
}
