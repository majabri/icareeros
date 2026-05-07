/**
 * /api/applications/[id] — PATCH + DELETE tests.
 * Phase 5 Item 4 — see docs/specs/COWORK-BRIEF-phase5-v1.md.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({
    getAll: vi.fn().mockReturnValue([]),
    get: vi.fn(), set: vi.fn(), delete: vi.fn(),
  }),
}));

const mockGetUser = vi.fn();
const fromQueue: Record<string, Array<unknown>> = {};
function pushFromResult(table: string, result: unknown) {
  if (!fromQueue[table]) fromQueue[table] = [];
  fromQueue[table].push(result);
}
function takeFromResult(table: string): unknown {
  const q = fromQueue[table];
  if (!q || q.length === 0) return { data: null, error: null };
  return q.shift()!;
}
function makeChain(table: string) {
  const chain: Record<string, unknown> = {
    select:      vi.fn().mockReturnThis(),
    update:      vi.fn().mockReturnThis(),
    delete:      vi.fn().mockReturnThis(),
    eq:          vi.fn().mockReturnThis(),
    order:       vi.fn().mockReturnThis(),
    limit:       vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(() => Promise.resolve(takeFromResult(table))),
    single:      vi.fn(() => Promise.resolve(takeFromResult(table))),
  };
  (chain as unknown as { then: (fn: (v: unknown) => unknown) => Promise<unknown> }).then =
    (resolve) => Promise.resolve(takeFromResult(table)).then(resolve);
  return chain;
}
const mockFrom = vi.fn((t: string) => makeChain(t));

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  })),
}));

beforeEach(() => {
  vi.clearAllMocks();
  Object.keys(fromQueue).forEach(k => delete fromQueue[k]);
  process.env.NEXT_PUBLIC_SUPABASE_URL      = "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
});

async function loadRoute() {
  vi.resetModules();
  return await import("../route");
}

function makeReq(body: Record<string, unknown> | null, method: "PATCH" | "DELETE"): Request {
  const init: RequestInit = {
    method,
    headers: { "content-type": "application/json" },
  };
  if (method === "PATCH" && body !== null) init.body = JSON.stringify(body);
  return new Request("https://test.icareeros.com/api/applications/abc", init);
}

const params = Promise.resolve({ id: "abc" });

// ── PATCH ──────────────────────────────────────────────────────────────────

describe("PATCH /api/applications/[id]", () => {
  it("401 when unauthenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const { PATCH } = await loadRoute();
    const res = await PATCH(makeReq({ status: "interviewing" }, "PATCH"), { params });
    expect(res.status).toBe(401);
  });

  it("400 when body is unparseable", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const { PATCH } = await loadRoute();
    const bad = new Request("https://x/api/applications/abc", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: "{",
    });
    const res = await PATCH(bad, { params });
    expect(res.status).toBe(400);
  });

  it("400 when no patchable fields are present", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const { PATCH } = await loadRoute();
    const res = await PATCH(makeReq({ unknown_field: 1 }, "PATCH"), { params });
    expect(res.status).toBe(400);
  });

  it("400 when status is invalid", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const { PATCH } = await loadRoute();
    const res = await PATCH(makeReq({ status: "garbage" }, "PATCH"), { params });
    expect(res.status).toBe(400);
  });

  it("404 when the row does not belong to the caller", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    pushFromResult("applications", { data: null, error: null }); // ownership lookup miss
    const { PATCH } = await loadRoute();
    const res = await PATCH(makeReq({ status: "interviewing" }, "PATCH"), { params });
    expect(res.status).toBe(404);
  });

  it("200 happy path returns the updated row", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    pushFromResult("applications", { data: { id: "abc" }, error: null }); // ownership OK
    pushFromResult("applications", {
      data: {
        id: "abc", user_id: "u1", cycle_id: null, opportunity_id: null,
        job_title: "PM", company: "Acme", job_url: null, status: "interviewing",
        notes: "", applied_at: "2026-05-01T00:00:00Z", updated_at: "2026-05-07T00:00:00Z",
      },
      error: null,
    });
    const { PATCH } = await loadRoute();
    const res = await PATCH(makeReq({ status: "interviewing", notes: "Phone screen" }, "PATCH"), { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.application.status).toBe("interviewing");
  });
});

// ── DELETE ─────────────────────────────────────────────────────────────────

describe("DELETE /api/applications/[id]", () => {
  it("401 when unauthenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const { DELETE } = await loadRoute();
    const res = await DELETE(makeReq(null, "DELETE"), { params });
    expect(res.status).toBe(401);
  });

  it("404 when the row is not the caller's", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    pushFromResult("applications", { data: null, error: null });
    const { DELETE } = await loadRoute();
    const res = await DELETE(makeReq(null, "DELETE"), { params });
    expect(res.status).toBe(404);
  });

  it("200 happy path", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    pushFromResult("applications", { data: { id: "abc" }, error: null }); // ownership OK
    pushFromResult("applications", { data: null, error: null });          // delete result
    const { DELETE } = await loadRoute();
    const res = await DELETE(makeReq(null, "DELETE"), { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});
