/**
 * fix/ingest-ats-wall-clock-timeout (v5) — chain state for
 * `ingest-ats-direct`'s chained-continuation pattern.
 *
 * Why this is a separate module: `index.ts` imports from `deno.land` /
 * `esm.sh` URLs and so can't be loaded under vitest. This file has zero
 * imports, so the cursor/totals logic that decides when the chain stops is
 * directly unit-testable from Node — same arrangement as
 * `enrich-jobs/detailFetchers.ts`.
 *
 * The cursor is the ONLY thing that guarantees forward progress across
 * chain links, so it must be (a) monotonic — a link never rewinds a source
 * another link already finished, and (b) safe to rebuild from an untrusted
 * request body, since this function is deployed `verify_jwt=false` and its
 * request body is therefore attacker-reachable.
 */

/** Cursor sentinel: this slug/tenant is exhausted for the current cycle. */
export const DONE = -1;

/**
 * Soft deadline for one invocation's slice. Checked only BEFORE starting a
 * work unit, never mid-unit, so worst-case overshoot is a single unit
 * (~30s: 3 paginated pages at a 10s fetch timeout). 60s + 30s is well
 * inside the ~150s edge wall clock that the unsliced v4 hit every run.
 */
export const SLICE_BUDGET_MS = 60_000;

/** Hard stop on the self-invoke chain, mirroring enrich-jobs' cap. */
export const MAX_CHAIN_DEPTH = 60;

/** Cap on the error strings carried forward across links. */
export const MAX_ERROR_SAMPLES = 40;

/** The five ATS sources, in the order a slice walks them. */
export const SOURCE_KEYS = ["greenhouse", "lever", "ashby", "workday", "smartrecruiters"] as const;
export type SourceKey = (typeof SOURCE_KEYS)[number];

/** Lengths of the configured company lists — supplied by index.ts. */
export interface SourceSizes {
  greenhouse:      number;
  lever:           number;
  ashby:           number;
  workday:         number;
  smartrecruiters: number;
}

export interface IngestCursor {
  /** Next unprocessed index into GREENHOUSE (=== length when exhausted). */
  greenhouse: number;
  /** Next unprocessed index into LEVER. */
  lever: number;
  /** Next unprocessed index into ASHBY. */
  ashby: number;
  /** Per-tenant next Workday `offset`; DONE when that tenant is exhausted. */
  workday: number[];
  /** Per-slug next SmartRecruiters `offset`; DONE when exhausted. */
  smartrecruiters: number[];
}

export interface SourceTotals { upserted: number; errors: number }

export interface IngestTotals {
  greenhouse:      SourceTotals;
  lever:           SourceTotals;
  ashby:           SourceTotals;
  workday:         SourceTotals;
  smartrecruiters: SourceTotals;
  /** Capped sample of the actual error strings, for the cycle event. */
  errorSamples: Array<{ source: string; error: string }>;
}

export function freshCursor(sizes: SourceSizes): IngestCursor {
  return {
    greenhouse: 0,
    lever: 0,
    ashby: 0,
    workday:         new Array(sizes.workday).fill(0),
    smartrecruiters: new Array(sizes.smartrecruiters).fill(0),
  };
}

export function freshTotals(): IngestTotals {
  const zero = (): SourceTotals => ({ upserted: 0, errors: 0 });
  return {
    greenhouse: zero(), lever: zero(), ashby: zero(),
    workday: zero(), smartrecruiters: zero(),
    errorSamples: [],
  };
}

function clampIndex(v: unknown, max: number): number {
  return typeof v === "number" && Number.isFinite(v)
    ? Math.min(Math.max(0, Math.floor(v)), max)
    : 0;
}

function normalizeOffsets(v: unknown, len: number): number[] | null {
  // A length mismatch means the company list changed between deploys
  // mid-chain. There is no safe way to map the old positions onto the new
  // list, so the caller restarts the cycle rather than silently skipping
  // (or out-of-bounds indexing) a source.
  if (!Array.isArray(v) || v.length !== len) return null;
  return v.map((n: unknown) =>
    n === DONE ? DONE
    : (typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0));
}

/** Rebuild a cursor from an untrusted request body; never throws. */
export function normalizeCursor(raw: unknown, sizes: SourceSizes): IngestCursor {
  if (!raw || typeof raw !== "object") return freshCursor(sizes);
  const r = raw as Record<string, unknown>;
  const workday         = normalizeOffsets(r.workday, sizes.workday);
  const smartrecruiters = normalizeOffsets(r.smartrecruiters, sizes.smartrecruiters);
  if (!workday || !smartrecruiters) return freshCursor(sizes);
  return {
    greenhouse: clampIndex(r.greenhouse, sizes.greenhouse),
    lever:      clampIndex(r.lever, sizes.lever),
    ashby:      clampIndex(r.ashby, sizes.ashby),
    workday,
    smartrecruiters,
  };
}

/** Rebuild running totals from an untrusted request body; never throws. */
export function normalizeTotals(raw: unknown): IngestTotals {
  const base = freshTotals();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, any>;
  const num = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
  for (const key of SOURCE_KEYS) {
    base[key] = { upserted: num(r?.[key]?.upserted), errors: num(r?.[key]?.errors) };
  }
  if (Array.isArray(r.errorSamples)) {
    base.errorSamples = r.errorSamples
      .filter((e: any) => e && typeof e.source === "string" && typeof e.error === "string")
      .slice(0, MAX_ERROR_SAMPLES)
      .map((e: any) => ({ source: e.source.slice(0, 40), error: e.error.slice(0, 200) }));
  }
  return base;
}

/** Clamp an inbound chainDepth from an untrusted body. */
export function normalizeChainDepth(raw: unknown): number {
  return typeof raw === "number" && Number.isFinite(raw)
    ? Math.min(Math.max(0, Math.floor(raw)), MAX_CHAIN_DEPTH)
    : 0;
}

/** True once every source's cursor is exhausted — the cycle is complete. */
export function isCursorComplete(c: IngestCursor, sizes: SourceSizes): boolean {
  return c.greenhouse >= sizes.greenhouse
    && c.lever >= sizes.lever
    && c.ashby >= sizes.ashby
    && c.workday.every(o => o === DONE)
    && c.smartrecruiters.every(o => o === DONE);
}

/** Rough "work left", surfaced in the response for observability. */
export function remainingUnits(c: IngestCursor, sizes: SourceSizes): Record<SourceKey, number> {
  return {
    greenhouse:      Math.max(0, sizes.greenhouse - c.greenhouse),
    lever:           Math.max(0, sizes.lever - c.lever),
    ashby:           Math.max(0, sizes.ashby - c.ashby),
    workday:         c.workday.filter(o => o !== DONE).length,
    smartrecruiters: c.smartrecruiters.filter(o => o !== DONE).length,
  };
}

/**
 * The chain continues only while work remains AND the depth cap is
 * unspent. At the cap the cycle is truncated: the terminal link still runs
 * the post-fan-out work rather than dropping it, which is exactly what v4
 * got wrong (its post-fan-out work never ran at all).
 */
export function shouldChain(chainDepth: number, cursor: IngestCursor, sizes: SourceSizes): boolean {
  return !isCursorComplete(cursor, sizes) && chainDepth < MAX_CHAIN_DEPTH;
}

/** Fold a slice's per-source result into the cycle-wide running totals. */
export function accumulate(totals: IngestTotals, source: SourceKey, upserted: number, errors: string[]): void {
  totals[source].upserted += upserted;
  totals[source].errors   += errors.length;
  for (const error of errors) {
    if (totals.errorSamples.length >= MAX_ERROR_SAMPLES) break;
    totals.errorSamples.push({ source, error: String(error).slice(0, 200) });
  }
}

/** Sum of `upserted` across all five sources. */
export function totalUpserted(t: IngestTotals): number {
  return SOURCE_KEYS.reduce((n, k) => n + t[k].upserted, 0);
}

/** Sum of `errors` across all five sources. */
export function totalErrors(t: IngestTotals): number {
  return SOURCE_KEYS.reduce((n, k) => n + t[k].errors, 0);
}
