import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * GET /api/admin/all-users — admin gate + role-badge derivation.
 */

const { requirePermissionSpy, permissionErrorResponseSpy } = vi.hoisted(() => ({
  requirePermissionSpy: vi.fn().mockResolvedValue({
    ok: true,
    ctx: { user_id: "caller", email: "c@x.com", admin_role: "super_admin" },
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
  profiles:  [] as Array<Record<string, unknown>>,
  userRoles: [] as Array<{ user_id: string; role: string }>,
  subs:      [] as Array<{ user_id: string; plan: string; status?: string }>,
  authUsers: [] as Array<{ id: string; email_confirmed_at: string | null }>,
}));

vi.mock("@supabase/supabase-js", () => {
  function makeQuery(rows: Array<Record<string, unknown>>) {
    const p = Promise.resolve({ data: rows, error: null });
    // The route awaits either `.select(...)` directly (user_roles, subs)
    // or `.select(...).order(...)` (profiles). Make the chain object
    // itself thenable so awaiting the bare select() works.
    const o: Record<string, unknown> = {
      select: () => o,
      order:  () => p,
      eq:     () => p,
      in:     () => p,
      then:   (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
                p.then(resolve, reject),
    };
    return o;
  }
  return {
    createClient: () => ({
      from: (table: string) => {
        if (table === "profiles")           return makeQuery(state.profiles);
        if (table === "user_roles")         return makeQuery(state.userRoles);
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
  state.profiles  = [];
  state.userRoles = [];
  state.subs      = [];
  state.authUsers = [];
  requirePermissionSpy.mockResolvedValue({
    ok: true,
    ctx: { user_id: "caller", email: "c@x.com", admin_role: "super_admin" },
  });
});

describe("GET /api/admin/all-users", () => {
  it("403s for non-admin caller", async () => {
    requirePermissionSpy.mockResolvedValueOnce({ ok: false, status: 403, error: "Forbidden" });
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("derives the right role badge + plan per user", async () => {
    state.profiles = [
      // Admin via admin_role (super_admin)
      { user_id: "u-admin",  email: "a@co.com", role: "user", admin_role: "super_admin", created_at: "2026-05-18T00:00:00Z" },
      // Admin via legacy role
      { user_id: "u-legacy", email: "l@co.com", role: "admin", admin_role: null,         created_at: "2026-05-17T00:00:00Z" },
      // Employer
      { user_id: "u-emp",    email: "e@co.com", role: "user", admin_role: null,          created_at: "2026-05-16T00:00:00Z" },
      // Job seeker (no employer in user_roles → defaults to Jobs User)
      { user_id: "u-job",    email: "j@co.com", role: "user", admin_role: null,          created_at: "2026-05-15T00:00:00Z" },
    ];
    state.userRoles = [
      { user_id: "u-emp", role: "employer" },
      { user_id: "u-job", role: "job_seeker" },
    ];
    state.subs = [
      { user_id: "u-emp", plan: "growth", status: "active" },
      { user_id: "u-job", plan: "pro",    status: "active" },
    ];
    state.authUsers = [
      { id: "u-admin",  email_confirmed_at: "2026-05-18T00:00:00Z" },
      { id: "u-legacy", email_confirmed_at: "2026-05-17T00:00:00Z" },
      { id: "u-emp",    email_confirmed_at: null },
      { id: "u-job",    email_confirmed_at: "2026-05-15T00:00:00Z" },
    ];

    const res  = await GET();
    expect(res.status).toBe(200);
    const body = await res.json() as { users: Array<Record<string, unknown>> };
    expect(body.users).toHaveLength(4);

    const byId = Object.fromEntries(body.users.map(u => [u.user_id, u]));
    expect(byId["u-admin"]).toMatchObject({ role_badge: "Admin",     plan: "—" });
    expect(byId["u-legacy"]).toMatchObject({ role_badge: "Admin",    plan: "—" });
    expect(byId["u-emp"]).toMatchObject({   role_badge: "Hire User", plan: "growth", email_confirmed: false });
    expect(byId["u-job"]).toMatchObject({   role_badge: "Jobs User", plan: "pro",    email_confirmed: true });
  });
});
