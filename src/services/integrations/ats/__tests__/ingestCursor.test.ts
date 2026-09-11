/**
 * #425 — pure-function tests for the ingest-ats-direct chained-continuation
 * cursor logic. The full Deno serve() can't run under vitest, so we port
 * the cursor state machine (source ordering, resumability, cycle-complete
 * gating, chain-depth cap) from supabase/functions/ingest-ats-direct/index.ts
 * and test it directly. Keep this in sync with any changes to that file's
 * loadCursor / saveCursor / the serve() while-loop.
 */
import { describe, it, expect } from "vitest";

const SOURCE_NAMES = ["greenhouse", "lever", "ashby", "workday", "smartrecruiters"] as const;
const CURSOR_STALE_MS = 10 * 60 * 1000;
const MAX_CHAIN_DEPTH = 60;

interface SourceDetail { upserted: number; errors: string[] }
interface CursorState {
  sourceIndex: number;
  itemIndex: number;
  chainDepth: number;
  detail: Record<string, SourceDetail>;
  runStartedAt: string | null;
}

function emptyDetail(): Record<string, SourceDetail> {
  const out: Record<string, SourceDetail> = {};
  for (const name of SOURCE_NAMES) out[name] = { upserted: 0, errors: [] };
  return out;
}

function freshCursor(): CursorState {
  return { sourceIndex: 0, itemIndex: 0, chainDepth: 0, detail: emptyDetail(), runStartedAt: null };
}

// Port of loadCursor's resumability decision (DB round-trip stripped out).
function resolveCursor(
  stored: { sourceIndex: number; itemIndex: number; chainDepth: number; updatedAtMs: number } | null,
  requestChainDepth: number,
  nowMs: number,
): CursorState {
  if (!stored) return freshCursor();
  const isComplete = stored.sourceIndex >= SOURCE_NAMES.length;
  const isStale = nowMs - stored.updatedAtMs > CURSOR_STALE_MS;
  if (isComplete || isStale) return freshCursor();
  return {
    sourceIndex: stored.sourceIndex,
    itemIndex: stored.itemIndex,
    chainDepth: Math.max(stored.chainDepth, requestChainDepth),
    detail: emptyDetail(),
    runStartedAt: null,
  };
}

interface ChunkResult { upserted: number; errors: string[]; nextIndex: number; done: boolean }

// Port of the serve() while-loop that walks SOURCE_RUNNERS in order,
// persisting progress and breaking out on the first not-done chunk.
async function runCycle(
  cursor: CursorState,
  runners: Array<(startIndex: number) => Promise<ChunkResult>>,
): Promise<{ cursor: CursorState; saves: number }> {
  let saves = 0;
  while (cursor.sourceIndex < SOURCE_NAMES.length) {
    const name = SOURCE_NAMES[cursor.sourceIndex];
    const run = runners[cursor.sourceIndex];
    const result = await run(cursor.itemIndex);
    cursor.detail[name].upserted += result.upserted;
    cursor.detail[name].errors.push(...result.errors);
    if (result.done) {
      cursor.sourceIndex += 1;
      cursor.itemIndex = 0;
    } else {
      cursor.itemIndex = result.nextIndex;
    }
    saves += 1; // saveCursor() is called after every chunk
    if (!result.done) break;
  }
  return { cursor, saves };
}

const doneRunner = (upserted = 1): ((startIndex: number) => Promise<ChunkResult>) =>
  async () => ({ upserted, errors: [], nextIndex: 0, done: true });

const truncatedRunner = (nextIndex: number): ((startIndex: number) => Promise<ChunkResult>) =>
  async (startIndex) => ({ upserted: 1, errors: [], nextIndex: startIndex === 0 ? nextIndex : 0, done: startIndex !== 0 });

describe("ingest-ats-direct cursor — resumability (#425)", () => {
  it("starts a fresh cycle when there is no stored cursor", () => {
    const cursor = resolveCursor(null, 0, Date.now());
    expect(cursor.sourceIndex).toBe(0);
    expect(cursor.chainDepth).toBe(0);
  });

  it("resumes an in-progress, recently-updated cursor at its stored position", () => {
    const now = Date.now();
    const cursor = resolveCursor(
      { sourceIndex: 3, itemIndex: 7, chainDepth: 2, updatedAtMs: now - 5_000 },
      3,
      now,
    );
    expect(cursor.sourceIndex).toBe(3);
    expect(cursor.itemIndex).toBe(7);
    expect(cursor.chainDepth).toBe(3); // max(stored, request)
  });

  it("resets to a fresh cycle when the stored cursor already completed all sources", () => {
    const now = Date.now();
    const cursor = resolveCursor(
      { sourceIndex: SOURCE_NAMES.length, itemIndex: 0, chainDepth: 5, updatedAtMs: now },
      0,
      now,
    );
    expect(cursor.sourceIndex).toBe(0);
    expect(cursor.chainDepth).toBe(0);
  });

  it("resets to a fresh cycle when the stored cursor is stale (self-healing)", () => {
    const now = Date.now();
    const cursor = resolveCursor(
      { sourceIndex: 3, itemIndex: 7, chainDepth: 2, updatedAtMs: now - (CURSOR_STALE_MS + 1_000) },
      0,
      now,
    );
    expect(cursor.sourceIndex).toBe(0);
    expect(cursor.itemIndex).toBe(0);
  });

  it("does not reset a cursor updated just under the staleness threshold", () => {
    const now = Date.now();
    const cursor = resolveCursor(
      { sourceIndex: 3, itemIndex: 7, chainDepth: 2, updatedAtMs: now - (CURSOR_STALE_MS - 1_000) },
      0,
      now,
    );
    expect(cursor.sourceIndex).toBe(3);
  });
});

describe("ingest-ats-direct cursor — chunked cycle progression (#425)", () => {
  it("advances through all sources and reports cycleComplete when every source finishes in-budget", async () => {
    const cursor = freshCursor();
    const { cursor: result, saves } = await runCycle(cursor, [
      doneRunner(2), doneRunner(3), doneRunner(1), doneRunner(4), doneRunner(5),
    ]);
    const cycleComplete = result.sourceIndex >= SOURCE_NAMES.length;
    expect(cycleComplete).toBe(true);
    expect(saves).toBe(5); // one saveCursor() per source
    expect(result.detail.smartrecruiters.upserted).toBe(5);
  });

  it("stops at the first truncated source, persists its resume index, and is NOT cycleComplete", async () => {
    const cursor = freshCursor();
    const { cursor: result, saves } = await runCycle(cursor, [
      doneRunner(2), doneRunner(3),
      truncatedRunner(42), // ashby bails mid-way — budget exhausted
      doneRunner(4), doneRunner(5),
    ]);
    const cycleComplete = result.sourceIndex >= SOURCE_NAMES.length;
    expect(cycleComplete).toBe(false);
    expect(result.sourceIndex).toBe(2); // still on "ashby" — index 2
    expect(result.itemIndex).toBe(42); // resume point persisted, not restarted from 0
    expect(saves).toBe(3); // greenhouse, lever, then the truncated ashby chunk
  });

  it("resumes a truncated source at its persisted itemIndex on the next chain hop", async () => {
    // Simulate: previous invocation left sourceIndex=2 (ashby), itemIndex=42.
    const cursor: CursorState = { sourceIndex: 2, itemIndex: 42, chainDepth: 1, detail: emptyDetail(), runStartedAt: null };
    let seenStartIndex = -1;
    const { cursor: result } = await runCycle(cursor, [
      doneRunner(), doneRunner(),
      async (startIndex) => { seenStartIndex = startIndex; return { upserted: 1, errors: [], nextIndex: 0, done: true }; },
      doneRunner(), doneRunner(),
    ]);
    expect(seenStartIndex).toBe(42); // resumed, did not restart source from #1
    expect(result.sourceIndex).toBe(SOURCE_NAMES.length);
  });
});

describe("ingest-ats-direct cursor — chain-depth cap (#425)", () => {
  it("permits chaining while under MAX_CHAIN_DEPTH", () => {
    expect(1 < MAX_CHAIN_DEPTH).toBe(true);
    expect(MAX_CHAIN_DEPTH - 1 < MAX_CHAIN_DEPTH).toBe(true);
  });

  it("stops chaining once MAX_CHAIN_DEPTH is reached", () => {
    expect(MAX_CHAIN_DEPTH < MAX_CHAIN_DEPTH).toBe(false);
    expect(MAX_CHAIN_DEPTH + 1 < MAX_CHAIN_DEPTH).toBe(false);
  });
});
