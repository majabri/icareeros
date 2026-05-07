/**
 * /api/career-os/evaluate/assessment route tests — Phase 4 Item 2b.
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
function makeChain(table: string) {
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    update: vi.fn(() => makeAwaitable(table)),
    eq:     vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(() => {
      const q = fromQueue[table];
      if (!q || q.length === 0) throw new Error(`No queued result for table '${table}'`);
      return Promise.resolve(q.shift()!);
    }),
  };
  return chain;
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
const mockFrom = vi.fn((table: string) => makeChain(table));
vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({ auth: { getUser: mockGetUser }, from: mockFrom })),
}));

const mockAnthropicCreate = vi.fn();
vi.mock("@/lib/observability/langfuse", () => ({
  createTracedClient: vi.fn(() => ({
    messages: { create: (...args: unknown[]) => mockAnthropicCreate(...args) },
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
  return new Request("https://test.icareeros.com/api/career-os/evaluate/assessment", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function tenResponses(): Array<{ skill: string; confidence: number }> {
  return Array.from({ length: 10 }, (_, i) => ({
    skill:      `Skill${i + 1}`,
    confidence: ((i % 5) + 1),
  }));
}

const VALID_REPORT = {
  strongSkills:     ["Skill4", "Skill5"],
  developingSkills: ["Skill2", "Skill3"],
  gapSkills:        ["Skill1"],
  narrative:        "You have a solid foundation in advanced topics, with room to develop on intermediate ones. Treat the gap as a 30-day focus.",
};

describe("/api/career-os/evaluate/assessment", () => {
  it("returns 401 when unauthenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    const { POST } = await loadRoute();
    const res = await POST(makeReq({ cycle_id: "c1", responses: tenResponses() }));
    expect(res.status).toBe(401);
    expect(mockAnthropicCreate).not.toHaveBeenCalled();
  });

  it("returns 400 when cycle_id is missing", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    const { POST } = await loadRoute();
    const res = await POST(makeReq({ responses: tenResponses() }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when responses length is not 10", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    const { POST } = await loadRoute();
    const res = await POST(makeReq({ cycle_id: "c1", responses: tenResponses().slice(0, 5) }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when a confidence value is out of range", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    const bad = tenResponses();
    bad[0].confidence = 7;
    const { POST } = await loadRoute();
    const res = await POST(makeReq({ cycle_id: "c1", responses: bad }));
    expect(res.status).toBe(400);
  });

  it("synthesizes a report and merges into Evaluate stage notes", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockAnthropicCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: JSON.stringify(VALID_REPORT) }],
    });
    pushFromResult("career_os_stages", {
      data: { id: "stage-evaluate-1", notes: { skills: ["TS"], gaps: ["x"] } },
      error: null,
    });
    let capturedNotes: unknown = null;
    mockFrom.mockImplementation((table: string) => {
      const chain = makeChain(table);
      if (table === "career_os_stages") {
        const origUpdate = chain.update;
        chain.update = vi.fn((patch: Record<string, unknown>) => {
          capturedNotes = patch.notes;
          return makeAwaitable(table);
        });
        // Side note: makeAwaitable will throw without a queued result, so push one
      }
      return chain;
    });
    pushFromResult("career_os_stages", { data: null, error: null }); // stage row read
    pushFromResult("career_os_stages", { data: null, error: null }); // update result

    const { POST } = await loadRoute();
    const res = await POST(makeReq({ cycle_id: "c1", responses: tenResponses() }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.report).toMatchObject(VALID_REPORT);
    expect(capturedNotes).toBeTruthy();
    const notes = capturedNotes as Record<string, unknown>;
    expect(notes.assessment).toBeTruthy();
    // Existing notes preserved alongside the new assessment block
    expect(notes.skills).toEqual(["TS"]);
    expect(notes.gaps).toEqual(["x"]);
  });

  it("returns 404 when the user has no Evaluate stage row for the cycle", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockAnthropicCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: JSON.stringify(VALID_REPORT) }],
    });
    pushFromResult("career_os_stages", { data: null, error: null });
    const { POST } = await loadRoute();
    const res = await POST(makeReq({ cycle_id: "c1", responses: tenResponses() }));
    expect(res.status).toBe(404);
  });
});
