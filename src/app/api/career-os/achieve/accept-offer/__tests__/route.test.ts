/**
 * /api/career-os/achieve/accept-offer route tests — Phase 4 Item 3.
 *
 * Mocks: next/headers, @supabase/ssr (queue + rpc support).
 * The Postgres function `complete_cycle_and_start_next` itself is exercised
 * in production via the Supabase MCP migration apply; here we just verify
 * the route's auth + body validation + RPC call shape + error mapping.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── next/headers ────────────────────────────────────────────────────────────
vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({
    getAll: vi.fn().mockReturnValue([]),
    get: vi.fn(), set: vi.fn(), delete: vi.fn(),
  }),
}));

// ── Supabase client mock with from() chain + rpc() ─────────────────────────
const mockGetUser = vi.fn();
const fromQueue: Record<string, Array<unknown>> = {};
function pushFromResult(table: string, result: unknown) {
  if (!fromQueue[table]) fromQueue[table] = [];
  fromQueue[table].push(result);
}
function makeAwaitable(table: string) {
  return {
    eq: vi.fn().mockReturnThis(),
    then: (resolve: (v: unknown) => unknown) => {
      const q = fromQueue[table];
      if (!q || q.length === 0) throw new Error(`No queued result for table '${table}' (update)`);
      return Promise.resolve(q.shift()!).then(resolve);
    },
  };
}
function makeChain(table: string) {
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    update: vi.fn(() => makeAwaitable(table)),
    eq:     vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(() => {
      const q = fromQueue[table];
      if (!q || q.length === 0) throw new Error(`No queued result for table '${table}' (maybeSingle)`);
      return Promise.resolve(q.shift()!);
    }),
  };
  return chain;
}
const mockRpc = vi.fn();
const mockFrom = vi.fn((table: string) => makeChain(table));

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
    rpc:  (...args: unknown[]) => mockRpc(...args),
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

function makeReq(body: Record<string, unknown> = {}): Request {
  return new Request("https://test.icareeros.com/api/career-os/achieve/accept-offer", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("/api/career-os/achieve/accept-offer — auth + validation", () => {
  it("returns 401 when unauthenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    const { POST } = await loadRoute();
    const res = await POST(makeReq({ offer_id: "off-1" }));
    expect(res.status).toBe(401);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("returns 400 when offer_id is missing", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    const { POST } = await loadRoute();
    const res = await POST(makeReq({}));
    expect(res.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe("/api/career-os/achieve/accept-offer — happy path", () => {
  beforeEach(() => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
  });

  it("returns 404 when the offer is not found / not owned", async () => {
    pushFromResult("job_offers", { data: null, error: null });
    const { POST } = await loadRoute();
    const res = await POST(makeReq({ offer_id: "off-1" }));
    expect(res.status).toBe(404);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("updates offer status, dispatches RPC, returns the loop trigger result", async () => {
    pushFromResult("job_offers", {
      data: { id: "off-1", role_title: "Senior PM", company: "Acme", status: "received" },
      error: null,
    });
    pushFromResult("job_offers", { data: null, error: null }); // update
    mockRpc.mockResolvedValue({
      data: { newCycleId: "cyc-2", totalXp: 100, level: 1, milestoneId: "m-1" },
      error: null,
    });

    const { POST } = await loadRoute();
    const res = await POST(makeReq({ offer_id: "off-1" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ newCycleId: "cyc-2", totalXp: 100, level: 1, milestoneId: "m-1" });

    // Verify RPC was called with the right shape
    expect(mockRpc).toHaveBeenCalledWith("complete_cycle_and_start_next", {
      p_user_id:       "u1",
      p_offer_id:      "off-1",
      p_offer_summary: "Senior PM at Acme",
    });
  });

  it("skips redundant status update when offer is already 'accepted'", async () => {
    pushFromResult("job_offers", {
      data: { id: "off-1", role_title: "PM", company: "Acme", status: "accepted" },
      error: null,
    });
    // No update queued — the route should skip the UPDATE because status is already accepted.
    mockRpc.mockResolvedValue({
      data: { newCycleId: "cyc-2", totalXp: 100, level: 1, milestoneId: "m-1" },
      error: null,
    });

    const { POST } = await loadRoute();
    const res = await POST(makeReq({ offer_id: "off-1" }));
    expect(res.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });
});

describe("/api/career-os/achieve/accept-offer — error mapping", () => {
  beforeEach(() => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
  });

  it("returns 409 when the Postgres function raises 'Offer already processed'", async () => {
    pushFromResult("job_offers", {
      data: { id: "off-1", role_title: "PM", company: "Acme", status: "accepted" },
      error: null,
    });
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "Offer already processed" },
    });
    const { POST } = await loadRoute();
    const res = await POST(makeReq({ offer_id: "off-1" }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/already processed/);
  });

  it("returns 409 when there is no active cycle to complete", async () => {
    pushFromResult("job_offers", {
      data: { id: "off-1", role_title: "PM", company: "Acme", status: "accepted" },
      error: null,
    });
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "No active cycle to complete" },
    });
    const { POST } = await loadRoute();
    const res = await POST(makeReq({ offer_id: "off-1" }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/active cycle/i);
  });

  it("returns 500 on unexpected RPC error", async () => {
    pushFromResult("job_offers", {
      data: { id: "off-1", role_title: "PM", company: "Acme", status: "accepted" },
      error: null,
    });
    mockRpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { POST } = await loadRoute();
    const res = await POST(makeReq({ offer_id: "off-1" }));
    expect(res.status).toBe(500);
    consoleSpy.mockRestore();
  });
});
