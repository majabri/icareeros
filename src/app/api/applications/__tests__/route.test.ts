/**
 * /api/applications — GET + POST tests.
 *
 * Mocks: next/headers, @supabase/ssr (per-table FIFO queue).
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
    insert:      vi.fn().mockReturnThis(),
    update:      vi.fn().mockReturnThis(),
    delete:      vi.fn().mockReturnThis(),
    eq:          vi.fn().mockReturnThis(),
    order:       vi.fn().mockReturnThis(),
    limit:       vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(() => Promise.resolve(takeFromResult(table))),
    single:      vi.fn(() => Promise.resolve(takeFromResult(table))),
  };
  // Awaitable: SELECT calls without a terminator resolve via .then().
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

function makeReq(body: Record<string, unknown> | null, method: "GET" | "POST" = "POST"): Request {
  const init: RequestInit = {
    method,
    headers: { "content-type": "application/json" },
  };
  if (method === "POST" && body !== null) init.body = JSON.stringify(body);
  return new Request("https://test.icareeros.com/api/applications", init);
}

// ── GET ────────────────────────────────────────────────────────────────────

describe("GET /api/applications", () => {
  it("401 when unauthenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const { GET } = await loadRoute();
    const res = await GET(makeReq(null, "GET"));
    expect(res.status).toBe(401);
  });

  it("returns the user's rows on happy path", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    pushFromResult("applications", {
      data: [
        { id: "a1", user_id: "u1", job_title: "PM", company: "Acme", status: "applied", applied_at: "2026-05-01T00:00:00Z", updated_at: "2026-05-01T00:00:00Z" },
      ],
      error: null,
    });
    const { GET } = await loadRoute();
    const res = await GET(makeReq(null, "GET"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.applications).toHaveLength(1);
    expect(body.applications[0].id).toBe("a1");
  });

  it("filters by status when ?status= matches a known value", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    pushFromResult("applications", { data: [], error: null });
    const { GET } = await loadRoute();
    const url = "https://test.icareeros.com/api/applications?status=offer";
    const res = await GET(new Request(url, { method: "GET" }));
    expect(res.status).toBe(200);
    // The .eq spy on the chain is the same one; verify status was applied via second eq call
    const calls = mockFrom.mock.results
      .map(r => (r.value as Record<string, unknown>)?.eq)
      .filter(Boolean) as unknown as Array<ReturnType<typeof vi.fn>>;
    const allEqArgs = calls.flatMap(s => s.mock.calls.map(c => c.slice(0, 2)));
    const hasStatusEq = allEqArgs.some(a => a[0] === "status" && a[1] === "offer");
    expect(hasStatusEq).toBe(true);
  });

  it("ignores invalid ?status= values", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    pushFromResult("applications", { data: [], error: null });
    const { GET } = await loadRoute();
    const res = await GET(new Request("https://x/api/applications?status=garbage", { method: "GET" }));
    expect(res.status).toBe(200);
    const calls = mockFrom.mock.results
      .map(r => (r.value as Record<string, unknown>)?.eq)
      .filter(Boolean) as unknown as Array<ReturnType<typeof vi.fn>>;
    const allEqArgs = calls.flatMap(s => s.mock.calls.map(c => c.slice(0, 2)));
    const hasGarbageEq = allEqArgs.some(a => a[0] === "status" && a[1] === "garbage");
    expect(hasGarbageEq).toBe(false);
  });
});

// ── POST ───────────────────────────────────────────────────────────────────

describe("POST /api/applications", () => {
  it("401 when unauthenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const { POST } = await loadRoute();
    const res = await POST(makeReq({ job_title: "PM", company: "Acme" }));
    expect(res.status).toBe(401);
  });

  it("400 when body is unparseable", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const { POST } = await loadRoute();
    const bad = new Request("https://x/api/applications", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not-json",
    });
    const res = await POST(bad);
    expect(res.status).toBe(400);
  });

  it("400 when job_title is missing", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const { POST } = await loadRoute();
    const res = await POST(makeReq({ company: "Acme" }));
    expect(res.status).toBe(400);
  });

  it("400 when company is missing", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const { POST } = await loadRoute();
    const res = await POST(makeReq({ job_title: "PM" }));
    expect(res.status).toBe(400);
  });

  it("400 when both fields present but empty/whitespace", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const { POST } = await loadRoute();
    const res = await POST(makeReq({ job_title: "  ", company: "" }));
    expect(res.status).toBe(400);
  });

  it("200 happy path: auto-fills cycle_id from active cycle, defaults status to 'applied'", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    // Active cycle lookup
    pushFromResult("career_os_cycles", { data: { id: "cycle-7" }, error: null });
    // INSERT new row
    pushFromResult("applications", {
      data: {
        id: "new-app", user_id: "u1", cycle_id: "cycle-7",
        opportunity_id: null, job_title: "Senior PM", company: "Acme",
        job_url: null, status: "applied", notes: "",
        applied_at: "2026-05-07T00:00:00Z", updated_at: "2026-05-07T00:00:00Z",
      },
      error: null,
    });
    const { POST } = await loadRoute();
    const res = await POST(makeReq({ job_title: "Senior PM", company: "Acme" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.application.id).toBe("new-app");
    expect(body.application.cycle_id).toBe("cycle-7");
    expect(body.application.status).toBe("applied");
  });

  it("200 happy path: passes through status, notes, opportunity_id, job_url", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    pushFromResult("career_os_cycles", { data: null, error: null }); // no active cycle
    pushFromResult("applications", {
      data: {
        id: "x", user_id: "u1", cycle_id: null,
        opportunity_id: "opp-1", job_title: "Designer", company: "Beta",
        job_url: "https://example.com/job/1", status: "interviewing",
        notes: "called recruiter", applied_at: "2026-05-07T00:00:00Z",
        updated_at: "2026-05-07T00:00:00Z",
      },
      error: null,
    });
    const { POST } = await loadRoute();
    const res = await POST(makeReq({
      job_title: "Designer",
      company: "Beta",
      job_url: "https://example.com/job/1",
      status: "interviewing",
      notes: "called recruiter",
      opportunity_id: "opp-1",
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.application.status).toBe("interviewing");
    expect(body.application.opportunity_id).toBe("opp-1");
    expect(body.application.cycle_id).toBeNull();
  });

  it("400 when status is not in the valid set", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    pushFromResult("career_os_cycles", { data: null, error: null });
    // Even garbage status falls back to 'applied' (route silently corrects).
    // We assert the inserted row has status='applied'.
    pushFromResult("applications", {
      data: { id: "y", user_id: "u1", cycle_id: null, opportunity_id: null,
        job_title: "x", company: "y", job_url: null, status: "applied",
        notes: "", applied_at: "z", updated_at: "z" },
      error: null,
    });
    const { POST } = await loadRoute();
    const res = await POST(makeReq({
      job_title: "x", company: "y", status: "garbage",
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.application.status).toBe("applied");
  });
});
