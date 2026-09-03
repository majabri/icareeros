/**
 * fix/ingest-ats-wall-clock-timeout — chained-continuation tests for
 * `ingest-ats-direct`.
 *
 * Production evidence this fixes (project kuneabeiwcxavvyyfjkx,
 * `public.infrastructure_events`, three days to 2026-09-03):
 *   edge-fn.ingest-ats-direct  invocation.start  39   invocation.complete  0
 *   edge-fn.enrich-jobs        invocation.start 166   invocation.complete 166
 * Every ingest run died on the ~150s edge wall clock, so nothing after the
 * five-source `Promise.allSettled` fan-out ever ran. enrich-jobs, which
 * already uses this chained-continuation pattern, completes every time.
 *
 * These tests cover the invariants that make the chain safe:
 *   - it terminates (a cursor never rewinds; the depth cap is respected),
 *   - it is total (a complete cursor means every source was walked),
 *   - it survives an untrusted request body, since the function is
 *     deployed verify_jwt=false and its body is attacker-reachable.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  DONE,
  MAX_CHAIN_DEPTH,
  MAX_ERROR_SAMPLES,
  SLICE_BUDGET_MS,
  accumulate,
  freshCursor,
  freshTotals,
  isCursorComplete,
  normalizeChainDepth,
  normalizeCursor,
  normalizeTotals,
  remainingUnits,
  shouldChain,
  totalErrors,
  totalUpserted,
  type IngestCursor,
  type SourceSizes,
} from "../../supabase/functions/ingest-ats-direct/chainState.ts";

const SIZES: SourceSizes = {
  greenhouse: 55, lever: 19, ashby: 25, workday: 17, smartrecruiters: 5,
};

const completeCursor = (): IngestCursor => ({
  greenhouse: SIZES.greenhouse,
  lever:      SIZES.lever,
  ashby:      SIZES.ashby,
  workday:         new Array(SIZES.workday).fill(DONE),
  smartrecruiters: new Array(SIZES.smartrecruiters).fill(DONE),
});

// ─────────────────────────────────────────────────────────────────────
// Cursor completeness — the condition that ends the chain
// ─────────────────────────────────────────────────────────────────────

describe("isCursorComplete", () => {
  it("a fresh cursor is not complete", () => {
    expect(isCursorComplete(freshCursor(SIZES), SIZES)).toBe(false);
  });

  it("all five sources exhausted is complete", () => {
    expect(isCursorComplete(completeCursor(), SIZES)).toBe(true);
  });

  it.each([
    ["greenhouse", (c: IngestCursor) => { c.greenhouse = SIZES.greenhouse - 1; }],
    ["lever",      (c: IngestCursor) => { c.lever = SIZES.lever - 1; }],
    ["ashby",      (c: IngestCursor) => { c.ashby = SIZES.ashby - 1; }],
    ["workday",    (c: IngestCursor) => { c.workday[9] = 40; }],
    ["smartrecruiters", (c: IngestCursor) => { c.smartrecruiters[3] = 200; }],
  ])("a single unfinished %s keeps the cycle incomplete", (_name, dirty) => {
    const c = completeCursor();
    dirty(c);
    expect(isCursorComplete(c, SIZES)).toBe(false);
  });

  it("an index past the list length still counts as exhausted", () => {
    // Defensive: the greenhouse slice returns min(i, length), but a body
    // could carry a larger value and must not wedge the chain forever.
    const c = completeCursor();
    c.greenhouse = SIZES.greenhouse + 100;
    expect(isCursorComplete(c, SIZES)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Chain termination — the property v4 lacked entirely
// ─────────────────────────────────────────────────────────────────────

describe("shouldChain", () => {
  it("chains while work remains and depth is unspent", () => {
    expect(shouldChain(0, freshCursor(SIZES), SIZES)).toBe(true);
    expect(shouldChain(MAX_CHAIN_DEPTH - 1, freshCursor(SIZES), SIZES)).toBe(true);
  });

  it("stops at the depth cap even with work remaining (truncated cycle)", () => {
    expect(shouldChain(MAX_CHAIN_DEPTH, freshCursor(SIZES), SIZES)).toBe(false);
    expect(shouldChain(MAX_CHAIN_DEPTH + 5, freshCursor(SIZES), SIZES)).toBe(false);
  });

  it("stops as soon as the cycle is complete, well under the cap", () => {
    expect(shouldChain(3, completeCursor(), SIZES)).toBe(false);
  });

  it("a chain that always advances one source terminates inside the cap", () => {
    // Upper bound on real chain length: the slowest possible chain still
    // has to finish, or the terminal work never runs — the v4 failure mode.
    const cursor = freshCursor(SIZES);
    let depth = 0;
    while (shouldChain(depth, cursor, SIZES)) {
      if (cursor.greenhouse < SIZES.greenhouse) cursor.greenhouse = Math.min(cursor.greenhouse + 20, SIZES.greenhouse);
      else if (cursor.lever < SIZES.lever) cursor.lever = SIZES.lever;
      else if (cursor.ashby < SIZES.ashby) cursor.ashby = SIZES.ashby;
      else {
        const wd = cursor.workday.findIndex(o => o !== DONE);
        if (wd >= 0) cursor.workday[wd] = DONE;
        else {
          const sr = cursor.smartrecruiters.findIndex(o => o !== DONE);
          if (sr >= 0) cursor.smartrecruiters[sr] = DONE;
        }
      }
      depth++;
    }
    expect(isCursorComplete(cursor, SIZES)).toBe(true);
    expect(depth).toBeLessThan(MAX_CHAIN_DEPTH);
  });
});

describe("normalizeChainDepth", () => {
  it("defaults a missing/garbage depth to 0 (fresh cron tick)", () => {
    for (const v of [undefined, null, "3", NaN, Infinity, {}]) {
      expect(normalizeChainDepth(v)).toBe(0);
    }
  });

  it("clamps a negative or over-cap depth into range", () => {
    expect(normalizeChainDepth(-7)).toBe(0);
    expect(normalizeChainDepth(MAX_CHAIN_DEPTH + 1000)).toBe(MAX_CHAIN_DEPTH);
    expect(normalizeChainDepth(4.9)).toBe(4);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Untrusted-body hardening — the function is deployed verify_jwt=false
// ─────────────────────────────────────────────────────────────────────

describe("normalizeCursor", () => {
  it("returns a fresh cursor for a missing or non-object body value", () => {
    for (const v of [undefined, null, "nope", 42, []]) {
      expect(normalizeCursor(v, SIZES)).toEqual(freshCursor(SIZES));
    }
  });

  it("round-trips a well-formed cursor unchanged", () => {
    const c: IngestCursor = {
      greenhouse: 40, lever: 19, ashby: 0,
      workday:         [0, DONE, 60, ...new Array(SIZES.workday - 3).fill(DONE)],
      smartrecruiters: [DONE, 100, DONE, DONE, 0],
    };
    expect(normalizeCursor(JSON.parse(JSON.stringify(c)), SIZES)).toEqual(c);
  });

  it("restarts the cycle when an array length no longer matches the config", () => {
    // A deploy that adds a Workday tenant mid-chain: old positions can't be
    // mapped onto the new list, so restart rather than skip a source.
    const stale = { ...freshCursor(SIZES), workday: new Array(SIZES.workday - 1).fill(DONE) };
    expect(normalizeCursor(stale, SIZES)).toEqual(freshCursor(SIZES));
  });

  it("clamps out-of-range slug indices instead of over-running the list", () => {
    const c = normalizeCursor({ ...freshCursor(SIZES), greenhouse: 9999, lever: -4 }, SIZES);
    expect(c.greenhouse).toBe(SIZES.greenhouse);
    expect(c.lever).toBe(0);
  });

  it("coerces junk offsets to 0 and preserves the DONE sentinel", () => {
    const c = normalizeCursor({
      ...freshCursor(SIZES),
      smartrecruiters: [DONE, "100", -3, NaN, 200],
    }, SIZES);
    expect(c.smartrecruiters).toEqual([DONE, 0, 0, 0, 200]);
  });
});

describe("normalizeTotals", () => {
  it("returns zeroed totals for a missing or junk body value", () => {
    expect(normalizeTotals(undefined)).toEqual(freshTotals());
    expect(normalizeTotals("nope")).toEqual(freshTotals());
  });

  it("keeps well-formed per-source counts and drops negatives/non-numbers", () => {
    const t = normalizeTotals({
      greenhouse: { upserted: 120, errors: 3 },
      lever:      { upserted: -5, errors: "many" },
    });
    expect(t.greenhouse).toEqual({ upserted: 120, errors: 3 });
    expect(t.lever).toEqual({ upserted: 0, errors: 0 });
    expect(t.smartrecruiters).toEqual({ upserted: 0, errors: 0 });
  });

  it("caps and shape-checks inbound error samples", () => {
    const t = normalizeTotals({
      errorSamples: [
        ...new Array(MAX_ERROR_SAMPLES + 20).fill({ source: "ashby", error: "HTTP 404" }),
        { source: "bad" },
      ],
    });
    expect(t.errorSamples).toHaveLength(MAX_ERROR_SAMPLES);
    expect(t.errorSamples.every(e => typeof e.error === "string")).toBe(true);
  });

  it("truncates an oversized sample string rather than carrying it forward", () => {
    const t = normalizeTotals({ errorSamples: [{ source: "x".repeat(200), error: "y".repeat(9000) }] });
    expect(t.errorSamples[0].source).toHaveLength(40);
    expect(t.errorSamples[0].error).toHaveLength(200);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Totals accumulation across chain links — Bug 4's counts, made durable
// ─────────────────────────────────────────────────────────────────────

describe("accumulate + roll-up", () => {
  it("sums across links so the terminal link reports the whole cycle", () => {
    const totals = freshTotals();
    accumulate(totals, "greenhouse", 100, ["greenhouse:acme:HTTP 404"]);
    accumulate(totals, "workday", 40, []);
    // ...next chain link, resuming from the serialized totals
    const resumed = normalizeTotals(JSON.parse(JSON.stringify(totals)));
    accumulate(resumed, "greenhouse", 50, []);
    accumulate(resumed, "smartrecruiters", 10, ["smartrecruiters:Visa:HTTP 429"]);

    expect(totalUpserted(resumed)).toBe(200);
    expect(totalErrors(resumed)).toBe(2);
    expect(resumed.errorSamples.map(e => e.source)).toEqual(["greenhouse", "smartrecruiters"]);
  });

  it("stops collecting samples at the cap but keeps counting errors", () => {
    const totals = freshTotals();
    accumulate(totals, "lever", 0, new Array(MAX_ERROR_SAMPLES + 25).fill("lever:x:HTTP 500"));
    expect(totals.errorSamples).toHaveLength(MAX_ERROR_SAMPLES);
    expect(totals.lever.errors).toBe(MAX_ERROR_SAMPLES + 25);
  });
});

describe("remainingUnits", () => {
  it("reports zero everywhere on a complete cycle", () => {
    expect(remainingUnits(completeCursor(), SIZES)).toEqual({
      greenhouse: 0, lever: 0, ashby: 0, workday: 0, smartrecruiters: 0,
    });
  });

  it("reports what is left mid-chain", () => {
    const c = freshCursor(SIZES);
    c.greenhouse = 40;
    c.workday = c.workday.map((_, i) => (i < 12 ? DONE : 0));
    expect(remainingUnits(c, SIZES)).toMatchObject({ greenhouse: 15, workday: 5 });
  });
});

// ─────────────────────────────────────────────────────────────────────
// Handler wiring — the structural half of the fix
// ─────────────────────────────────────────────────────────────────────

describe("ingest-ats-direct handler wiring", () => {
  const src = readFileSync(
    resolve(process.cwd(), "supabase/functions/ingest-ats-direct/index.ts"),
    "utf8",
  );

  it("no longer fans all five sources out in one unbounded Promise.allSettled", () => {
    // The v4 shape. Its await never returned inside the wall clock, which
    // is why every line after it was dead code in production.
    expect(src).not.toMatch(/allSettled\(\[\s*\n\s*ingestGreenhouse/);
  });

  it("every adapter takes the slice deadline", () => {
    for (const fn of ["ingestGreenhouse", "ingestLever", "ingestAshby", "ingestWorkday", "ingestSmartRecruiters"]) {
      expect(src, `${fn} must accept a deadline`).toMatch(
        new RegExp(`async function ${fn}\\([^)]*deadline: number`),
      );
    }
  });

  it("runs the slice against a deadline derived from SLICE_BUDGET_MS", () => {
    expect(src).toMatch(/runSlice\(supabase, cursor, totals, startTime \+ SLICE_BUDGET_MS\)/);
  });

  it("self-invokes ingest-ats-direct (not some other function) when work remains", () => {
    expect(src).toMatch(/functions\/v1\/ingest-ats-direct/);
    expect(src).toMatch(/chainDepth:\s+state\.chainDepth \+ 1/);
  });

  it("guards the self-invoke on MAX_CHAIN_DEPTH", () => {
    expect(src).toMatch(/if \(state\.chainDepth >= MAX_CHAIN_DEPTH\) return;/);
  });

  it("runs the deactivation sweep, enrich kick and cycle roll-up on the terminal link", () => {
    const terminalBlock = src.slice(src.indexOf("if (terminal) {"), src.indexOf("} else {", src.indexOf("if (terminal) {")));
    expect(terminalBlock).toMatch(/deactivateStaleJobs\(supabase\)/);
    expect(terminalBlock).toMatch(/kickEnrichJobs\(\)/);
    expect(terminalBlock).toMatch(/logCycleComplete\(/);
  });

  it("only sweeps stale jobs on a COMPLETE cycle, never a truncated one", () => {
    expect(src).toMatch(/if \(cycleComplete\) deactivated = await deactivateStaleJobs\(supabase\)/);
  });

  it("passes chainDepth into the heartbeat so the chain is observable", () => {
    expect(src).toMatch(/invocationStart\(\{[\s\S]*?chainDepth,[\s\S]*?\}\)/);
  });

  it("keeps the deploy note that this function must stay verify_jwt=false", () => {
    // Runbook gotcha #8 — docs/OBSERVABILITY_HEARTBEAT.md. A deploy that
    // flips verify_jwt breaks both the Vercel-cron caller and the chain.
    expect(src).toMatch(/--no-verify-jwt/);
    expect(src).toMatch(/verify_jwt=false/);
  });

  it("bounds per-slice pagination below the slice budget", () => {
    // Worst-case overshoot past the soft deadline is one work unit: the
    // deepest unit is `pages x FETCH_TIMEOUT_MS`, so the product has to
    // leave room inside the ~150s wall clock.
    const pagesPerSlice = Number(src.match(/const WD_PAGES_PER_SLICE = (\d+)/)![1]);
    const srPagesPerSlice = Number(src.match(/const SR_PAGES_PER_SLICE = (\d+)/)![1]);
    const fetchTimeout = Number(src.match(/const FETCH_TIMEOUT_MS = ([\d_]+)/)![1].replace(/_/g, ""));
    const worstUnitMs = Math.max(pagesPerSlice, srPagesPerSlice) * fetchTimeout;
    expect(SLICE_BUDGET_MS + worstUnitMs).toBeLessThan(150_000);
  });
});
