/**
 * Sprint 5 P3-4 — persistStageNotes unit tests.
 *
 * persistStageNotes was added in the P2 fix to close a gap in the new
 * stage-page Run flow: the 5 Career-OS API routes used to RETURN the AI
 * result without writing anywhere, so re-reads found nothing. This file
 * verifies the upsert math (insert path on first run, update path on
 * re-run), the failure paths (lookup err / insert err / update err) and
 * the row shape we write.
 *
 * We mock SupabaseClient at the call-surface level with a fluent chain
 * builder so the same instance services both the lookup `.select(...).
 * maybeSingle()` and the subsequent `.insert(...)` / `.update(...).eq(...)`.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { persistStageNotes } from "../persistStageNotes";
import type { SupabaseClient } from "@supabase/supabase-js";

// ── Mock client builder ──────────────────────────────────────────────────

type SpyFn = ReturnType<typeof vi.fn<(...args: unknown[]) => unknown>>;

interface MockChain {
  selectOut?:    { data: unknown; error: unknown };
  insertOut?:    { error: unknown };
  updateOut?:    { error: unknown };
  // Spies populated automatically so each test can assert call args
  spies: {
    select: SpyFn;
    insert: SpyFn;
    update: SpyFn;
    eq:     SpyFn;
  };
}

function makeSb(stub: Partial<MockChain> = {}): { sb: SupabaseClient; chain: MockChain } {
  const chain: MockChain = {
    selectOut: stub.selectOut,
    insertOut: stub.insertOut,
    updateOut: stub.updateOut,
    spies: {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      eq:     vi.fn(),
    },
  };

  // The fluent builder returned by `.from(table)`. Each method tracks its
  // call args via the spies and returns either `this` (for chainable links)
  // or a resolved promise (for terminals).
  const from = (_table: string) => {
    const obj: Record<string, unknown> = {};
    obj.select = (cols: string) => {
      chain.spies.select(cols);
      return obj;
    };
    obj.eq = (col: string, val: unknown) => {
      chain.spies.eq(col, val);
      return obj;
    };
    obj.maybeSingle = () => Promise.resolve(chain.selectOut ?? { data: null, error: null });
    obj.insert = (row: Record<string, unknown>) => {
      chain.spies.insert(row);
      return Promise.resolve(chain.insertOut ?? { error: null });
    };
    obj.update = (patch: Record<string, unknown>) => {
      chain.spies.update(patch);
      // update is followed by .eq(...).then(... ) but we resolve eagerly via
      // a thenable that returns the updateOut on the final `await`.
      // For simplicity, return a chainable that resolves to updateOut.
      const updChain: Record<string, unknown> = {
        eq: (col: string, val: unknown) => {
          chain.spies.eq(col, val);
          // After the .eq chain, the call is awaited — return a thenable.
          return Promise.resolve(chain.updateOut ?? { error: null });
        },
      };
      return updChain;
    };
    return obj;
  };

  const sb = { from } as unknown as SupabaseClient;
  return { sb, chain };
}

// ── Fixtures ──────────────────────────────────────────────────────────────

const USER_ID  = "b40f764f-8e8b-4f8d-b3a7-9e993e57f15a";
const CYCLE_ID = "35650e46-7854-4697-b486-1370a2c27ad2";
const RESULT   = {
  skills:               ["TypeScript", "React"],
  gaps:                 ["AWS"],
  marketFitScore:       72,
  careerLevel:          "mid",
  recommendedNextStage: "advise",
  summary:              "Frontend strong, cloud weak.",
};

beforeEach(() => vi.clearAllMocks());

// ── Tests ────────────────────────────────────────────────────────────────

describe("persistStageNotes — insert path (first run)", () => {
  it("inserts a new row when no existing stage row is found", async () => {
    const { sb, chain } = makeSb({ selectOut: { data: null, error: null } });
    const r = await persistStageNotes(sb, USER_ID, CYCLE_ID, "evaluate", RESULT);

    expect(r.ok).toBe(true);
    expect(chain.spies.insert).toHaveBeenCalledTimes(1);

    const inserted = chain.spies.insert.mock.calls[0][0] as Record<string, unknown>;
    expect(inserted.user_id).toBe(USER_ID);
    expect(inserted.cycle_id).toBe(CYCLE_ID);
    expect(inserted.stage).toBe("evaluate");
    expect(inserted.status).toBe("completed");
    expect(inserted.notes).toEqual(RESULT);
    expect(typeof inserted.started_at).toBe("string");
    expect(typeof inserted.ended_at).toBe("string");
    // started_at and ended_at should both be ISO strings from now() at insert time
    expect(inserted.started_at).toBe(inserted.ended_at);
  });

  it("returns ok:false when insert errors", async () => {
    const { sb } = makeSb({
      selectOut: { data: null, error: null },
      insertOut: { error: { message: "FK violation: cycle_id" } },
    });
    const r = await persistStageNotes(sb, USER_ID, CYCLE_ID, "advise", RESULT);

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe("FK violation: cycle_id");
  });
});

describe("persistStageNotes — update path (re-run)", () => {
  it("updates an existing row when found, preserving started_at", async () => {
    const existingRow = { id: "9f4e..." };
    const { sb, chain } = makeSb({ selectOut: { data: existingRow, error: null } });
    const r = await persistStageNotes(sb, USER_ID, CYCLE_ID, "learn", RESULT);

    expect(r.ok).toBe(true);
    expect(chain.spies.update).toHaveBeenCalledTimes(1);
    expect(chain.spies.insert).not.toHaveBeenCalled();

    const patch = chain.spies.update.mock.calls[0][0] as Record<string, unknown>;
    expect(patch.notes).toEqual(RESULT);
    expect(patch.status).toBe("completed");
    expect(typeof patch.ended_at).toBe("string");
    // Crucial: started_at must NOT be in the update patch (preserve original)
    expect("started_at" in patch).toBe(false);

    // .eq was called against id (chained from update)
    const eqCalls = chain.spies.eq.mock.calls;
    expect(eqCalls.some(c => c[0] === "id" && c[1] === existingRow.id)).toBe(true);
  });

  it("returns ok:false when update errors", async () => {
    const { sb } = makeSb({
      selectOut: { data: { id: "abc" }, error: null },
      updateOut: { error: { message: "permission denied" } },
    });
    const r = await persistStageNotes(sb, USER_ID, CYCLE_ID, "act", RESULT);

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe("permission denied");
  });
});

describe("persistStageNotes — lookup failure", () => {
  it("returns ok:false when the select lookup errors", async () => {
    const { sb, chain } = makeSb({
      selectOut: { data: null, error: { message: "rls_blocked" } },
    });
    const r = await persistStageNotes(sb, USER_ID, CYCLE_ID, "achieve", RESULT);

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe("rls_blocked");
    // Neither insert nor update should happen if the lookup fails
    expect(chain.spies.insert).not.toHaveBeenCalled();
    expect(chain.spies.update).not.toHaveBeenCalled();
  });
});

describe("persistStageNotes — call shape", () => {
  it("queries career_os_stages by (user_id, cycle_id, stage) when looking up", async () => {
    const { sb, chain } = makeSb({ selectOut: { data: null, error: null } });
    await persistStageNotes(sb, USER_ID, CYCLE_ID, "evaluate", RESULT);

    expect(chain.spies.select).toHaveBeenCalledWith("id");
    const eqArgs = chain.spies.eq.mock.calls;
    // The three .eq() calls used during the lookup phase
    expect(eqArgs).toContainEqual(["user_id", USER_ID]);
    expect(eqArgs).toContainEqual(["cycle_id", CYCLE_ID]);
    expect(eqArgs).toContainEqual(["stage", "evaluate"]);
  });

  it("accepts every CareerOsStageKey value", async () => {
    const { sb } = makeSb({ selectOut: { data: null, error: null } });
    for (const stage of ["evaluate", "advise", "learn", "act", "achieve", "coach"] as const) {
      const r = await persistStageNotes(sb, USER_ID, CYCLE_ID, stage, RESULT);
      expect(r.ok).toBe(true);
    }
  });
});

// ── Auto-advance tests (fix/jobs-stage-ux, 2026-06-30) ───────────────────

/**
 * Build a mock that handles BOTH `.from("career_os_stages")` (upsert path)
 * AND `.from("career_os_cycles")` (auto-advance lookup + update). Tracks
 * the latest cycles.update call so tests can assert what current_stage
 * the helper advanced to.
 */
function makeSbWithCycles(opts: {
  stageLookup?:   { data: unknown; error: unknown };
  cycleLookup?:   { data: unknown; error: unknown };
}): {
  sb:           SupabaseClient;
  cycleUpdated: { value: Record<string, unknown> | null };
} {
  const cycleUpdated: { value: Record<string, unknown> | null } = { value: null };
  const from = (table: string) => {
    const obj: Record<string, unknown> = {};
    obj.select = (_cols: string) => obj;
    obj.eq     = (_col: string, _val: unknown) => obj;
    obj.in     = (_col: string, _val: unknown) => obj;
    obj.maybeSingle = () => Promise.resolve(
      table === "career_os_stages"  ? (opts.stageLookup ?? { data: null, error: null }) :
      table === "career_os_cycles"  ? (opts.cycleLookup ?? { data: null, error: null }) :
      { data: null, error: null }
    );
    obj.insert = () => Promise.resolve({ error: null });
    obj.update = (patch: Record<string, unknown>) => {
      if (table === "career_os_cycles") cycleUpdated.value = patch;
      return { eq: () => ({ eq: () => Promise.resolve({ error: null }) }) };
    };
    return obj;
  };
  return { sb: { from } as unknown as SupabaseClient, cycleUpdated };
}

describe("persistStageNotes — auto-advance cycle current_stage", () => {
  it("advances current_stage when it matches the just-completed stage", async () => {
    const { sb, cycleUpdated } = makeSbWithCycles({
      cycleLookup: { data: { current_stage: "evaluate" }, error: null },
    });
    await persistStageNotes(sb, USER_ID, CYCLE_ID, "evaluate", RESULT);
    expect(cycleUpdated.value).toEqual({ current_stage: "advise" });
  });

  it("does NOT advance when current_stage is already past the completed stage", async () => {
    // Re-running evaluate when cycle has already advanced to learn — pointer stays put.
    const { sb, cycleUpdated } = makeSbWithCycles({
      cycleLookup: { data: { current_stage: "learn" }, error: null },
    });
    await persistStageNotes(sb, USER_ID, CYCLE_ID, "evaluate", RESULT);
    expect(cycleUpdated.value).toBeNull();
  });

  it("stays on 'achieve' when achieve completes (no next stage)", async () => {
    const { sb, cycleUpdated } = makeSbWithCycles({
      cycleLookup: { data: { current_stage: "achieve" }, error: null },
    });
    await persistStageNotes(sb, USER_ID, CYCLE_ID, "achieve", RESULT);
    expect(cycleUpdated.value).toBeNull();
  });

  it("no-ops when persisting the 'coach' sub-feature (not in 5-stage order)", async () => {
    const { sb, cycleUpdated } = makeSbWithCycles({
      cycleLookup: { data: { current_stage: "advise" }, error: null },
    });
    await persistStageNotes(sb, USER_ID, CYCLE_ID, "coach", RESULT);
    expect(cycleUpdated.value).toBeNull();
  });

  it("silently swallows errors during the cycle lookup — persist still returns ok:true", async () => {
    const { sb } = makeSbWithCycles({
      cycleLookup: { data: null, error: { message: "boom" } },
    });
    const r = await persistStageNotes(sb, USER_ID, CYCLE_ID, "evaluate", RESULT);
    expect(r.ok).toBe(true);
  });
});
