/**
 * #400-followup — work-unit slicing tests for ingest-ats-direct.
 *
 * The edge function drains a time-boxed slice of work per invocation and
 * resumes by *index* on the next link, so the unit list has to be stable,
 * gapless and non-overlapping. A wrong boundary would silently skip or
 * double-ingest whole companies, which is exactly the class of bug that is
 * invisible in production.
 *
 * Same convention as ingestFanOut.test.ts: the full Deno `serve()` can't run
 * under vitest (deno.land / esm.sh imports), so the partitioning logic is
 * ported here and tested directly. Keep in sync with `buildWorkUnits()` in
 * supabase/functions/ingest-ats-direct/index.ts.
 */
import { describe, it, expect } from "vitest";

const BATCH_SIZE = 20;
const WD_TENANT_BATCH = 4;

interface Unit { src: string; label: string; members: string[] }

function chunk<T>(xs: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}

/** Port of buildWorkUnits() — the members array stands in for the work. */
function buildWorkUnits(sets: {
  greenhouse: string[]; lever: string[]; ashby: string[];
  workday: string[]; smartrecruiters: string[];
}): Unit[] {
  const units: Unit[] = [];
  for (let i = 0; i < sets.greenhouse.length; i += BATCH_SIZE) {
    units.push({ src: "greenhouse", label: `greenhouse:${i}`, members: sets.greenhouse.slice(i, i + BATCH_SIZE) });
  }
  for (let i = 0; i < sets.lever.length; i += BATCH_SIZE) {
    units.push({ src: "lever", label: `lever:${i}`, members: sets.lever.slice(i, i + BATCH_SIZE) });
  }
  for (let i = 0; i < sets.ashby.length; i += BATCH_SIZE) {
    units.push({ src: "ashby", label: `ashby:${i}`, members: sets.ashby.slice(i, i + BATCH_SIZE) });
  }
  for (const batch of chunk(sets.workday, WD_TENANT_BATCH)) {
    units.push({ src: "workday", label: `workday:${batch.join("+")}`, members: batch });
  }
  for (const slug of sets.smartrecruiters) {
    units.push({ src: "smartrecruiters", label: `smartrecruiters:${slug}`, members: [slug] });
  }
  return units;
}

const SETS = {
  greenhouse: Array.from({ length: 55 }, (_, i) => `gh${i}`),
  lever: Array.from({ length: 19 }, (_, i) => `lv${i}`),
  ashby: Array.from({ length: 25 }, (_, i) => `ab${i}`),
  workday: Array.from({ length: 17 }, (_, i) => `wd${i}`),
  smartrecruiters: Array.from({ length: 5 }, (_, i) => `sr${i}`),
};

describe("ingest-ats-direct work-unit slicing", () => {
  it("covers every company exactly once, with no gaps or overlaps", () => {
    const seen = buildWorkUnits(SETS).flatMap(u => u.members);
    const expected = [
      ...SETS.greenhouse, ...SETS.lever, ...SETS.ashby,
      ...SETS.workday, ...SETS.smartrecruiters,
    ];
    expect(seen.slice().sort()).toEqual(expected.slice().sort());
    expect(new Set(seen).size).toBe(seen.length);
  });

  it("is deterministic — a resuming link rebuilds the identical list", () => {
    const a = buildWorkUnits(SETS).map(u => u.label);
    const b = buildWorkUnits(SETS).map(u => u.label);
    expect(a).toEqual(b);
  });

  it("resuming at an arbitrary index still covers the whole cycle once", () => {
    const units = buildWorkUnits(SETS);
    // Simulate a chain that stops after each unit and resumes by index.
    for (const cut of [0, 1, 5, units.length - 1]) {
      const done = units.slice(0, cut).flatMap(u => u.members);
      const rest = units.slice(cut).flatMap(u => u.members);
      expect([...done, ...rest].sort()).toEqual(
        units.flatMap(u => u.members).sort(),
      );
      expect(done.filter(m => rest.includes(m))).toEqual([]);
    }
  });

  it("no unit is empty — an empty slice would burn a chain link for nothing", () => {
    for (const u of buildWorkUnits(SETS)) expect(u.members.length).toBeGreaterThan(0);
  });

  it("keeps the cycle well inside the chain-depth cap", () => {
    // MAX_CHAIN_DEPTH is 20 in the edge function. Even one unit per link,
    // the cycle must still fit — otherwise work is silently truncated.
    expect(buildWorkUnits(SETS).length).toBeLessThanOrEqual(20);
  });
});
