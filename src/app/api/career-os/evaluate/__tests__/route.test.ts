/**
 * /api/career-os/evaluate route tests — Phase 4 Item 2a.
 *
 * Covers the new LinkedIn gap analysis section appended to the existing
 * evaluation output. The original Evaluate behaviour (skills, gaps,
 * marketFitScore, careerLevel, summary, recommendedNextStage) is exercised
 * here too so the LinkedIn additions don't regress it.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── next/headers ────────────────────────────────────────────────────────────
vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({
    getAll: vi.fn().mockReturnValue([]),
    get: vi.fn(), set: vi.fn(), delete: vi.fn(),
  }),
}));

// ── @supabase/ssr — per-table FIFO queue ───────────────────────────────────
const mockGetUser = vi.fn();
const fromQueue: Record<string, Array<unknown>> = {};
function pushFromResult(table: string, result: unknown) {
  if (!fromQueue[table]) fromQueue[table] = [];
  fromQueue[table].push(result);
}
function makeChain(table: string) {
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq:     vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(() => {
      const q = fromQueue[table];
      if (!q || q.length === 0) throw new Error(`No queued result for table '${table}'`);
      return Promise.resolve(q.shift()!);
    }),
  };
  return chain;
}
const mockFrom = vi.fn((table: string) => makeChain(table));
vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({ auth: { getUser: mockGetUser }, from: mockFrom })),
}));

// ── Anthropic SDK ──────────────────────────────────────────────────────────
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
  return new Request("https://test.icareeros.com/api/career-os/evaluate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID_EVAL = {
  skills:                ["TypeScript", "PM"],
  gaps:                  ["Public speaking"],
  marketFitScore:        72,
  careerLevel:           "mid",
  recommendedNextStage:  "advise",
  summary:               "Strong mid-level PM with growth path.",
};

const VALID_LINKEDIN = {
  headlineSuggestion: "Senior Product Manager — fintech roadmaps and outcomes",
  aboutGaps:          ["Quantify retention impact", "Mention target role explicitly"],
  skillsToAdd:        ["Stakeholder management", "Postgres", "OKRs", "Roadmapping"],
  strengthScore:      7,
};

function stubMainEvaluation(): void {
  mockAnthropicCreate.mockResolvedValueOnce({
    content: [{ type: "text", text: JSON.stringify(VALID_EVAL) }],
  });
}
function stubLinkedInAnalysis(): void {
  mockAnthropicCreate.mockResolvedValueOnce({
    content: [{ type: "text", text: JSON.stringify(VALID_LINKEDIN) }],
  });
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("/api/career-os/evaluate — auth + base path", () => {
  it("returns 401 when there is no authenticated user", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    const { POST } = await loadRoute();
    const res = await POST(makeReq({}));
    expect(res.status).toBe(401);
  });

  it("returns 422 when the user has no profile", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1", email: "u@x.com" } }, error: null });
    pushFromResult("user_profiles", { data: null, error: null });
    const { POST } = await loadRoute();
    const res = await POST(makeReq({}));
    expect(res.status).toBe(422);
  });
});

describe("/api/career-os/evaluate — LinkedIn analysis (Phase 4 Item 2a)", () => {
  beforeEach(() => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1", email: "u@x.com" } }, error: null });
  });

  it("includes linkedinAnalysis for paid plans when career_profiles has sufficient data", async () => {
    pushFromResult("user_profiles", {
      data: {
        full_name: "U", current_position: "PM", target_roles: ["Senior PM"],
        skills: ["TS", "PM"], experience_level: "mid", location: "Remote", open_to_remote: true,
      },
      error: null,
    });
    pushFromResult("career_profiles", {
      data: {
        headline: "Senior PM",
        summary: "Built two products at scale.",
        skills: ["TS", "PM", "OKRs"],
        target_skills: ["Postgres"],
        work_experience: [{ title: "PM" }],
        linkedin_url: null,
      },
      error: null,
    });
    pushFromResult("user_subscriptions", { data: { plan: "starter", status: "active" }, error: null });

    stubMainEvaluation();
    stubLinkedInAnalysis();

    const { POST } = await loadRoute();
    const res = await POST(makeReq({}));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.linkedinAnalysis).toMatchObject({
      headlineSuggestion: VALID_LINKEDIN.headlineSuggestion,
      strengthScore:      7,
    });
    expect(Array.isArray(body.linkedinAnalysis.skillsToAdd)).toBe(true);
    expect(mockAnthropicCreate).toHaveBeenCalledTimes(2);
  });

  it("returns linkedinAnalysis: { gated: true } for free plan when data is sufficient", async () => {
    pushFromResult("user_profiles", {
      data: {
        full_name: "U", current_position: "PM", target_roles: ["Senior PM"],
        skills: ["TS", "PM"], experience_level: "mid", location: "Remote", open_to_remote: true,
      },
      error: null,
    });
    pushFromResult("career_profiles", {
      data: {
        headline: "PM",
        summary: "x",
        skills: ["TS", "PM", "OKRs"],
        target_skills: [],
        work_experience: [],
        linkedin_url: null,
      },
      error: null,
    });
    pushFromResult("user_subscriptions", { data: { plan: "free", status: "active" }, error: null });

    stubMainEvaluation();
    // No LinkedIn LLM call expected — gated path skips it.

    const { POST } = await loadRoute();
    const res = await POST(makeReq({}));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.linkedinAnalysis).toMatchObject({ gated: true, plan: "free" });
    expect(body.linkedinAnalysis.upgradeMessage).toContain("Starter");
    // Only the main evaluation Haiku call — no second call.
    expect(mockAnthropicCreate).toHaveBeenCalledTimes(1);
  });

  it("skips LinkedIn analysis when career_profiles data is insufficient", async () => {
    pushFromResult("user_profiles", {
      data: {
        full_name: "U", current_position: "PM", target_roles: [],
        skills: [], experience_level: "mid", location: null, open_to_remote: false,
      },
      error: null,
    });
    // career_profiles: no headline, no summary, only 1 skill → insufficient
    pushFromResult("career_profiles", {
      data: { headline: "", summary: "", skills: ["only-one"], target_skills: [], work_experience: [], linkedin_url: null },
      error: null,
    });

    stubMainEvaluation();
    // No subscription read, no LinkedIn LLM call.

    const { POST } = await loadRoute();
    const res = await POST(makeReq({}));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.linkedinAnalysis).toBeUndefined();
    expect(mockAnthropicCreate).toHaveBeenCalledTimes(1);
  });

  it("does not poison the response when LinkedIn LLM call fails", async () => {
    pushFromResult("user_profiles", {
      data: {
        full_name: "U", current_position: "PM", target_roles: [],
        skills: ["TS", "PM", "OKRs"], experience_level: "mid", location: null, open_to_remote: false,
      },
      error: null,
    });
    pushFromResult("career_profiles", {
      data: { headline: "PM", summary: "x", skills: ["TS", "PM", "OKRs"], target_skills: [], work_experience: [], linkedin_url: null },
      error: null,
    });
    pushFromResult("user_subscriptions", { data: { plan: "starter", status: "active" }, error: null });

    stubMainEvaluation();
    // LinkedIn call throws — main evaluation should still succeed
    mockAnthropicCreate.mockRejectedValueOnce(new Error("LLM 500"));
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { POST } = await loadRoute();
    const res = await POST(makeReq({}));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.linkedinAnalysis).toBeUndefined();
    expect(body.skills).toEqual(VALID_EVAL.skills);
    consoleWarn.mockRestore();
  });
});
