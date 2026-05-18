import { describe, it, expect, vi, beforeEach } from "vitest";

/** GET /api/admin/admin-users — admin gate + filter. */

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
  authUsers: [] as Array<{ id: string; email_confirmed_at: string | null }>,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        or: () => Promise.resolve({ data: state.profiles, error: null }),
      }),
    }),
    auth: {
      admin: {
        listUsers: () => Promise.resolve({ data: { users: state.authUsers }, error: null }),
      },
    },
  }),
}));

import { GET } from "../route";

beforeEach(() => {
  state.profiles  = [];
  state.authUsers = [];
  requirePermissionSpy.mockResolvedValue({
    ok: true,
    ctx: { user_id: "caller", email: "c@x.com", admin_role: "super_admin" },
  });
});

describe("GET /api/admin/admin-users", () => {
  it("403s for non-admin caller", async () => {
    requirePermissionSpy.mockResolvedValueOnce({ ok: false, status: 403, error: "Forbidden" });
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns admin-privileged users with effective admin_role resolved", async () => {
    state.profiles = [
      { user_id: "a1", email: "sa@co.com",  full_name: "Super",  admin_role: "super_admin", role: "user",  created_at: "2026-05-18T00:00:00Z" },
      { user_id: "a2", email: "leg@co.com", full_name: "Legacy", admin_role: null,          role: "admin", created_at: "2026-05-10T00:00:00Z" },
    ];
    state.authUsers = [
      { id: "a1", email_confirmed_at: "2026-05-18T00:00:00Z" },
      { id: "a2", email_confirmed_at: null },
    ];

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json() as { users: Array<Record<string, unknown>> };
    expect(body.users).toHaveLength(2);

    expect(body.users[0]).toMatchObject({
      user_id: "a1", admin_role: "super_admin", email_confirmed: true,
    });
    expect(body.users[1]).toMatchObject({
      user_id: "a2", admin_role: "admin", email_confirmed: false,
    });
  });
});
