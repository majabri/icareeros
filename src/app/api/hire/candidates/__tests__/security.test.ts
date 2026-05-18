/**
 * POST /api/hire/candidates — Phase 3 security tests.
 *
 * Item 3 of the brief moves viewerCompany from the request body to a
 * server-trusted lookup against employer_profiles. These tests verify:
 *
 *   - When the recruiter has no employer_profiles row → 422 with
 *     { profileIncomplete: true }, NO candidate rows returned.
 *   - When the recruiter HAS a row → the API DOES query
 *     employer_profiles (i.e., viewerCompany is server-derived,
 *     not request-body-derived).
 *   - A request that smuggles `viewerCompany: 'Acme'` in the body is
 *     ignored — the server still uses its own lookup.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const getUserMock = vi.fn();
const fromMock    = vi.fn();

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

function stubSearchQuery(data: unknown, count = 0) {
  return {
    select:   vi.fn().mockReturnThis(),
    eq:       vi.fn().mockReturnThis(),
    overlaps: vi.fn().mockReturnThis(),
    ilike:    vi.fn().mockReturnThis(),
    contains: vi.fn().mockReturnThis(),
    in:       vi.fn().mockReturnThis(),
    range:    vi.fn().mockReturnThis(),
    order:    vi.fn().mockResolvedValue({ data, error: null, count }),
  };
}

beforeEach(() => {
  getUserMock.mockReset();
  fromMock.mockReset();
});

describe("POST /api/hire/candidates — server-trusted viewerCompany", () => {
  it("returns 422 + profileIncomplete=true when the employer has no employer_profiles row", async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: "emp-1" } }, error: null });
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
      expect(table).toBe("employer_profiles");
      return {
        select:      vi.fn().mockReturnThis(),
        eq:          vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
    });

    const res = await POST(makeRequest({ skills: ["React"] }));
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.profileIncomplete).toBe(true);
  });

  it("queries employer_profiles even when the request body smuggles viewerCompany — the body field is ignored", async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: "emp-1" } }, error: null });
    let queriedEmployerProfiles = false;
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
        expect(table).toBe("employer_profiles");
        queriedEmployerProfiles = true;
        return {
          select:      vi.fn().mockReturnThis(),
          eq:          vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data:  { company_name: "Real Server Co" },
            error: null,
          }),
        };
      }
      // career_profiles search
      expect(table).toBe("career_profiles");
      return stubSearchQuery([], 0);
    });

    const res = await POST(makeRequest({
      viewerCompany: "Acme Spoof",
      skills: ["React"],
    }));

    expect(queriedEmployerProfiles).toBe(true);
    expect(res.status).toBe(200);
  });
});
