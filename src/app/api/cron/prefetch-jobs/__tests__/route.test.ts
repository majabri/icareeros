/**
 * /api/cron/prefetch-jobs unit tests
 *
 * Phase 2 Item 2 — see docs/specs/COWORK-BRIEF-phase2-v1.md
 *
 * Mocks:
 *   - @/services/integrations/adzunaAdapter — searchAdzuna stubbed per test
 *   - @supabase/supabase-js — service-role client with a programmable
 *     per-table FIFO queue (same pattern as the coach-brief test)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Adzuna adapter mock ─────────────────────────────────────────────────────
const mockSearchAdzuna = vi.fn();
vi.mock("@/services/integrations/adzunaAdapter", () => ({
  searchAdzuna: (params: unknown) => mockSearchAdzuna(params),
}));

// ── Supabase service-role client mock ───────────────────────────────────────
const fromQueue: Record<string, Array<unknown>> = {};
function pushFromResult(table: string, result: unknown) {
  if (!fromQueue[table]) fromQueue[table] = [];
  fromQueue[table].push(result);
}
function makeChain(table: string) {
  let pending: unknown = null;
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    upsert: vi.fn(() => {
      const q = fromQueue[table];
      if (!q || q.length === 0) throw new Error(`No queued result for table '${table}' (upsert)`);
      pending = q.shift()!;
      return Promise.resolve(pending);
    }),
    eq:     vi.fn().mockReturnThis(),
    not:    vi.fn().mockReturnThis(),
    in:     vi.fn().mockReturnThis(),
    order:  vi.fn().mockReturnThis(),
    limit:  vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(() => { const q = fromQueue[table]; pending = q.shift()!; return Promise.resolve(pending); }),
  };
  // Make chain awaitable for SELECT calls (no terminator like maybeSingle/single)
  (chain as unknown as { then: (fn: (v: unknown) => unknown) => Promise<unknown> }).then =
    (resolve) => {
      const q = fromQueue[table];
      if (!q || q.length === 0) throw new Error(`No queued result for table '${table}' (select)`);
      pending = q.shift()!;
      return Promise.resolve(pending).then(resolve);
    };
  return chain;
}
const mockFrom = vi.fn((table: string) => makeChain(table));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({ from: mockFrom })),
}));

// ── Env defaults ────────────────────────────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks();
  Object.keys(fromQueue).forEach(k => delete fromQueue[k]);
  process.env.NEXT_PUBLIC_SUPABASE_URL      = "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
  process.env.SUPABASE_SERVICE_ROLE_KEY     = "service-role-test";
  process.env.CRON_SECRET                   = "test-cron-secret";
});

async function loadRoute() {
  vi.resetModules();
  return await import("../route");
}

function makeReq(headers: Record<string, string> = {}): Request {
  return new Request("https://test.icareeros.com/api/cron/prefetch-jobs", {
    method:  "POST",
    headers: { "content-type": "application/json", ...headers },
  });
}

// Type assertion helpers — the route's NextRequest accepts a plain Request.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const callPost = async (POST: any, headers?: Record<string, string>) =>
  POST(makeReq(headers) as never);

// ── Tests ───────────────────────────────────────────────────────────────────

describe("/api/cron/prefetch-jobs — auth", () => {
  it("returns 401 when CRON_SECRET is set and Authorization header is missing", async () => {
    const { POST } = await loadRoute();
    const res = await callPost(POST);
    expect(res.status).toBe(401);
  });

  it("returns 401 when Authorization header has the wrong secret", async () => {
    const { POST } = await loadRoute();
    const res = await callPost(POST, { authorization: "Bearer not-the-real-secret" });
    expect(res.status).toBe(401);
  });

  it("allows the call through when Authorization matches CRON_SECRET", async () => {
    pushFromResult("career_profiles", { data: [], error: null }); // headlines query — empty
    pushFromResult("career_profiles", { data: [], error: null }); // skills fallback — also empty
    const { POST } = await loadRoute();
    const res = await callPost(POST, { authorization: "Bearer test-cron-secret" });
    expect(res.status).toBe(200);
  });
});

describe("/api/cron/prefetch-jobs — empty profile pool", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = ""; // disable auth for these tests
  });

  it("returns fetched: 0 when career_profiles has no headlines and no target_skills", async () => {
    pushFromResult("career_profiles", { data: [], error: null }); // headlines
    pushFromResult("career_profiles", { data: [], error: null }); // skills
    const { POST } = await loadRoute();
    const res  = await callPost(POST);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.fetched).toBe(0);
    expect(body.roles).toEqual([]);
    expect(mockSearchAdzuna).not.toHaveBeenCalled();
  });
});

describe("/api/cron/prefetch-jobs — happy path with headlines", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = ""; // simplify
  });

  it("fetches Adzuna for each headline and upserts results", async () => {
    pushFromResult("career_profiles", {
      data: [
        { headline: "Senior Product Manager" },
        { headline: "Backend Engineer" },
        { headline: "Senior Product Manager" }, // duplicate — should dedup
        { headline: "Designer" },               // 3rd distinct → no skill fallback
        { headline: "" },                       // empty — should be ignored
        { headline: null },                     // null — should be ignored
      ],
      error: null,
    });

    mockSearchAdzuna.mockImplementation(async (params: { what: string; resultsPerPage: number }) => ({
      opportunities: [
        {
          id: `adzuna-${params.what}-1`, title: `${params.what} role`, company: "Co",
          location: "NYC", type: "full_time", description: "", url: "https://example.com",
          matchReason: "", first_seen_at: "2026-05-06T00:00:00Z", is_remote: false,
        },
      ],
      total: 1, fallback: false,
    }));

    pushFromResult("opportunities", { data: [], error: null });

    const { POST } = await loadRoute();
    const res  = await callPost(POST);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.fetched).toBe(3);
    expect(body.roles).toHaveLength(3);
    expect(body.roles.map((r: { role: string }) => r.role).sort()).toEqual(
      ["Backend Engineer", "Designer", "Senior Product Manager"],
    );
    expect(body.roles.every((r: { src: string }) => r.src === "headline")).toBe(true);
    expect(mockSearchAdzuna).toHaveBeenCalledTimes(3);
  });

  it("falls back to top target_skills when fewer than 3 headlines exist", async () => {
    pushFromResult("career_profiles", {
      data: [{ headline: "Lone Wolf PM" }], // only 1 headline → triggers fallback
      error: null,
    });
    pushFromResult("career_profiles", {
      data: [
        { target_skills: ["TypeScript", "React", "Postgres"] },
        { target_skills: ["TypeScript", "Node.js"] },
        { target_skills: ["React", "TypeScript"] },
      ],
      error: null,
    });

    mockSearchAdzuna.mockImplementation(async () => ({
      opportunities: [],
      total: 0,
      fallback: false,
    }));

    const { POST } = await loadRoute();
    const res  = await callPost(POST);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.fetched).toBe(0);
    // Headline first, then top-3 skills (TypeScript=3, React=2, Postgres=1, Node.js=1)
    const roleNames = body.roles.map((r: { role: string }) => r.role);
    expect(roleNames[0]).toBe("Lone Wolf PM");
    expect(roleNames).toContain("TypeScript");
    expect(roleNames).toContain("React");
  });

  it("treats one role's Adzuna error as 'continue, do not fail the whole job'", async () => {
    pushFromResult("career_profiles", {
      data: [
        { headline: "Working Role" },
        { headline: "Failing Role" },
      ],
      error: null,
    });
    // 2 headlines < HEADLINE_MIN_BEFORE_FALLBACK (3) → route reads target_skills next
    pushFromResult("career_profiles", { data: [], error: null });
    mockSearchAdzuna.mockImplementation(async (params: { what: string }) => {
      if (params.what === "Failing Role") throw new Error("Adzuna 502");
      return {
        opportunities: [{
          id: "adzuna-w-1", title: "T", company: "C", location: "L",
          type: "full_time", description: "", url: "", matchReason: "",
        }],
        total: 1, fallback: false,
      };
    });
    pushFromResult("opportunities", { data: [], error: null });

    const { POST } = await loadRoute();
    const res  = await callPost(POST);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.fetched).toBe(1);
    const failing = body.roles.find((r: { role: string }) => r.role === "Failing Role");
    expect(failing.status).toBe("error");
    expect(failing.error).toMatch(/Adzuna 502/);
  });

  it("treats Adzuna fallback (unconfigured) as an error, not a successful empty fetch", async () => {
    pushFromResult("career_profiles", {
      data: [{ headline: "PM" }, { headline: "Eng" }, { headline: "Designer" }],
      error: null,
    });
    mockSearchAdzuna.mockResolvedValue({ opportunities: [], total: 0, fallback: true });

    const { POST } = await loadRoute();
    const res  = await callPost(POST);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.fetched).toBe(0);
    expect(body.roles.every((r: { status: string }) => r.status === "error")).toBe(true);
  });

  it("upserts with onConflict source,source_id and source='adzuna_prefetch'", async () => {
    pushFromResult("career_profiles", {
      data: [{ headline: "PM" }, { headline: "Eng" }, { headline: "Designer" }],
      error: null,
    });
    mockSearchAdzuna.mockImplementation(async (params: { what: string }) => ({
      opportunities: [{
        id: `adzuna-${params.what}-1`, title: params.what, company: "Acme",
        location: "Remote", type: "full_time", description: "", url: "https://x.com",
        matchReason: "", is_remote: true,
      }],
      total: 1, fallback: false,
    }));

    let capturedRows: unknown = null;
    let capturedOpts: unknown = null;
    pushFromResult("opportunities", { data: [], error: null });
    // Replace the upsert mock to capture args
    const originalFrom = mockFrom.getMockImplementation();
    mockFrom.mockImplementation((table: string) => {
      const chain = (originalFrom as (t: string) => Record<string, unknown>)(table);
      if (table === "opportunities") {
        chain.upsert = vi.fn((rows: unknown, opts: unknown) => {
          capturedRows = rows;
          capturedOpts = opts;
          return Promise.resolve({ data: [], error: null });
        });
      }
      return chain;
    });

    const { POST } = await loadRoute();
    const res = await callPost(POST);
    expect(res.status).toBe(200);
    expect(capturedOpts).toMatchObject({ onConflict: "source,source_id" });
    expect(Array.isArray(capturedRows)).toBe(true);
    const rows = capturedRows as Array<{ source: string; source_id: string }>;
    expect(rows.every(r => r.source === "adzuna_prefetch")).toBe(true);
    // source_id should have the "adzuna-" prefix stripped
    expect(rows.every(r => !r.source_id.startsWith("adzuna-"))).toBe(true);
  });
});
