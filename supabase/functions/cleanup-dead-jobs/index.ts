// deno-lint-ignore-file no-explicit-any
/**
 * cleanup-dead-jobs — Phase 4 of feat/jobs-pipeline.
 *
 * Daily at 05:00 UTC:
 *   * DELETE ats_jobs rows with dead_at older than 30 days.
 *   * DELETE orphaned user_job_recommendations for missing jobs
 *     (ON DELETE CASCADE handles the majority, this is defense-in-depth).
 */

// (removed jsr:@supabase/functions-js edge-runtime type import — pulls a transitive npm:openai
//  dep that deno check cannot resolve without a node_modules folder. Deno.serve is provided
//  ambient in the edge runtime.)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { invocationStart, invocationComplete, inferInvoker } from "../_shared/heartbeat.ts";

Deno.serve(async (_req: Request) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  // ── HEARTBEAT (invocation.start / .complete) ──
  const __hbStart = Date.now();
  const __hbInvoker: "pg_cron"|"vercel_cron"|"manual"|"chain"|"unknown" = "pg_cron";
  const __hbId = await invocationStart({ supabase, functionSlug: "cleanup-dead-jobs", invokedBy: __hbInvoker });
  try {
    const __hbResponse: Response = await (async (): Promise<Response> => {
  try {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { count: deadCount, error: e1 } = await supabase
      .from("ats_jobs")
      .delete({ count: "estimated" })
      .lt("dead_at", cutoff);
    if (e1) throw e1;

    // Orphan cleanup — ON DELETE CASCADE covers most cases; belt-and-braces
    // for stale rows where the FK was manually re-linked.
    const { error: e2 } = await supabase.rpc("cleanup_orphaned_recommendations");
    if (e2) console.warn("[cleanup-dead-jobs] rpc missing (ok):", e2.message);

    return new Response(JSON.stringify({ deletedDeadJobs: deadCount ?? 0 }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[cleanup-dead-jobs] fatal:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
    })();
    const __hbOutcome: "ok"|"error" = __hbResponse.status >= 200 && __hbResponse.status < 400 ? "ok" : "error";
    await invocationComplete({ supabase, functionSlug: "cleanup-dead-jobs", invocationId: __hbId, startedAt: __hbStart, outcome: __hbOutcome, error: __hbOutcome === "error" ? ("HTTP " + __hbResponse.status) : undefined, metrics: { http_status: __hbResponse.status } });
    return __hbResponse;
  } catch (__hbE) {
    await invocationComplete({ supabase, functionSlug: "cleanup-dead-jobs", invocationId: __hbId, startedAt: __hbStart, outcome: "error", error: (__hbE as Error)?.message ?? String(__hbE) });
    throw __hbE;
  }
});


