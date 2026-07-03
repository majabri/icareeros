// deno-lint-ignore-file no-explicit-any
/**
 * validate-job-urls — Phase 2 of feat/jobs-pipeline.
 *
 * Runs daily at 03:00 UTC. For each is_active=true row where
 * last_validated_at < now() - 24h:
 *   1. GET the apply URL with a 10s timeout
 *   2. If status in 4xx/5xx OR body matches soft-404 patterns
 *      ("job filled", "no longer accepting", "position closed", etc.)
 *      → set dead_at + apply_url_status + is_active=false
 *   3. Otherwise refresh last_validated_at + apply_url_status=200.
 *
 * Batch: 200 rows / invocation, 10 parallel workers.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const BATCH_SIZE   = 200;
const WORKER_COUNT = 10;
const TIMEOUT_MS   = 10_000;

const SOFT_404_PATTERNS: RegExp[] = [
  /\bjob (has been )?filled\b/i,
  /\bno longer (accepting|available|open)\b/i,
  /\bposition (has been )?closed\b/i,
  /\bposting (has )?expired\b/i,
  /\bthis (job|posting|role) is no longer\b/i,
  /\brequisition (closed|filled)\b/i,
];

async function checkUrl(url: string): Promise<{ status: number; dead: boolean }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch(url, {
      method:  "GET",
      redirect: "follow",
      signal:  controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 iCareerOS-Validator/1.0" },
    });
    clearTimeout(timeout);
    const status = res.status;

    if (status >= 400) return { status, dead: true };

    // Read a slice of the body (first 32 KB) to look for soft-404 tells.
    // AbortController-safe: we intentionally stop reading after N bytes.
    const reader = res.body?.getReader();
    let body = "";
    if (reader) {
      let received = 0;
      const decoder = new TextDecoder("utf-8");
      const cap = 32 * 1024;
      while (received < cap) {
        const { value, done } = await reader.read();
        if (done) break;
        received += value.byteLength;
        body += decoder.decode(value, { stream: true });
        if (received >= cap) break;
      }
      try { await reader.cancel(); } catch (_e) { /* ignore */ }
    }
    const soft404 = SOFT_404_PATTERNS.some(p => p.test(body));
    return { status: soft404 ? 410 : status, dead: soft404 };
  } catch (_e) {
    return { status: 0, dead: true };
  }
}

interface Row { id: string; direct_apply_url: string | null; apply_url: string | null }

async function processRow(supabase: any, row: Row): Promise<void> {
  const url = row.direct_apply_url ?? row.apply_url ?? "";
  if (!url) {
    await supabase.from("ats_jobs").update({
      last_validated_at: new Date().toISOString(),
      apply_url_status:  null,
    }).eq("id", row.id);
    return;
  }
  const { status, dead } = await checkUrl(url);
  if (dead) {
    await supabase.from("ats_jobs").update({
      is_active:         false,
      dead_at:           new Date().toISOString(),
      last_validated_at: new Date().toISOString(),
      apply_url_status:  status,
    }).eq("id", row.id);
  } else {
    await supabase.from("ats_jobs").update({
      last_validated_at: new Date().toISOString(),
      apply_url_status:  status,
    }).eq("id", row.id);
  }
}

async function runBatch(supabase: any) {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("ats_jobs")
    .select("id, direct_apply_url, apply_url")
    .eq("is_active", true)
    .or(`last_validated_at.is.null,last_validated_at.lt.${cutoff}`)
    .order("last_validated_at", { ascending: true, nullsFirst: true })
    .limit(BATCH_SIZE);
  if (error) throw error;
  const rows: Row[] = (data ?? []) as Row[];
  const queue = [...rows];
  let alive = 0, dead = 0;
  await Promise.all(Array.from({ length: WORKER_COUNT }).map(async () => {
    while (queue.length > 0) {
      const r = queue.shift();
      if (!r) break;
      try {
        await processRow(supabase, r);
        alive++;
      } catch (_e) {
        dead++;
      }
    }
  }));
  return { processed: rows.length, alive, dead };
}

Deno.serve(async (_req: Request) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  try {
    const started = Date.now();
    const result  = await runBatch(supabase);
    return new Response(JSON.stringify({ ...result, durationMs: Date.now() - started }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[validate-job-urls] fatal:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
