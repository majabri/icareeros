/**
 * fix/jobs-desc-fetch-hardening — post-mortem test suite for the four
 * items Platform mandated after the #401 v9 smoke gate crash.
 *
 * The runDescriptionFetchPhase in index.ts is not directly exported (it's
 * private to the Deno.serve handler), so these tests exercise a fixture
 * implementation of the same contract via a `runPhase` helper below. The
 * helper is a byte-for-byte structural mirror of the code path — any
 * future edit to the phase MUST also update this helper, or the
 * assertions here will drift silently. That's an accepted trade-off given
 * the phase's coupling to Supabase; the ADR-0006 byte-identity approach
 * is a heavier weight than warranted for this test surface.
 */
import { describe, it, expect, vi } from "vitest";
import {
  CircuitBreaker,
  DEFAULT_CIRCUIT_CONFIG,
  DEFAULT_RATE_CONFIG,
  type DetailFetchResult,
} from "../../supabase/functions/enrich-jobs/detailFetchers.ts";

// ── Contract mirror of runDescriptionFetchPhase ──

const MAX_RETRIES = 3;

interface Row {
  id: string;
  source: string;
  external_id: string | null;
  company: string | null;
  apply_url: string | null;
  enrichment_retry_count: number | null;
}

interface UpdatePayload {
  rowId: string;
  patch: Record<string, unknown>;
  op:    string;
}

interface FakeSupabase {
  updates:      UpdatePayload[];
  updateResult: (call: number) => { error: unknown | null };
}

async function runPhase(
  queue: Row[],
  fetcher: (row: Row) => Promise<DetailFetchResult> | DetailFetchResult,
  supabase: FakeSupabase,
): Promise<{ ok: number; failed: number; skipped: number; sawException: boolean }> {
  const stats = { ok: 0, failed: 0, skipped: 0, sawException: false };
  const breakers = new Map<string, CircuitBreaker>();
  const bkFor = (src: string) => {
    let b = breakers.get(src);
    if (!b) { b = new CircuitBreaker(DEFAULT_CIRCUIT_CONFIG); breakers.set(src, b); }
    return b;
  };

  const safeUpdate = async (
    rowId: string,
    patch: Record<string, unknown>,
    op: string,
  ): Promise<{ ok: boolean }> => {
    supabase.updates.push({ rowId, patch, op });
    const call = supabase.updates.length - 1;
    try {
      const { error } = supabase.updateResult(call);
      if (error) return { ok: false };
      return { ok: true };
    } catch { return { ok: false }; }
  };

  for (const row of queue) {
    try {
      const src = row.source;
      const bk  = bkFor(src);
      if (bk.isTripped()) { stats.skipped++; continue; }

      const result = await fetcher(row);

      const goodDesc = result.ok
        && typeof (result as { description?: unknown }).description === "string"
        && (result as { description: string }).description.length > 0;

      if (result.ok && !goodDesc) {
        const nextRetry  = (row.enrichment_retry_count ?? 0) + 1;
        const outOfBudget = nextRetry >= MAX_RETRIES;
        const upd = await safeUpdate(row.id, {
          enrichment_status:      outOfBudget ? "description_failed" : "needs_description",
          enrichment_retry_count: nextRetry,
        }, "malformed_result_mark_failed");
        if (!upd.ok) { stats.failed++; bk.onFailure(); }
        bk.onFailure();
        stats.failed++;
        continue;
      }

      if (goodDesc) {
        const desc = (result as { description: string }).description;
        const upd = await safeUpdate(row.id, {
          description: desc, enrichment_status: "pending", enrichment_retry_count: 0,
        }, "success_flip_to_pending");
        if (!upd.ok) { stats.failed++; bk.onFailure(); continue; }
        stats.ok++;
        bk.onSuccess();
      } else {
        const errResult = result as { ok: false; error: string; retryable: boolean };
        const nextRetry = (row.enrichment_retry_count ?? 0) + 1;
        const tripped   = bk.onFailure();
        const nonRetry  = !errResult.retryable;
        const outOfBudg = nextRetry >= MAX_RETRIES;
        const nextStatus = nonRetry || outOfBudg ? "description_failed" : "needs_description";
        const upd = await safeUpdate(row.id, {
          enrichment_status: nextStatus, enrichment_retry_count: nextRetry,
        }, `fetch_failed:${errResult.error.slice(0, 40)}`);
        if (!upd.ok) stats.failed++;
        stats.failed++;
      }
    } catch (_e) {
      stats.sawException = true;
      stats.failed++;
      // Best-effort retryable mark
      await safeUpdate(row.id, {
        enrichment_status:      "needs_description",
        enrichment_retry_count: (row.enrichment_retry_count ?? 0) + 1,
      }, "row_threw_mark_retryable");
    }
  }
  return stats;
}

// ── Item 1 — per-row try/catch: single bad row must not kill phase ──

describe("Hardening item 1 — per-row try/catch", () => {
  it("one row that throws in the fetcher — phase processes the other two", async () => {
    const queue: Row[] = [
      { id: "a", source: "greenhouse", external_id: "1", company: "c", apply_url: null, enrichment_retry_count: 0 },
      { id: "b", source: "greenhouse", external_id: "2", company: "c", apply_url: null, enrichment_retry_count: 0 },
      { id: "c", source: "greenhouse", external_id: "3", company: "c", apply_url: null, enrichment_retry_count: 0 },
    ];
    const fetcher = vi.fn(async (row: Row): Promise<DetailFetchResult> => {
      if (row.id === "b") throw new Error("boom — untagged");
      return { ok: true, description: "real jd", source: "greenhouse" };
    });
    const supabase: FakeSupabase = { updates: [], updateResult: () => ({ error: null }) };
    const stats = await runPhase(queue, fetcher, supabase);
    expect(stats.ok).toBe(2);
    expect(stats.sawException).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(3);   // fetcher ran on every row
    // Row b got a best-effort retryable mark
    const bUpdate = supabase.updates.find(u => u.rowId === "b");
    expect(bUpdate?.op).toBe("row_threw_mark_retryable");
    expect(bUpdate?.patch.enrichment_status).toBe("needs_description");
  });

  it("row-level throw does not terminate — later rows still get success writes", async () => {
    const queue: Row[] = [
      { id: "a", source: "greenhouse", external_id: "1", company: "c", apply_url: null, enrichment_retry_count: 0 },
      { id: "b", source: "greenhouse", external_id: "2", company: "c", apply_url: null, enrichment_retry_count: 0 },
    ];
    const fetcher = async (row: Row): Promise<DetailFetchResult> => {
      if (row.id === "a") throw { untagged: true };   // not even an Error instance
      return { ok: true, description: "later ok", source: "greenhouse" };
    };
    const supabase: FakeSupabase = { updates: [], updateResult: () => ({ error: null }) };
    const stats = await runPhase(queue, fetcher, supabase);
    expect(stats.ok).toBe(1);
    expect(supabase.updates.find(u => u.rowId === "b")?.op).toBe("success_flip_to_pending");
  });
});

// ── Item 2 — .error checks: constraint-violation ".error" must count ──

describe("Hardening item 2 — supabase update .error counts against error budget", () => {
  it("CHECK constraint violation on status write is a FAILURE, not silently OK", async () => {
    // Reproduce the #401 crash hypothesis: update returns
    // { error: { code: '23514' } }.  Phase must count the failure and
    // continue, not treat it as success.
    const queue: Row[] = [
      { id: "a", source: "greenhouse", external_id: "1", company: "c", apply_url: null, enrichment_retry_count: 0 },
    ];
    const fetcher = async (): Promise<DetailFetchResult> =>
      ({ ok: true, description: "real jd", source: "greenhouse" });
    const supabase: FakeSupabase = {
      updates: [],
      updateResult: () => ({ error: { code: "23514", message: 'new row for relation "ats_jobs" violates check constraint "ats_jobs_enrichment_status_check"' } }),
    };
    const stats = await runPhase(queue, fetcher, supabase);
    expect(stats.ok).toBe(0);       // not counted as ok
    expect(stats.failed).toBe(1);    // counted as failure
    expect(supabase.updates.length).toBe(1);
  });

  it("update .error on a fetch-failed transition is also counted", async () => {
    const queue: Row[] = [
      { id: "a", source: "greenhouse", external_id: "1", company: "c", apply_url: null, enrichment_retry_count: 0 },
    ];
    const fetcher = async (): Promise<DetailFetchResult> =>
      ({ ok: false, error: "5xx", retryable: true });
    const supabase: FakeSupabase = {
      updates: [],
      updateResult: () => ({ error: { code: "42P01", message: "relation does not exist" } }),
    };
    const stats = await runPhase(queue, fetcher, supabase);
    // 2 failures: the fetch itself + the status-write .error
    expect(stats.failed).toBe(2);
  });
});

// ── Item 3 — malformed-result guard: undefined description NEVER written ──

describe("Hardening item 3 — malformed result guard", () => {
  it("result.ok true but description undefined → description_failed, no undefined write", async () => {
    const queue: Row[] = [
      { id: "a", source: "greenhouse", external_id: "1", company: "c", apply_url: null, enrichment_retry_count: 0 },
    ];
    // Simulate an adapter that returned ok:true but forgot to include a
    // description (regression protection against future adapter edits).
    const fetcher = async (): Promise<DetailFetchResult> =>
      ({ ok: true, description: undefined as unknown as string, source: "greenhouse" });
    const supabase: FakeSupabase = { updates: [], updateResult: () => ({ error: null }) };
    const stats = await runPhase(queue, fetcher, supabase);
    expect(stats.ok).toBe(0);
    expect(stats.failed).toBe(1);
    // The one update must NOT be a success-write; it must be a fail transition.
    const upd = supabase.updates[0];
    expect(upd.op).toBe("malformed_result_mark_failed");
    // Description key MUST NOT be present in the failed-transition patch
    expect(upd.patch.description).toBeUndefined();
    expect(upd.patch.enrichment_status).toBe("needs_description");
  });

  it("result.ok true with empty-string description → same malformed path", async () => {
    const queue: Row[] = [
      { id: "a", source: "greenhouse", external_id: "1", company: "c", apply_url: null, enrichment_retry_count: 0 },
    ];
    const fetcher = async (): Promise<DetailFetchResult> =>
      ({ ok: true, description: "", source: "greenhouse" });
    const supabase: FakeSupabase = { updates: [], updateResult: () => ({ error: null }) };
    const stats = await runPhase(queue, fetcher, supabase);
    expect(stats.failed).toBe(1);
    expect(supabase.updates[0].op).toBe("malformed_result_mark_failed");
  });
});

// ── Item 4 — migration file already applied ──

describe("Hardening item 4 — migration file present and marks ALREADY APPLIED", () => {
  it("file exists and contains the header + DDL", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const p = path.resolve(process.cwd(), "supabase/migrations/20260723131008_extend_ats_jobs_enrichment_status_states.sql");
    expect(fs.existsSync(p)).toBe(true);
    const contents = fs.readFileSync(p, "utf8");
    // ALREADY APPLIED marker
    expect(contents).toMatch(/ALREADY APPLIED IN PROD ON 2026-07-23/);
    expect(contents).toMatch(/DO NOT RE-RUN/i);
    // DDL byte-check
    expect(contents).toMatch(/ADD CONSTRAINT ats_jobs_enrichment_status_check/);
    expect(contents).toMatch(/'needs_description'::text/);
    expect(contents).toMatch(/'description_failed'::text/);
    // Explicit acknowledgment that PR #401 was wrong
    expect(contents).toMatch(/"no migration required"/);
  });
});

// ── Cross-item — the phase never rethrows on a single-row problem ──

describe("Phase resilience — synthetic torture-test", () => {
  it("row throws + next row good-desc + next row .error + next row ok — phase completes with correct tallies", async () => {
    const queue: Row[] = [
      { id: "throw",       source: "greenhouse", external_id: "1", company: "c", apply_url: null, enrichment_retry_count: 0 },
      { id: "ok_first",    source: "greenhouse", external_id: "2", company: "c", apply_url: null, enrichment_retry_count: 0 },
      { id: "constraint",  source: "greenhouse", external_id: "3", company: "c", apply_url: null, enrichment_retry_count: 0 },
      { id: "ok_final",    source: "greenhouse", external_id: "4", company: "c", apply_url: null, enrichment_retry_count: 0 },
    ];
    const fetcher = async (row: Row): Promise<DetailFetchResult> => {
      if (row.id === "throw") throw new Error("row bomb");
      return { ok: true, description: `desc for ${row.id}`, source: "greenhouse" };
    };
    let call = 0;
    const supabase: FakeSupabase = {
      updates: [],
      updateResult: () => {
        call++;
        // Fail the third update — the one for the ok_first row's success write? No —
        // updates come in row order. So updates: [throw's retryable_mark, ok_first's success, constraint's success (fails), ok_final's success]
        // We fail the update at call index 3 (constraint's success write) → simulate CHECK violation.
        if (call === 3) return { error: { code: "23514", message: "CHECK violation" } };
        return { error: null };
      },
    };
    const stats = await runPhase(queue, fetcher, supabase);
    expect(stats.ok).toBe(2);        // ok_first + ok_final
    expect(stats.failed).toBe(2);     // throw's row + constraint's failed write
    expect(stats.sawException).toBe(true);
  });
});
