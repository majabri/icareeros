import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.hoisted — keeps mock factories aligned with import-time hoisting.
const { mocks } = vi.hoisted(() => {
  const supabase = {
    auth: { getUser: vi.fn() },
    from: vi.fn(),
  };
  return { mocks: { supabase } };
});

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ getAll: () => [], set: () => {} })),
}));

vi.mock("@/lib/supabase-cookie-options", () => ({
  withCrossSubdomainCookie: (o: unknown) => o,
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => mocks.supabase),
}));

// Helpers to build a Supabase-style query chain.
function chain(returnValue: unknown) {
  const c: Record<string, unknown> = {};
  for (const m of ["select", "eq", "gte", "order", "single", "maybeSingle"]) {
    c[m] = vi.fn().mockReturnValue(c);
  }
  // Make the chain awaitable — terminal methods resolve.
  c.then = (resolve: (v: unknown) => unknown) => resolve(returnValue);
  return c as Record<string, ReturnType<typeof vi.fn>> & PromiseLike<unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

import { POST, PATCH, GET } from "@/app/api/hire/job-postings/route";

describe("POST /api/hire/job-postings", () => {
  it("401 when unauthenticated", async () => {
    mocks.supabase.auth.getUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(new Request("http://x/api/hire/job-postings", {
      method: "POST", body: JSON.stringify({}),
    }));
    expect(res.status).toBe(401);
  });

  it("400 when title missing", async () => {
    mocks.supabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    // Rate-limit count = 0 (under limit).
    mocks.supabase.from.mockReturnValueOnce(chain({ count: 0, error: null }));
    const res = await POST(new Request("http://x/api/hire/job-postings", {
      method: "POST", body: JSON.stringify({ company: "Acme", description: "good role" }),
    }));
    expect(res.status).toBe(400);
  });

  it("429 with Retry-After: 86400 when over 100/day limit", async () => {
    mocks.supabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    // Rate-limit count = 100 — equals the cap, blocks the 101st.
    mocks.supabase.from.mockReturnValueOnce(chain({ count: 100, error: null }));
    const res = await POST(new Request("http://x/api/hire/job-postings", {
      method: "POST",
      body: JSON.stringify({ title: "x", company: "y", description: "z".repeat(20) }),
    }));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("86400");
  });
});

describe("PATCH /api/hire/job-postings", () => {
  it("401 when unauthenticated", async () => {
    mocks.supabase.auth.getUser.mockResolvedValue({ data: { user: null } });
    const res = await PATCH(new Request("http://x/api/hire/job-postings", {
      method: "PATCH", body: JSON.stringify({ id: "1" }),
    }));
    expect(res.status).toBe(401);
  });

  it("400 when id missing", async () => {
    mocks.supabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const res = await PATCH(new Request("http://x/api/hire/job-postings", {
      method: "PATCH", body: JSON.stringify({ status: "open" }),
    }));
    expect(res.status).toBe(400);
  });

  it("400 when status is not in {draft,open,closed,filled}", async () => {
    mocks.supabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const res = await PATCH(new Request("http://x/api/hire/job-postings", {
      method: "PATCH",
      body: JSON.stringify({ id: "abc", status: "bogus" }),
    }));
    expect(res.status).toBe(400);
  });
});

describe("GET /api/hire/job-postings", () => {
  it("401 when unauthenticated", async () => {
    mocks.supabase.auth.getUser.mockResolvedValue({ data: { user: null } });
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns the employer's own postings on success", async () => {
    mocks.supabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mocks.supabase.from.mockReturnValueOnce(chain({
      data: [{ id: "p1", title: "Eng", company: "Co", status: "open", published_at: null, created_at: "", updated_at: "", is_remote: true, location: null }],
      error: null,
    }));
    const res = await GET();
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(Array.isArray(j.postings)).toBe(true);
    expect(j.postings).toHaveLength(1);
    expect(j.postings[0].id).toBe("p1");
  });
});
