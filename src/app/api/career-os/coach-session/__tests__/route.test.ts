/**
 * /api/career-os/coach-session route tests.
 *
 * Phase 3 Item 2 — see docs/specs/COWORK-BRIEF-phase3-v1.md.
 *
 * Mocks: next/headers (Next 15 cookies request scope), @supabase/ssr
 * (per-table FIFO queue of programmable results), the Anthropic SDK
 * via createTracedClient passthrough — including a fake `messages.stream()`
 * that yields `content_block_delta` events.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── next/headers ───────────────────────────────────────────────────────────
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
    update: vi.fn(() => {
      // Updates return the queued resolution as a thenable
      return makeAwaitable(table);
    }),
    upsert: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq:     vi.fn().mockReturnThis(),
    in:     vi.fn().mockReturnThis(),
    gte:    vi.fn().mockReturnThis(),
    order:  vi.fn().mockReturnThis(),
    limit:  vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(() => Promise.resolve(takeFromResult(table))),
    single:      vi.fn(() => Promise.resolve(takeFromResult(table))),
  };
  // Make the chain awaitable for SELECT calls without a terminator
  (chain as unknown as { then: (fn: (v: unknown) => unknown) => Promise<unknown> }).then =
    (resolve) => Promise.resolve(takeFromResult(table)).then(resolve);
  return chain;
}
function makeAwaitable(table: string) {
  return {
    eq: vi.fn().mockReturnThis(),
    then: (resolve: (v: unknown) => unknown) =>
      Promise.resolve(takeFromResult(table)).then(resolve),
  } as unknown;
}
function takeFromResult(table: string): unknown {
  const q = fromQueue[table];
  if (!q || q.length === 0) throw new Error(`No queued result for table '${table}'`);
  return q.shift()!;
}
const mockFrom = vi.fn((table: string) => makeChain(table));
vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  })),
}));

// ── Anthropic SDK (streaming) ──────────────────────────────────────────────
const mockAnthropicStream = vi.fn();
const mockAnthropicCreate = vi.fn();
vi.mock("@/lib/observability/langfuse", () => ({
  createTracedClient: vi.fn(() => ({
    messages: {
      stream: (...args: unknown[]) => mockAnthropicStream(...args),
      create: (...args: unknown[]) => mockAnthropicCreate(...args),
    },
  })),
  recordCoachSessionTrace: vi.fn().mockResolvedValue(undefined),
}));

// ── Helpers ────────────────────────────────────────────────────────────────
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

function makeReq(body: Record<string, unknown> = {}, method: "POST" | "GET" = "POST"): Request {
  return new Request("https://test.icareeros.com/api/career-os/coach-session", {
    method,
    headers: { "content-type": "application/json" },
    ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
  });
}

/**
 * Drain a streaming Response body into a single string of decoded SSE frames.
 * Returns the concatenated text payload from `data:` lines so tests can assert
 * the response shape without parsing every frame manually.
 */
async function drainStream(res: Response): Promise<{ raw: string; chunks: string[]; events: string[] }> {
  expect(res.body).not.toBeNull();
  const reader  = res.body!.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  const events: string[] = [];
  let raw = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    const text = decoder.decode(value, { stream: true });
    raw += text;
    for (const frame of text.split("\n\n")) {
      const lines = frame.split("\n").filter(Boolean);
      let event = "message";
      const data: string[] = [];
      for (const line of lines) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data.push(line.slice(5).trim());
      }
      if (data.length === 0) continue;
      events.push(event);
      try {
        const parsed = JSON.parse(data.join("\n"));
        if (event === "message" && parsed?.text) chunks.push(parsed.text);
      } catch { /* ignore */ }
    }
  }
  return { raw, chunks, events };
}

/** Sets up an Anthropic stream that emits a few text deltas + ends. */
function stubAnthropicStreamWithText(parts: string[]): void {
  mockAnthropicStream.mockImplementation(() => {
    return (async function* () {
      for (const p of parts) {
        yield { type: "content_block_delta", delta: { type: "text_delta", text: p } };
      }
    })();
  });
}

/**
 * Queue everything POST needs to walk the happy path:
 *   1. user_subscriptions (plan)
 *   2. feature_flags (monetization)
 *   3. (only for new sessions when monetization on) coach_sessions count
 *   4. coach_sessions insert (returns new row) OR maybeSingle for existing
 *   5. assembleCareerContext: career_profiles, career_os_cycles, career_os_stages
 *      (stages list — `then` resolution, not maybeSingle), applications count,
 *      opportunities count
 *   6. coach_sessions update (post-stream persistence)
 */
function queueHappyPathNewSession(opts: {
  plan: "free" | "starter" | "standard" | "pro";
  monetizationOn: boolean;
  recentSessionCount?: number;
}) {
  pushFromResult("user_subscriptions", { data: { plan: opts.plan, status: "active" }, error: null });
  pushFromResult("feature_flags",     { data: { enabled: opts.monetizationOn }, error: null });
  // Premium has a finite limit (5/mo) → route runs the count query.
  // Professional is unlimited → route skips the count query.
  if (opts.plan === "starter" && opts.monetizationOn) {
    pushFromResult("coach_sessions", { count: opts.recentSessionCount ?? 0, error: null }); // count
  }
  // INSERT new row
  pushFromResult("coach_sessions", {
    data:  { id: "session-1", messages: [], message_count: 0, summary: null },
    error: null,
  });
  // assembleCareerContext (Promise.all of 5)
  pushFromResult("career_profiles",  { data: { headline: "Senior PM", summary: "x", skills: ["ts"], target_skills: [] }, error: null });
  pushFromResult("career_os_cycles", { data: { current_stage: "act" }, error: null });
  pushFromResult("career_os_stages", { data: [{ stage: "evaluate", status: "completed", notes: { x: 1 } }], error: null });
  pushFromResult("applications",     { count: 0, error: null });
  pushFromResult("opportunities",    { count: 0, error: null });
  // post-stream UPDATE
  pushFromResult("coach_sessions", { data: null, error: null });
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("/api/career-os/coach-session — auth", () => {
  it("returns 401 when there is no authenticated user", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    const { POST } = await loadRoute();
    const res = await POST(makeReq({ cycle_id: "c1", message: "hi" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when cycle_id or message is missing", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1", email: "u@x.com" } }, error: null });
    const { POST } = await loadRoute();
    const res = await POST(makeReq({}));
    expect(res.status).toBe(400);
  });
});

describe("/api/career-os/coach-session — plan gates", () => {
  beforeEach(() => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1", email: "u@x.com" } }, error: null });
  });

  it("free plan returns 403 with upgrade_required", async () => {
    pushFromResult("user_subscriptions", { data: { plan: "free", status: "active" }, error: null });
    const { POST } = await loadRoute();
    const res = await POST(makeReq({ cycle_id: "c1", message: "hi" }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("upgrade_required");
    expect(mockAnthropicStream).not.toHaveBeenCalled();
  });

  it("starter at 5/month with monetization on → 429 rate_limited", async () => {
    queueHappyPathNewSession({ plan: "starter", monetizationOn: true, recentSessionCount: 5 });
    // Once limit hits, route also reads oldest for resetsAt computation:
    pushFromResult("coach_sessions", { data: { created_at: "2026-04-15T00:00:00Z" }, error: null });
    const { POST } = await loadRoute();
    const res = await POST(makeReq({ cycle_id: "c1", message: "hi" }));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body).toMatchObject({ error: "rate_limited", limit: 5, used: 5, plan: "starter" });
    expect(mockAnthropicStream).not.toHaveBeenCalled();
  });

  it("monetization OFF — no rate limit (fail open)", async () => {
    queueHappyPathNewSession({ plan: "starter", monetizationOn: false, recentSessionCount: 100 });
    stubAnthropicStreamWithText(["Hi.", " How can I help?"]);
    const { POST } = await loadRoute();
    const res = await POST(makeReq({ cycle_id: "c1", message: "hi" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const out = await drainStream(res);
    expect(out.events).toContain("session");
    expect(out.events).toContain("done");
    expect(out.chunks.join("")).toBe("Hi. How can I help?");
  });

  it("pro unlimited (no block at high session count)", async () => {
    queueHappyPathNewSession({ plan: "pro", monetizationOn: true, recentSessionCount: 100 });
    stubAnthropicStreamWithText(["Sure thing."]);
    const { POST } = await loadRoute();
    const res = await POST(makeReq({ cycle_id: "c1", message: "hi" }));
    expect(res.status).toBe(200);
    const out = await drainStream(res);
    expect(out.chunks.join("")).toBe("Sure thing.");
  });
});

describe("/api/career-os/coach-session — happy path streaming", () => {
  beforeEach(() => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1", email: "u@x.com" } }, error: null });
  });

  it("emits a 'session' event first, then text deltas, then 'done'", async () => {
    queueHappyPathNewSession({ plan: "starter", monetizationOn: false });
    stubAnthropicStreamWithText(["Hello", " there."]);
    const { POST } = await loadRoute();
    const res = await POST(makeReq({ cycle_id: "c1", message: "hi" }));
    const out = await drainStream(res);
    expect(out.events[0]).toBe("session");
    expect(out.events[out.events.length - 1]).toBe("done");
    expect(out.chunks).toEqual(["Hello", " there."]);
    expect(out.raw).toContain('"session_id":"session-1"');
  });

  it("continuation (existing session_id) does NOT count toward the limit", async () => {
    pushFromResult("user_subscriptions", { data: { plan: "starter", status: "active" }, error: null });
    pushFromResult("feature_flags",     { data: { enabled: true }, error: null });
    // No `coach_sessions` count query — continuation skips the limit gate
    pushFromResult("coach_sessions", {
      data:  { id: "existing-session", messages: [{ role: "user", content: "prior", ts: "" }], message_count: 1, summary: null },
      error: null,
    });
    pushFromResult("career_profiles",  { data: { headline: "PM", skills: [] }, error: null });
    pushFromResult("career_os_cycles", { data: { current_stage: "act" }, error: null });
    pushFromResult("career_os_stages", { data: [], error: null });
    pushFromResult("applications",     { count: 0, error: null });
    pushFromResult("opportunities",    { count: 0, error: null });
    pushFromResult("coach_sessions",   { data: null, error: null }); // post-stream UPDATE
    stubAnthropicStreamWithText(["ok"]);

    const { POST } = await loadRoute();
    const res = await POST(makeReq({ cycle_id: "c1", message: "hi", session_id: "existing-session" }));
    expect(res.status).toBe(200);
    const out = await drainStream(res);
    expect(out.raw).toContain('"session_id":"existing-session"');
    expect(out.chunks).toEqual(["ok"]);
  });
});

describe("/api/career-os/coach-session — context assembly", () => {
  beforeEach(() => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1", email: "u@x.com" } }, error: null });
  });

  it("injects career context into the system prompt sent to Anthropic", async () => {
    queueHappyPathNewSession({ plan: "pro", monetizationOn: false });
    stubAnthropicStreamWithText(["k"]);
    const { POST } = await loadRoute();
    const res = await POST(makeReq({ cycle_id: "c1", message: "hi" }));
    await drainStream(res);
    expect(mockAnthropicStream).toHaveBeenCalledTimes(1);
    const args = mockAnthropicStream.mock.calls[0][0] as { system: Array<{ text: string }> };
    expect(args.system).toBeInstanceOf(Array);
    const sysText = args.system[0].text;
    expect(sysText).toContain("Senior PM");          // career_level from headline
    expect(sysText).toContain("act");                // current_stage
    expect(sysText).toContain("evaluate");           // completed_stages list
  });

  it("uses prompt caching with cache_control: ephemeral on the system block", async () => {
    queueHappyPathNewSession({ plan: "pro", monetizationOn: false });
    stubAnthropicStreamWithText([""]);
    const { POST } = await loadRoute();
    const res = await POST(makeReq({ cycle_id: "c1", message: "hi" }));
    await drainStream(res);
    const args = mockAnthropicStream.mock.calls[0][0] as { system: Array<{ cache_control?: { type: string } }> };
    expect(args.system[0].cache_control).toEqual({ type: "ephemeral" });
  });
});

describe("/api/career-os/coach-session — GET (list sessions)", () => {
  it("returns 401 when unauthenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    const { GET } = await loadRoute();
    const res = await GET(makeReq({}, "GET"));
    expect(res.status).toBe(401);
  });

  it("returns the user's recent sessions", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1", email: "u@x.com" } }, error: null });
    pushFromResult("coach_sessions", {
      data: [
        { id: "s1", cycle_id: "c1", created_at: "2026-05-06T00:00:00Z", last_message_at: "2026-05-06T01:00:00Z", message_count: 4, summary: null },
      ],
      error: null,
    });
    const { GET } = await loadRoute();
    const res = await GET(makeReq({}, "GET"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sessions).toHaveLength(1);
    expect(body.sessions[0].id).toBe("s1");
  });
});

// ── Phase 5 Item 3 — observability / token tracking / session caps ──────────

describe("/api/career-os/coach-session — soft warning at message_count >= 40", () => {
  it("done frame includes warning: 'long_session' when newCount crosses 40", async () => {
    // Existing session at 38 messages — this turn lands at 40.
    pushFromResult("user_subscriptions", { data: { plan: "starter", status: "active" }, error: null });
    pushFromResult("feature_flags",     { data: { enabled: false }, error: null });
    pushFromResult("coach_sessions", {
      data: {
        id: "session-soft", messages: [], message_count: 38,
        summary: null, total_input_tokens: 0, total_output_tokens: 0,
      },
      error: null,
    });
    pushFromResult("career_profiles",  { data: { headline: "PM", skills: [] }, error: null });
    pushFromResult("career_os_cycles", { data: { current_stage: "coach" }, error: null });
    pushFromResult("career_os_stages", { data: [], error: null });
    pushFromResult("applications",     { count: 0, error: null });
    pushFromResult("opportunities",    { count: 0, error: null });
    pushFromResult("coach_sessions",   { data: null, error: null });

    stubAnthropicStreamWithText(["Reply"]);
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });

    const { POST } = await loadRoute();
    const res = await POST(makeReq({ cycle_id: "c1", message: "hi", session_id: "session-soft" }));
    const out = await drainStream(res);
    // Find the done frame and assert warning flag
    const doneIdx = out.events.lastIndexOf("done");
    expect(doneIdx).toBeGreaterThan(-1);
    expect(out.raw).toContain('"warning":"long_session"');
    expect(out.raw).toContain('"message_count":40');
  });

  it("done frame omits warning when newCount stays below 40", async () => {
    queueHappyPathNewSession({ plan: "pro", monetizationOn: false });
    // Override the inserted session to start at 0 (already the default),
    // newCount becomes 2 — well below 40.
    stubAnthropicStreamWithText(["ok"]);
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });

    const { POST } = await loadRoute();
    const res = await POST(makeReq({ cycle_id: "c1", message: "first" }));
    const out = await drainStream(res);
    expect(out.raw).not.toContain("long_session");
    expect(out.raw).toContain('"message_count":2');
  });
});

describe("/api/career-os/coach-session — hard cap at message_count >= 60", () => {
  it("returns 409 session_limit when continuing a session at the cap", async () => {
    pushFromResult("user_subscriptions", { data: { plan: "starter", status: "active" }, error: null });
    pushFromResult("feature_flags",     { data: { enabled: false }, error: null });
    pushFromResult("coach_sessions", {
      data: {
        id: "session-capped", messages: [], message_count: 60,
        summary: null, total_input_tokens: 0, total_output_tokens: 0,
      },
      error: null,
    });
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });

    const { POST } = await loadRoute();
    const res = await POST(makeReq({ cycle_id: "c1", message: "more please", session_id: "session-capped" }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body).toMatchObject({
      error: "session_limit",
      cap:   60,
      message_count: 60,
    });
    // No Anthropic stream call made.
    expect(mockAnthropicStream).not.toHaveBeenCalled();
  });

  it("hits the cap exactly at 60 (>=, not >)", async () => {
    pushFromResult("user_subscriptions", { data: { plan: "starter", status: "active" }, error: null });
    pushFromResult("feature_flags",     { data: { enabled: false }, error: null });
    pushFromResult("coach_sessions", {
      data: {
        id: "session-edge", messages: [], message_count: 59,
        summary: null, total_input_tokens: 0, total_output_tokens: 0,
      },
      error: null,
    });
    pushFromResult("career_profiles",  { data: { headline: "PM", skills: [] }, error: null });
    pushFromResult("career_os_cycles", { data: { current_stage: "coach" }, error: null });
    pushFromResult("career_os_stages", { data: [], error: null });
    pushFromResult("applications",     { count: 0, error: null });
    pushFromResult("opportunities",    { count: 0, error: null });
    pushFromResult("coach_sessions",   { data: null, error: null });
    stubAnthropicStreamWithText(["x"]);
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });

    const { POST } = await loadRoute();
    // 59 messages → +2 (user+assistant) = 61, but cap is checked BEFORE the
    // turn runs. 59 < 60, so this turn proceeds and persists newCount=61.
    const res = await POST(makeReq({ cycle_id: "c1", message: "hello", session_id: "session-edge" }));
    const out = await drainStream(res);
    expect(out.events).toContain("done");
    // The NEXT call would be blocked because count is now 61 >= 60.
    expect(out.raw).toContain('"warning":"long_session"'); // 61 > 40
  });

  it("does NOT consume a new-session credit for rate limiting (uses existing session)", async () => {
    // The check happens AFTER the row is loaded; rate-limit gate is upstream
    // and is ONLY invoked for sessionId === null. Continuing an existing
    // session never runs countRecentSessions.
    pushFromResult("user_subscriptions", { data: { plan: "starter", status: "active" }, error: null });
    pushFromResult("feature_flags",     { data: { enabled: true }, error: null });
    pushFromResult("coach_sessions", {
      data: {
        id: "session-ratelimit-edge", messages: [], message_count: 60,
        summary: null, total_input_tokens: 0, total_output_tokens: 0,
      },
      error: null,
    });
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });

    const { POST } = await loadRoute();
    const res = await POST(makeReq({ cycle_id: "c1", message: "hi", session_id: "session-ratelimit-edge" }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("session_limit");
    // NOT 429
    expect(body.error).not.toBe("rate_limited");
  });
});

describe("/api/career-os/coach-session — token usage tracking", () => {
  it("aggregates input/output tokens onto the session row in the post-stream UPDATE", async () => {
    pushFromResult("user_subscriptions", { data: { plan: "pro", status: "active" }, error: null });
    pushFromResult("feature_flags",     { data: { enabled: false }, error: null });
    pushFromResult("coach_sessions", {
      data: {
        id: "session-tok", messages: [], message_count: 0,
        summary: null, total_input_tokens: 100, total_output_tokens: 50,
      },
      error: null,
    });
    pushFromResult("career_profiles",  { data: { headline: "PM", skills: [] }, error: null });
    pushFromResult("career_os_cycles", { data: { current_stage: "coach" }, error: null });
    pushFromResult("career_os_stages", { data: [], error: null });
    pushFromResult("applications",     { count: 0, error: null });
    pushFromResult("opportunities",    { count: 0, error: null });

    // Capture the update payload via a special queued shape that simply
    // resolves; we'll assert via the recorded mock chain calls instead.
    pushFromResult("coach_sessions",   { data: null, error: null });

    // Anthropic stream emits a message_start with usage, then text, then a
    // message_delta with cumulative output_tokens.
    mockAnthropicStream.mockImplementation(() => (async function* () {
      yield { type: "message_start", message: { usage: { input_tokens: 23, output_tokens: 0 } } };
      yield { type: "content_block_delta", delta: { type: "text_delta", text: "Hi" } };
      yield { type: "message_delta", usage: { input_tokens: 23, output_tokens: 7 } };
    })());

    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });

    const { POST } = await loadRoute();
    const res = await POST(makeReq({ cycle_id: "c1", message: "yo", session_id: "session-tok" }));
    const out = await drainStream(res);
    expect(out.events).toContain("done");

    // Find the most-recent .update() call on coach_sessions.
    const calls = mockFrom.mock.calls.filter(([t]) => t === "coach_sessions");
    expect(calls.length).toBeGreaterThan(0);
    // The chain object held by the route stores its update payload via the
    // .update() spy we configured in makeChain. Walk results to find one with
    // total_input_tokens incremented to 100 + 23 = 123 and output 50 + 7 = 57.
    // (Mock is structural so we just assert the SQL-ready shape was sent.)
    const updateSpies = mockFrom.mock.results
      .map(r => (r.value as Record<string, unknown>)?.update)
      .filter(Boolean) as unknown as Array<ReturnType<typeof vi.fn>>;
    const allUpdates = updateSpies.flatMap(s => s.mock.calls.map(c => c[0])).filter(Boolean);
    const matching = allUpdates.find((p: Record<string, unknown>) =>
      p && typeof p === "object" &&
      p.total_input_tokens === 123 && p.total_output_tokens === 57,
    );
    expect(matching).toBeTruthy();
    expect((matching as Record<string, unknown>).message_count).toBe(2);
  });

  it("falls back gracefully when the stream emits no usage events", async () => {
    queueHappyPathNewSession({ plan: "pro", monetizationOn: false });
    // No usage events at all
    stubAnthropicStreamWithText(["Reply"]);
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const { POST } = await loadRoute();
    const res = await POST(makeReq({ cycle_id: "c1", message: "hi" }));
    const out = await drainStream(res);
    expect(out.events).toContain("done");
    // Token columns should still update — to 0 input + 0 output (no double-count).
    const updateSpies = mockFrom.mock.results
      .map(r => (r.value as Record<string, unknown>)?.update)
      .filter(Boolean) as unknown as Array<ReturnType<typeof vi.fn>>;
    const allUpdates = updateSpies.flatMap(s => s.mock.calls.map(c => c[0])).filter(Boolean);
    const matching = allUpdates.find((p: Record<string, unknown>) =>
      p && typeof p === "object" &&
      "total_input_tokens" in p && "total_output_tokens" in p,
    );
    expect(matching).toBeTruthy();
  });
});
