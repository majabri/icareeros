/**
 * POST /api/hire/invite — Phase 3 outreach API tests.
 *
 * Covers:
 *   1) 403 when the user lacks the employer role
 *   2) successful insert returns { inviteId, status: "sent" }
 *   3) 409 when a pending invite already exists for the pair
 *   4) 401 unauthenticated (defence-in-depth)
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

const CANDIDATE_UUID = "11111111-2222-3333-4444-555555555555";

function makeRequest(body: Record<string, unknown> = {}): Request {
  return new Request("http://localhost/api/hire/invite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });
}

beforeEach(() => {
  getUserMock.mockReset();
  fromMock.mockReset();
});

describe("POST /api/hire/invite", () => {
  it("returns 401 when unauthenticated", async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null }, error: null });
    const res = await POST(makeRequest({
      candidateUserId: CANDIDATE_UUID,
      jobTitle:        "Senior PM",
    }));
    expect(res.status).toBe(401);
  });

  it("returns 403 when the authenticated user is not an employer", async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: "u-1" } }, error: null });
    fromMock.mockImplementationOnce((table: string) => {
      expect(table).toBe("user_roles");
      return {
        select: vi.fn().mockReturnThis(),
        eq:     vi.fn().mockResolvedValue({ data: [{ role: "job_seeker" }], error: null }),
      };
    });
    const res = await POST(makeRequest({
      candidateUserId: CANDIDATE_UUID,
      jobTitle:        "Senior PM",
    }));
    expect(res.status).toBe(403);
  });

  it("inserts the invite and returns { inviteId, status: 'sent' } on success", async () => {
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
      if (call === 2) {
        // dedup lookup — no prior invite
        expect(table).toBe("recruiter_invites");
        return {
          select:      vi.fn().mockReturnThis(),
          eq:          vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }
      // insert
      expect(table).toBe("recruiter_invites");
      return {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data:  { id: "invite-abc" },
          error: null,
        }),
      };
    });

    const res = await POST(makeRequest({
      candidateUserId: CANDIDATE_UUID,
      jobTitle:        "Senior PM",
      message:         "Loved your profile",
    }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json).toEqual({ inviteId: "invite-abc", status: "sent" });
  });

  it("returns 409 when a pending invite already exists for the recruiter+candidate pair", async () => {
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
      expect(table).toBe("recruiter_invites");
      return {
        select:      vi.fn().mockReturnThis(),
        eq:          vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data:  { id: "existing-invite" },
          error: null,
        }),
      };
    });

    const res = await POST(makeRequest({
      candidateUserId: CANDIDATE_UUID,
      jobTitle:        "Senior PM",
    }));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.existingInviteId).toBe("existing-invite");
    expect(json.error).toMatch(/already sent/i);
  });

  it("validates jobTitle (400 when missing/empty)", async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: "emp-1" } }, error: null });
    fromMock.mockImplementationOnce(() => ({
      select: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockResolvedValue({ data: [{ role: "employer" }], error: null }),
    }));
    const res = await POST(makeRequest({
      candidateUserId: CANDIDATE_UUID,
      jobTitle:        "   ",
    }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/jobTitle/i);
  });
});
