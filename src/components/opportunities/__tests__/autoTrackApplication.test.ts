/**
 * feat/jobs-smart-apply — tests for the SmartApplyPanel's autoTrackApplication
 * helper. Verifies:
 *   1. Inserts into applications with status=applied when no prior row exists
 *   2. Updates existing row when the same (user, job_url) is re-applied
 *   3. Returns { ok: false } when auth is missing
 *   4. Logs an application_events row on success (best-effort)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

interface RowByTable { applications?: unknown; application_events?: unknown; }

function makeSb(opts: {
  user?: { id: string } | null;
  lookupResult?: { data: { id: string } | null; error: unknown };
  insertResult?: { data: { id: string } | null; error: unknown };
  updateResult?: { data: null; error: unknown };
  eventInsertResult?: { data: null; error: unknown };
}) {
  const recorded: { inserted: Record<string, unknown>[]; updated: { table: string; patch: Record<string, unknown> }[] } = { inserted: [], updated: [] };
  const from = (table: string) => {
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq     = () => chain;
    chain.maybeSingle = () => Promise.resolve(opts.lookupResult ?? { data: null, error: null });
    chain.insert = (row: Record<string, unknown>) => {
      recorded.inserted.push({ table, ...row });
      if (table === "application_events") return Promise.resolve(opts.eventInsertResult ?? { data: null, error: null });
      return {
        select: () => ({ maybeSingle: () => Promise.resolve(opts.insertResult ?? { data: { id: "new-app-id" }, error: null }) }),
      };
    };
    chain.update = (patch: Record<string, unknown>) => {
      recorded.updated.push({ table, patch });
      return { eq: () => Promise.resolve(opts.updateResult ?? { data: null, error: null }) };
    };
    // Support `.then()` for insert into event table (fire-and-forget swallow)
    return chain;
  };
  return {
    sb: { from, auth: { getUser: async () => ({ data: { user: opts.user ?? null } }) } },
    recorded,
  };
}

vi.mock("@/lib/supabase", () => ({ createClient: vi.fn() }));

let autoTrackApplication: typeof import("../autoTrackApplication").autoTrackApplication;
beforeEach(async () => {
  vi.resetModules();
  const mod = await import("../autoTrackApplication");
  autoTrackApplication = mod.autoTrackApplication;
});

const input = {
  job_title:      "Senior Engineer",
  company:        "Stripe",
  job_url:        "https://boards.greenhouse.io/stripe/jobs/1",
  opportunity_id: "opp-xyz",
  cycle_id:       "cycle-abc",
};

describe("autoTrackApplication", () => {
  it("returns ok:false when user is not authenticated", async () => {
    const { sb } = makeSb({ user: null });
    (await import("@/lib/supabase")).createClient = vi.fn(() => sb) as unknown as typeof import("@/lib/supabase").createClient;
    const r = await autoTrackApplication(input);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("not authenticated");
  });

  it("inserts a new applications row when no prior match exists", async () => {
    const { sb, recorded } = makeSb({
      user: { id: "user-1" },
      lookupResult: { data: null, error: null },
      insertResult: { data: { id: "new-app-id" }, error: null },
    });
    (await import("@/lib/supabase")).createClient = vi.fn(() => sb) as unknown as typeof import("@/lib/supabase").createClient;
    const r = await autoTrackApplication(input);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.applicationId).toBe("new-app-id");
    // Should have inserted into applications with status=applied
    const appInsert = recorded.inserted.find(x => x.table === "applications");
    expect(appInsert).toBeTruthy();
    expect((appInsert as Record<string, unknown>).status).toBe("applied");
    expect((appInsert as Record<string, unknown>).cycle_id).toBe("cycle-abc");
    // Should also log an event
    const evtInsert = recorded.inserted.find(x => x.table === "application_events");
    expect(evtInsert).toBeTruthy();
    expect((evtInsert as Record<string, unknown>).event_type).toBe("applied");
  });

  it("updates existing applications row when one matches (user, job_url)", async () => {
    const { sb, recorded } = makeSb({
      user: { id: "user-1" },
      lookupResult: { data: { id: "existing-app-id" }, error: null },
    });
    (await import("@/lib/supabase")).createClient = vi.fn(() => sb) as unknown as typeof import("@/lib/supabase").createClient;
    const r = await autoTrackApplication(input);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.applicationId).toBe("existing-app-id");
    // Should have UPDATE-ed, not inserted a new applications row
    const appUpdate = recorded.updated.find(x => x.table === "applications");
    expect(appUpdate).toBeTruthy();
    expect((appUpdate!.patch as Record<string, unknown>).status).toBe("applied");
    const appInsert = recorded.inserted.find(x => x.table === "applications");
    expect(appInsert).toBeFalsy();
  });

  it("returns ok:false when the insert fails", async () => {
    const { sb } = makeSb({
      user: { id: "user-1" },
      lookupResult: { data: null, error: null },
      insertResult: { data: null, error: { message: "boom" } },
    });
    (await import("@/lib/supabase")).createClient = vi.fn(() => sb) as unknown as typeof import("@/lib/supabase").createClient;
    const r = await autoTrackApplication(input);
    expect(r.ok).toBe(false);
  });
});
