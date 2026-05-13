/**
 * POST /api/cron/discover-rss
 *
 * Sprint 2 W5-B — fan out to RSS / aggregator-JSON sources, dedupe
 * against opportunities.raw_url_hash, insert new rows with
 * verification_status='verified' (RSS feeds are authoritative).
 *
 * Two-layer auth (matches every other cron):
 *   • Authorization: Bearer ${CRON_SECRET}
 *   • feature_flags kill-switch (key='discover_rss_cron')
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchWeWorkRemotely, fetchRemotive, fetchHnHiring, type DiscoveredJob } from "@/lib/discovery/rssAdapters";
import { logInfrastructureEvent } from "@/lib/observability/logInfrastructureEvent";

export const dynamic     = "force-dynamic";
export const maxDuration = 60;

interface RunReport {
  ok:        boolean;
  inserted:  number;
  duplicates: number;
  errors:    Array<{ source: string; error: string }>;
  per_source: Record<string, { fetched: number; inserted: number }>;
}

async function isCronEnabled(sb: any): Promise<boolean> {
  const { data } = await sb
    .from("feature_flags")
    .select("enabled")
    .eq("key", "discover_rss_cron")
    .maybeSingle();
  // Default ON if no row (cron is safe — RSS is verified)
  return data?.enabled !== false;
}

export async function POST(req: NextRequest) {
  // 1) CRON_SECRET auth
  const expected = process.env.CRON_SECRET;
  const auth     = req.headers.get("authorization") ?? "";
  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "supabase_env_missing" }, { status: 500 });
  }
  const sb = createClient(url, key, { auth: { persistSession: false } });

  // 2) Kill-switch
  if (!(await isCronEnabled(sb))) {
    return NextResponse.json({ ok: true, disabled: true });
  }

  const report: RunReport = {
    ok: true, inserted: 0, duplicates: 0, errors: [], per_source: {},
  };

  // 3) Fetch from each source in parallel
  const fetchers = [
    { name: "wwr_rss",   fn: fetchWeWorkRemotely },
    { name: "remotive",  fn: fetchRemotive       },
    { name: "hn_hiring", fn: fetchHnHiring       },
  ];

  const results = await Promise.allSettled(fetchers.map(f => f.fn()));
  const allJobs: DiscoveredJob[] = [];
  results.forEach((r, i) => {
    const name = fetchers[i].name;
    if (r.status === "fulfilled") {
      report.per_source[name] = { fetched: r.value.length, inserted: 0 };
      allJobs.push(...r.value);
    } else {
      report.per_source[name] = { fetched: 0, inserted: 0 };
      report.errors.push({ source: name, error: String(r.reason).slice(0, 300) });
    }
  });

  if (allJobs.length === 0) {
    return NextResponse.json(report);
  }

  // 4) De-dupe pass: get existing url-hashes for the candidates
  const hashes = Array.from(new Set(allJobs.map(j => j.raw_url_hash)));
  const { data: existing } = await sb
    .from("opportunities")
    .select("raw_url_hash")
    .in("raw_url_hash", hashes);
  const seen = new Set((existing ?? []).map((r: { raw_url_hash: string }) => r.raw_url_hash));

  // 5) Insert non-duplicates
  const toInsert = allJobs.filter(j => !seen.has(j.raw_url_hash));
  report.duplicates = allJobs.length - toInsert.length;

  if (toInsert.length > 0) {
    // Map DiscoveredJob → opportunities row shape (minimal viable columns)
    const rows = toInsert.map(j => ({
      title:               j.title,
      company:             j.company ?? "Unknown",
      description:         j.description ?? "",
      location:            j.location ?? null,
      url:                 j.raw_url,
      raw_url:             j.raw_url,
      raw_url_hash:        j.raw_url_hash,
      external_id:         j.external_id,
      source:              j.source,
      source_type:         j.source_type,
      posted_date:         j.posted_date,
      discovered_at:       new Date().toISOString(),
      verification_status: "verified",       // RSS feeds are authoritative
      verified_at:         new Date().toISOString(),
      raw_payload:         j.raw_payload,
    }));

    const { error: insErr, count } = await sb
      .from("opportunities")
      .insert(rows, { count: "exact" });

    if (insErr) {
      report.errors.push({ source: "supabase_insert", error: insErr.message.slice(0, 300) });
    } else {
      report.inserted = count ?? toInsert.length;
      // Per-source breakdown
      for (const j of toInsert) {
        report.per_source[j.source].inserted += 1;
      }
    }
  }

  // 6) Log run summary
  await logInfrastructureEvent({
    source:     "discover-rss-cron",
    event_type: report.errors.length > 0 ? "discovery.run_with_errors" : "discovery.run_success",
    severity:   report.errors.length > 0 ? "warning" : "info",
    payload:    report as unknown as Record<string, unknown>,
  });

  return NextResponse.json(report);
}
