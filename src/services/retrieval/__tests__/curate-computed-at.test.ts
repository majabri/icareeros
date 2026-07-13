/**
 * fix/jobs-curator-deno-port Fix 4 — computed_at advances on conflict.
 *
 * The pre-fix upsert relied on the table default for `computed_at`
 * (`DEFAULT NOW()`), which only fires on INSERT. On CONFLICT UPDATE
 * the existing row's `computed_at` was preserved, so the cache never
 * looked "fresh" even after a successful daily rerun. The fix sets
 * `computed_at` explicitly on every row payload so both INSERT and
 * UPDATE paths write the current timestamp.
 *
 * We can't unit-test the whole Deno function here (it's Deno code),
 * but we CAN assert the invariant we care about:
 *
 *   the payload passed to `.upsert(...)` includes computed_at on every
 *   record and every value equals a single now-timestamp.
 *
 * We do that by reading the Deno source as text and asserting the
 * required token appears inside the payload object literal. It's a
 * regression guard against someone deleting the line during a future
 * refactor without realising why it was there.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

describe("curate-user-recommendations — computed_at explicit-on-conflict guarantee", () => {
  const src = readFileSync(
    resolve(__dirname, "../../../../supabase/functions/curate-user-recommendations/index.ts"),
    "utf8",
  );

  it("sets a single `nowIso` variable before building the scored payload", () => {
    expect(src).toMatch(/const nowIso = new Date\(\)\.toISOString\(\);/);
  });

  it("the scored-row object literal includes `computed_at: nowIso`", () => {
    expect(src).toMatch(/computed_at:\s+nowIso,/);
  });

  it("the .upsert call passes ignoreDuplicates:false so ON CONFLICT UPDATE fires", () => {
    // If ignoreDuplicates is true, ON CONFLICT DO NOTHING is used and our
    // explicit computed_at would still not overwrite the stale row.
    expect(src).toMatch(/ignoreDuplicates:\s*false/);
  });

  it("does NOT rely on a table default — no bare .upsert(scored) without option object", () => {
    // Regression guard: someone could easily "clean up" by dropping the
    // options object. That would silently reintroduce the bug on
    // Postgres versions where DEFAULT NOW() doesn't fire on UPDATE.
    expect(src).not.toMatch(/\.upsert\(scored\)\s*[;\n]/);
  });
});
