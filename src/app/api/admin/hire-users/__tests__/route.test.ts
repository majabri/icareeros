import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * GET /api/admin/hire-users — list employers (admin-only)
 *
 * Tests cover:
 *   1. Admin gate: non-admin → 403
 *   2. Happy path returns only user_roles.role='employer' rows, joined
 *      with employer_profiles + profiles + auth.users
 */

const { requirePermissionSpy, permissionErrorResponseSpy } = vi.hoisted(() => ({
  requirePermissionSpy: vi.fn().mockResolvedValue({
    ok: true,
    ctx: { user_id: "caller-uuid", email: "caller@icareeros.com", admin_role: "super_admin" },
  }),
  permissionErrorResponseSpy: vi.fn((r: { status: number; error: string }) =>
    new Response(JSON.stringify({ error: r.error }), { status: r.status }),
  ),
}));

vi.mock("@/lib/admin/permissions.server", () => ({
  requirePermission:       requirePermissionSpy,
  permissionErrorResponse: permissionErrorResponseSpy,
}));

const state = vi.hoisted(() => ({
  employerIds: [] as string[],
  profiles:    [] as Array<Record<string, unknown>>,
  employers:   [] as Array<Record<string, unknown>>,
  subs:        [] as Array<Record<string, unknown>>,
  authUsers:   [] as Array<{ id: string; email_confirmed_at: string | null }>,
}));

vi.mock("@supabase/supabase-js", () => {
  function makeQuery(rows: Array<Record<string, unknown>>) {
    const obj: Record<string, unknown> = {};
    obj.select = () => obj;
    obj.eq     = () => Promise.resolve({ data: rows, error: null });
    obj.in     = () => Promise.resolve({ data: rows, error: null });
    return obj;
  }
  return {
    createClient: () => ({
      from: (table: string) => {
        if (table === "user_roles")        return makeQuery(state.employerIds.map(id => ({ user_id: id })));
        if (table === "profiles")          return makeQuery(state.profiles);
        if (table === "employer_profiles") return makeQuery(state.employers);
        if (table === "user_subscriptions") return makeQuery(state.subs);
        return makeQuery([]);
      },
      auth: {
        admin: {
          listUsers: () => Promise.resolve({ data: { users: state.authUsers }, error: null }),
        },
      },
    }),
  };
});

import { GET } from "../route";

beforeEach(() => {
  state.employerIds = [];
  state.profiles    = [];
  state.employers   = [];
  state.subs        = [];
  state.authUsers   = [];
  requirePermissionSpy.mockResolvedValue({
    ok: true,
    ctx: { user_id: "caller-uuid", email: "caller@icareeros.com", admin_role: "super_admin" },
  });
});

describe("GET /api/admin/hire-users", () => {
  it("403s for non-admins", async () => {
    requirePermissionSpy.mockResolvedValueOnce({ ok: false, status: 403, error: "Forbidden" });
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns only employer-role users, joined with employer_profiles", async () => {
    state.employerIds = ["emp-1", "emp-2"];
    state.profiles = [
      { user_id: "emp-1", email: "a@co.com",    full_name: "Alice",   created_at: "2026-05-10T00:00:00Z" },
      { user_id: "emp-2", email: "b@co2.com",   full_name: "Bob",     created_at: "2026-05-18T00:00:00Z" },
    ];
    state.employers = [
      { user_id: "emp-1", company_name: "Acme Inc." },
      // emp-2 has no employer_profile row yet — company should fall back to null
    ];
    state.subs = [
      { user_id: "emp-1", plan: "growth", status: "active" },
    ];
    state.authUsers = [
      { id: "emp-1", email_confirmed_at: "2026-05-10T00:00:00Z" },
      { id: "emp-2", email_confirmed_at: null },
      // a job_seeker should not appear here — but even if listUsers
      // returns extras, the route filters by employer ids first.
      { id: "seeker-x", email_confirmed_at: "2026-04-01T00:00:00Z" },
    ];

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json() as { users: Array<Record<string, unknown>> };
    expect(body.users).toHaveLength(2);

    // Newest-first sort: emp-2 (May 18) precedes emp-1 (May 10)
    expect(body.users[0]).toMatchObject({
      user_id: "emp-2", company_name: null, plan: "free", email_confirmed: false,
    });
    expect(body.users[1]).toMatchObject({
      user_id: "emp-1", company_name: "Acme Inc.", plan: "growth", email_confirmed: true,
    });
  });
});
