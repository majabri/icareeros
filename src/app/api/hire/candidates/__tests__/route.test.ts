/**
 * POST /api/hire/candidates — auth + role gate tests.
 *
 * Phase 2 recruiter discoverability (2026-05-17). The route must:
 *   1) reject unauthenticated requests with 401
 *   2) reject authenticated NON-employer accounts with 403
 *   3) allow authenticated employer accounts through (200, even when no
 *      candidates match — empty list is the success case)
 *
 * We mock @supabase/ssr's createServerClient so each test can stub the
 * auth and user_roles responses without hitting a real database.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────
const getUserMock  = vi.fn();
const fromMock     = vi.fn();

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    getAll: () => [],
    set:    vi.fn(),
  })),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser: getUserMock },
    from: fromMock,
  })),
}));

import { POST } from "../route";

function makeRequest(body: Record<string, unknown> = {}): Request {
  return new Request("http://localhost/api/hire/candidates", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });
}

// Helper — build a chained query stub that returns `data` at the end.
function stubQuery(data: unknown, count = 0) {
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq:     vi.fn().mockReturnThis(),
    overlaps: vi.fn().mockReturnThis(),
    ilike:  vi.fn().mockReturnThis(),
    contains: vi.fn().mockReturnThis(),
    in:     vi.fn().mockReturnThis(),
    range:  vi.fn().mockReturnThis(),
    order:  vi.fn().mockResolvedValue({ data, error: null, count }),
  };
  return builder;
}

beforeEach(() => {
  getUserMock.mockReset();
  fromMock.mockReset();
});

describe("POST /api/hire/candidates", () => {
  it("returns 401 for unauthenticated requests", async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null }, error: null });
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("Unauthorized");
  });

  it("returns 403 when the user is authenticated but lacks the 'employer' role", async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: "u-1" } }, error: null });
    fromMock.mockImplementationOnce((table: string) => {
      expect(table).toBe("user_roles");
      return {
        select: vi.fn().mockReturnThis(),
        eq:     vi.fn().mockResolvedValue({ data: [{ role: "job_seeker" }], error: null }),
      };
    });
    const res = await POST(makeRequest());
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toMatch(/employer/i);
  });

  it("returns 200 + empty list for an employer with no matching candidates", async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: "emp-1" } }, error: null });

    // Phase 3 (2026-05-17) flow:
    //   from() #1 — user_roles            → role = employer
    //   from() #2 — employer_profiles     → company_name = "Acme"
    //   from() #3 — career_profiles       → search returns []
    let call = 0;
    fromMock.mockImplementation((table: string) => {
      call += 1;
      if (call === 1) {
        expect(table).toBe("user_roles");
        return {
          select: vi.fn().mockReturnThis(),
          eq:     vi.fn().mockResolvedValue({ data: [{ role: "employer" }], error: null }),
        };
      }
      if (call === 2) {
        expect(table).toBe("employer_profiles");
        return {
          select:      vi.fn().mockReturnThis(),
          eq:          vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data:  { company_name: "Acme" },
            error: null,
          }),
        };
      }
      expect(table).toBe("career_profiles");
      return stubQuery([], 0);
    });

    const res = await POST(makeRequest({ skills: ["React"] }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.candidates).toEqual([]);
    expect(json.total).toBe(0);
    expect(json.page).toBe(1);
    expect(json.pageSize).toBe(20);
  });

  it("propagates 500 when the role lookup fails", async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: "u-1" } }, error: null });
    fromMock.mockImplementationOnce(() => ({
      select: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } }),
    }));
    const res = await POST(makeRequest());
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("boom");
  });

  it("clamps pageSize to MAX_PAGE_SIZE (50)", async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: "emp-1" } }, error: null });
    let call = 0;
    fromMock.mockImplementation((table: string) => {
      call += 1;
      if (call === 1) {
        return {
          select: vi.fn().mockReturnThis(),
          eq:     vi.fn().mockResolvedValue({ data: [{ role: "employer" }], error: null }),
        };
      }
      if (call === 2) {
        return {
          select:      vi.fn().mockReturnThis(),
          eq:          vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data:  { company_name: "Acme" },
            error: null,
          }),
        };
      }
      expect(table).toBe("career_profiles");
      return stubQuery([], 0);
    });
    const res = await POST(makeRequest({ pageSize: 9999 }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.pageSize).toBe(50);
  });
});
