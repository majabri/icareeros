import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * DELETE /api/admin/hire-users/[id] — permanent employer delete (admin-only)
 *
 * Tests cover:
 *   1. Admin gate: non-super_admin → 403
 *   2. Rejects non-employer target (wrong-tab safety)
 *   3. Happy-path issues auth.admin.deleteUser and audit-logs
 */

const { requirePermissionSpy, permissionErrorResponseSpy, logSpy } = vi.hoisted(() => ({
  requirePermissionSpy: vi.fn().mockResolvedValue({
    ok: true,
    ctx: { user_id: "caller-uuid", email: "caller@icareeros.com", admin_role: "super_admin" },
  }),
  permissionErrorResponseSpy: vi.fn((r: { status: number; error: string }) =>
    new Response(JSON.stringify({ error: r.error }), { status: r.status }),
  ),
  logSpy: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/admin/permissions.server", () => ({
  requirePermission:       requirePermissionSpy,
  permissionErrorResponse: permissionErrorResponseSpy,
}));
vi.mock("@/lib/admin/audit", () => ({ logAdminAction: logSpy }));

const state = vi.hoisted(() => ({
  targetRole:  "employer" as string | null,
  beforeRow:   { email: "del@co.com", full_name: "Del" } as Record<string, unknown> | null,
  deleteError: null as { message: string } | null,
  deleteCalls: [] as string[],
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (_table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({
            data: _table === "user_roles"
              ? (state.targetRole ? { role: state.targetRole } : null)
              : state.beforeRow,
            error: null,
          }),
        }),
      }),
    }),
    auth: {
      admin: {
        deleteUser: (id: string) => {
          state.deleteCalls.push(id);
          return Promise.resolve({ data: null, error: state.deleteError });
        },
      },
    },
  }),
}));

import { DELETE } from "../route";

beforeEach(() => {
  state.targetRole  = "employer";
  state.beforeRow   = { email: "del@co.com", full_name: "Del" };
  state.deleteError = null;
  state.deleteCalls = [];
  requirePermissionSpy.mockResolvedValue({
    ok: true,
    ctx: { user_id: "caller-uuid", email: "caller@icareeros.com", admin_role: "super_admin" },
  });
  logSpy.mockClear();
});

const req  = new Request("http://localhost/api/admin/hire-users/emp-1", { method: "DELETE" });
const ctx  = { params: Promise.resolve({ id: "emp-1" }) };

describe("DELETE /api/admin/hire-users/[id]", () => {
  it("403s for non-admins", async () => {
    requirePermissionSpy.mockResolvedValueOnce({ ok: false, status: 403, error: "Forbidden" });
    const res = await DELETE(req, ctx);
    expect(res.status).toBe(403);
    expect(state.deleteCalls).toHaveLength(0);
  });

  it("400s when the target is not an employer (wrong-tab safety)", async () => {
    state.targetRole = "job_seeker";
    const res = await DELETE(req, ctx);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/not an employer/i);
    expect(state.deleteCalls).toHaveLength(0);
  });

  it("deletes the auth.users row and audit-logs on success", async () => {
    const res = await DELETE(req, ctx);
    expect(res.status).toBe(200);
    expect(state.deleteCalls).toEqual(["emp-1"]);
    expect(logSpy).toHaveBeenCalledWith(expect.objectContaining({
      action: "users.deleted",
      target_id: "emp-1",
      target_table: "auth.users",
    }));
  });
});
