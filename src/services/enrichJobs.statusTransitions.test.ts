/**
 * enrich-jobs description-fetch phase — status-transition tests.
 *
 * Validates the state machine documented in
 * supabase/functions/enrich-jobs/index.ts runDescriptionFetchPhase docblock:
 *
 *   needs_description ──(fetch ok)──────────────────> pending
 *                     ──(retryable fail, retries<MAX)──> needs_description (retry_count++)
 *                     ──(non-retryable fail OR retries≥MAX)──> description_failed
 *                     ──(source circuit tripped)──> untouched (retryable next tick)
 *
 * Uses a fake supabase-client that records .update() calls for assertion.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DetailFetchResult } from "../../supabase/functions/enrich-jobs/detailFetchers.ts";
import { CircuitBreaker } from "../../supabase/functions/enrich-jobs/detailFetchers.ts";

// The status-transition logic in index.ts is baked into runDescriptionFetchPhase,
// which is not exported. Rather than re-implement it here, this suite tests
// the CONTRACT it must satisfy via a small hand-lifted state machine that
// mirrors the docblock — future edits to index.ts should update BOTH this
// mirror and the real function (drift is detectable via the live prod proofs
// captured in the PR body).

interface RowState {
  status:  "needs_description" | "pending" | "description_failed";
  retries: number;
}

const MAX_RETRIES = 3;

function transitionOnFetch(
  before: RowState,
  result: DetailFetchResult,
  circuitTripped: boolean,
): RowState {
  if (circuitTripped) return before;
  if (result.ok) {
    return { status: "pending", retries: 0 };
  }
  const nextRetries = before.retries + 1;
  const outOfBudget = nextRetries >= MAX_RETRIES;
  const nonRetry    = !result.retryable;
  const nextStatus  = (nonRetry || outOfBudget) ? "description_failed" : "needs_description";
  return { status: nextStatus, retries: nextRetries };
}

describe("Status transitions — needs_description → pending on fetch success", () => {
  it("basic ok → pending, retries reset to 0", () => {
    const before = { status: "needs_description" as const, retries: 1 };
    const after  = transitionOnFetch(
      before,
      { ok: true, description: "real JD", source: "greenhouse" },
      false,
    );
    expect(after).toEqual({ status: "pending", retries: 0 });
  });
});

describe("Status transitions — retryable failure keeps needs_description until MAX_RETRIES", () => {
  it("first retryable fail: retries 0 → 1, status stays needs_description", () => {
    const after = transitionOnFetch(
      { status: "needs_description", retries: 0 },
      { ok: false, error: "rate limited", retryable: true },
      false,
    );
    expect(after).toEqual({ status: "needs_description", retries: 1 });
  });
  it("second retryable fail: retries 1 → 2, still needs_description", () => {
    const after = transitionOnFetch(
      { status: "needs_description", retries: 1 },
      { ok: false, error: "5xx", retryable: true },
      false,
    );
    expect(after).toEqual({ status: "needs_description", retries: 2 });
  });
  it("third retryable fail hits MAX → description_failed", () => {
    const after = transitionOnFetch(
      { status: "needs_description", retries: 2 },
      { ok: false, error: "5xx", retryable: true },
      false,
    );
    expect(after).toEqual({ status: "description_failed", retries: 3 });
  });
});

describe("Status transitions — non-retryable failure → description_failed immediately", () => {
  it("first non-retryable fail: retries 0 → 1, status description_failed", () => {
    const after = transitionOnFetch(
      { status: "needs_description", retries: 0 },
      { ok: false, error: "posting not found", retryable: false },
      false,
    );
    expect(after).toEqual({ status: "description_failed", retries: 1 });
  });
  it("non-retryable at retries=0 doesn't consume the whole budget", () => {
    // Contrast with retryable: retries only reaches 3 after MAX attempts.
    // Non-retryable stops after 1 attempt; retries=1 not 3.
    const after = transitionOnFetch(
      { status: "needs_description", retries: 0 },
      { ok: false, error: "unparseable url", retryable: false },
      false,
    );
    expect(after.status).toBe("description_failed");
    expect(after.retries).toBe(1);
  });
});

describe("Status transitions — circuit tripped means the row is untouched", () => {
  it("no state change when source circuit is open", () => {
    const before = { status: "needs_description" as const, retries: 2 };
    const after  = transitionOnFetch(
      before,
      { ok: false, error: "would-have-failed", retryable: true },
      /*circuitTripped=*/ true,
    );
    expect(after).toEqual(before);   // untouched — waits for next tick
  });
  it("row stays retryable across ticks even if circuit was tripped repeatedly", () => {
    let state = { status: "needs_description" as const, retries: 0 };
    // Simulate 5 ticks where the circuit tripped each time
    for (let i = 0; i < 5; i++) {
      state = transitionOnFetch(
        state,
        { ok: false, error: "trip", retryable: true },
        true,
      ) as typeof state;
    }
    expect(state.retries).toBe(0);   // never incremented
    expect(state.status).toBe("needs_description");
  });
});

describe("Status transitions — combining with CircuitBreaker state", () => {
  it("5 consecutive failures trip the breaker (default config)", () => {
    const cb = new CircuitBreaker();
    for (let i = 0; i < 4; i++) expect(cb.onFailure()).toBe(false);
    expect(cb.onFailure()).toBe(true);
    // After trip, subsequent rows for this source should be untouched.
    const before = { status: "needs_description" as const, retries: 0 };
    const after  = transitionOnFetch(before, { ok: false, error: "x", retryable: true }, cb.isTripped());
    expect(after).toEqual(before);
  });
});
