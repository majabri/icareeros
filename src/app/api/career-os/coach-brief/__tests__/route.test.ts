/**
 * /api/career-os/coach-brief route unit tests
 *
 * Phase 1 Item 2 — see docs/specs/COWORK-BRIEF-phase1-v1.md
 *
 * Mocks: next/headers (cookies — Next.js 15 strict request scope),
 *        @supabase/ssr (createServerClient), and the Anthropic SDK
 *        (via createTracedClient pass-through). The Supabase client mock
 *        is a programmable query-chain that returns whatever data the
 *        test queues for each call.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── next/headers — Next 15 cookies request-scope ────────────────────────────
vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({
    getAll: vi.fn().mockReturnValue([]),
    get:    vi.fn(),
    set:    vi.fn(),
    delete: vi.fn(),
  }),
}));

// ── Supabase server client ──────────────────────────────────────────────────
const mockGetUser = vi.fn();
const fromQueue: Record<string, Array<unknown>> = {};
function pushFromResult(table: string, result: unknown) {
  if (!fromQueue[table]) fromQueue[table] = [];
  fromQueue[table].push(result);
}
function takeFromResult(table: string): unknown {
  const q = fromQueue[table];
  if (!q || q.length === 0) {
    throw new Error(`No queued result for table '${table}'`);
  }
  return q.shift()!;
}
function makeChain(table: string) {
  let pending: unknown = null;
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq:     vi.fn().mockReturnThis(),
    in:     vi.fn().mockReturnThis(),
    gte:    vi.fn().mockReturnThis(),
    order:  vi.fn().mockReturnThis(),
    limit:  vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(() => { pending = takeFromResult(table); return Promise.resolve(pending); }),
    single:      vi.fn(() => { pending = takeFromResult(table); return Promise.resolve(pending); }),
    then: undefined as unknown,
  };
  // Make the chain awaitable (for COUNT queries that don't end in single/maybeSingle)
  chain.then = (resolve: (v: unknown) => unknown) => {
    pending = takeFromResult(table);
    return Promise.resolve(pending).then(resolve);
  };
  return chain;
}
const mockFrom = vi.fn((table: string) => makeChain(table));

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  })),
}));

// ── Anthropic via createTracedClient passthrough ────────────────────────────
const mockAnthropicCreate = vi.fn();
vi.mock("@/lib/observability/langfuse", () => ({
  createTracedClient: vi.fn(() => ({
    messages: { create: mockAnthropicCreate },
  })),
}));

// ── Global fetch stub — silences the email fire-and-forget DNS noise. ────────
const originalFetch = globalThis.fetch;
beforeEach(() => {
  vi.clearAllMocks();
  Object.keys(fromQueue).forEach(k => delete fromQueue[k]);
  process.env.NEXT_PUBLIC_SUPABASE_URL      = "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
  process.env.NEXT_PUBLIC_SITE_URL          = "https://test.icareeros.com";
  // Stub fetch so the email branch resolves without making a real network call.
  // The route uses fetch(new URL(...)) for /api/email/send — return ok:true.
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ ok: true }),
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

async function loadRoute() {
  vi.resetModules();
  return await import("../route");
}

function makeReq(body: Record<string, unknown> = {}, headers: Record<string, string> = {}): Request {
  return new Request("https://test.icareeros.com/api/career-os/coach-brief", {
    method:  "POST",
    headers: { "content-type": "application/json", ...headers },
    body:    JSON.stringify(body),
  });
}

// ── Helpers to queue a "happy-path" sequence of Supabase calls ──────────────
function queueHappyPath(opts: {
  cycleId:   string;
  plan:      "free" | "starter" | "standard" | "pro";
  monetizationOn: boolean;
  briefHistoryCount: number;
  cacheHit:  boolean;
  currentStage?: string;
  evaluateLastEventAt?: string | null;
  applicationsCount?: number;
}) {
  const { cycleId, plan, monetizationOn, briefHistoryCount, cacheHit } = opts;
  const currentStage        = opts.currentStage        ?? "coach";
  const evaluateLastEventAt = opts.evaluateLastEventAt ?? "2026-05-01T00:00:00Z";
  const applicationsCount   = opts.applicationsCount   ?? 0;

  // 1. user_subscriptions (resolveEffectivePlan)
  pushFromResult("user_subscriptions", {
    data:  { plan, status: "active" },
    error: null,
  });
  // 2. feature_flags (isMonetizationOn)
  pushFromResult("feature_flags", {
    data:  { enabled: monetizationOn },
    error: null,
  });
  // 3. career_os_stages → coach row (notes incl. brief + history)
  const briefHistory = Array(briefHistoryCount).fill(null).map((_, i) => ({
    generatedAt: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString(),
    plan,
  }));
  const cacheSignals = { currentStage, evaluateLastEventAt, applicationsCount };
  const cachedBrief = cacheHit
    ? { content: "Cached brief content here.", generatedAt: "2026-05-05T00:00:00Z", signals: cacheSignals }
    : undefined;
  pushFromResult("career_os_stages", {
    data: {
      id:    "coach-row-id",
      notes: { brief: cachedBrief, briefHistory },
    },
    error: null,
  });
  // 4. career_os_cycles
  pushFromResult("career_os_cycles", {
    data:  { current_stage: currentStage },
    error: null,
  });
  // 5. career_os_stages → evaluate row (last_event_at)
  pushFromResult("career_os_stages", {
    data:  { last_event_at: evaluateLastEventAt },
    error: null,
  });
  // 6. applications (count)
  pushFromResult("applications", { count: applicationsCount, error: null });

  // 7-8. Cache-miss path — queue user message context AND the persistence
  // update. Cache-hit paths consume neither (the route returns before).
  if (!cacheHit) {
    pushFromResult("career_profiles", {
      data:  { full_name: "Test User", headline: "Eng", summary: "x", skills: ["ts"] },
      error: null,
    });
    pushFromResult("career_os_stages", {
      data:  [{ stage: "evaluate", status: "completed", notes: { x: 1 } }],
      error: null,
    });
    // 9. update() resolved
    pushFromResult("career_os_stages", { data: null, error: null });
  }
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("/api/career-os/coach-brief — auth + validation", () => {
  it("returns 401 when there is no authenticated user", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    const { POST } = await loadRoute();
    const res  = await POST(makeReq({ cycle_id: "c1" }));
    const body = await res.json();
    expect(res.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 400 when cycle_id is missing from body", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1", email: "u@x.com" } }, error: null });
    const { POST } = await loadRoute();
    const res = await POST(makeReq({}));
    expect(res.status).toBe(400);
  });
});

describe("/api/career-os/coach-brief — rate limiting", () => {
  beforeEach(() => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1", email: "u@x.com" } }, error: null });
  });

  it("free plan blocked at 2 briefs/month when monetization is on", async () => {
    queueHappyPath({ cycleId: "c1", plan: "free", monetizationOn: true, briefHistoryCount: 2, cacheHit: false });
    // Note: career_os_cycles + evaluate row + applications won't be reached when blocked.
    const { POST } = await loadRoute();
    const res = await POST(makeReq({ cycle_id: "c1" }));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body).toMatchObject({ error: "rate_limited", limit: 2, used: 2, plan: "free" });
  });

  it("starter plan blocked at 5/month when monetization is on", async () => {
    queueHappyPath({ cycleId: "c1", plan: "starter", monetizationOn: true, briefHistoryCount: 5, cacheHit: false });
    const { POST } = await loadRoute();
    const res = await POST(makeReq({ cycle_id: "c1" }));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body).toMatchObject({ error: "rate_limited", limit: 5, used: 5, plan: "starter" });
  });

  it("pro plan never blocked (unlimited = -1)", async () => {
    queueHappyPath({
      cycleId: "c1", plan: "pro", monetizationOn: true,
      briefHistoryCount: 100, cacheHit: false,
    });
    mockAnthropicCreate.mockResolvedValue({ content: [{ type: "text", text: "Pro brief" }] });
    const { POST } = await loadRoute();
    const res = await POST(makeReq({ cycle_id: "c1" }));
    expect(res.status).toBe(200);
  });

  it("monetization OFF — limits not enforced (fail open)", async () => {
    // Free plan with 100 briefs would normally block; monetization off means it doesn't.
    queueHappyPath({ cycleId: "c1", plan: "free", monetizationOn: false, briefHistoryCount: 100, cacheHit: false });
    mockAnthropicCreate.mockResolvedValue({ content: [{ type: "text", text: "Pre-launch brief" }] });
    const { POST } = await loadRoute();
    const res = await POST(makeReq({ cycle_id: "c1" }));
    expect(res.status).toBe(200);
  });
});

describe("/api/career-os/coach-brief — cache behaviour", () => {
  beforeEach(() => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1", email: "u@x.com" } }, error: null });
  });

  it("returns cache when signals match — no Anthropic call", async () => {
    queueHappyPath({
      cycleId: "c1", plan: "starter", monetizationOn: false,
      briefHistoryCount: 1, cacheHit: true,
      currentStage: "coach", evaluateLastEventAt: "2026-05-01T00:00:00Z", applicationsCount: 0,
    });
    const { POST } = await loadRoute();
    const res = await POST(makeReq({ cycle_id: "c1" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.source).toBe("cache");
    expect(body.brief).toBe("Cached brief content here.");
    expect(mockAnthropicCreate).not.toHaveBeenCalled();
  });

  it("regenerates when current_stage has changed", async () => {
    // Cache was generated when current_stage was 'coach', now it's 'achieve'.
    queueHappyPath({
      cycleId: "c1", plan: "starter", monetizationOn: false,
      briefHistoryCount: 1, cacheHit: true,
      currentStage: "achieve", evaluateLastEventAt: "2026-05-01T00:00:00Z", applicationsCount: 0,
    });
    // Cached signals say current_stage='coach', actual row says 'achieve' → mismatch
    // BUT queueHappyPath puts the same currentStage into both the cached signals and the
    // current cycle row — let me explicitly override the cache signals.
    // Simpler: mutate the queued coach_stage data to have stale signals.
    // Reset and re-queue manually:
    Object.keys(fromQueue).forEach(k => delete fromQueue[k]);
    pushFromResult("user_subscriptions", { data: { plan: "starter", status: "active" }, error: null });
    pushFromResult("feature_flags",     { data: { enabled: false }, error: null });
    pushFromResult("career_os_stages", {
      data: {
        id: "coach-row-id",
        notes: {
          brief: {
            content:     "Stale brief",
            generatedAt: "2026-04-15T00:00:00Z",
            signals:     { currentStage: "coach", evaluateLastEventAt: "2026-05-01T00:00:00Z", applicationsCount: 0 },
          },
          briefHistory: [{ generatedAt: "2026-04-15T00:00:00Z", plan: "starter" }],
        },
      },
      error: null,
    });
    pushFromResult("career_os_cycles", { data: { current_stage: "achieve" }, error: null });
    pushFromResult("career_os_stages", { data: { last_event_at: "2026-05-01T00:00:00Z" }, error: null });
    pushFromResult("applications",     { count: 0, error: null });
    pushFromResult("career_profiles",  { data: { full_name: "U", headline: "X", summary: "Y", skills: ["k"] }, error: null });
    pushFromResult("career_os_stages", { data: [{ stage: "evaluate", status: "completed", notes: { x: 1 } }], error: null });
    pushFromResult("career_os_stages", { data: null, error: null }); // update()
    mockAnthropicCreate.mockResolvedValue({ content: [{ type: "text", text: "Fresh brief" }] });

    const { POST } = await loadRoute();
    const res  = await POST(makeReq({ cycle_id: "c1" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.source).toBe("fresh");
    expect(body.brief).toBe("Fresh brief");
    expect(mockAnthropicCreate).toHaveBeenCalledTimes(1);
  });
});
