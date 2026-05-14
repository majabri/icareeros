import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Sprint 4 W3-G — PATCH /api/admin/roles
 *
 * Focused on the four safety rules:
 *  1. Permission gate (only super_admin reaches the body)
 *  2. Self-demotion is blocked
 *  3. Last super_admin can't be demoted
 *  4. Invalid role string returns 400
 *
 * The audit log + Supabase clients are stubbed so the tests stay pure.
 */

// ── Stub requirePermission ────────────────────────────────────────────────
// Default: caller is super_admin. Individual tests override.
// vi.hoisted() is required because vi.mock() factories are hoisted above
// the rest of the file — without hoisting these spies the factory can't
// see them at evaluation time.
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
  requirePermission:        requirePermissionSpy,
  permissionErrorResponse:  permissionErrorResponseSpy,
}));

vi.mock("@/lib/admin/audit", () => ({ logAdminAction: logSpy }));

// ── Stub Supabase service client ──────────────────────────────────────────
// Test setup sets `state.targetRow` + `state.superAdminCount` per test.
// Hoisted so the mock factory's closure can see it at hoist time.
const state = vi.hoisted(() => ({
  targetRow: null as Record<string, unknown> | null,
  superAdminCount: 2,
  updateOutcome: {
    data: null as Record<string, unknown> | null,
    error: null as { message: string } | null,
  },
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (_table: string) => ({
      select: (_cols: string, opts?: { count?: string; head?: boolean }) => {
        // Branch 1: counting super_admins (uses head:true)
        if (opts?.head) {
          return {
            eq: () => Promise.resolve({ count: state.superAdminCount, error: null }),
          };
        }
        // Branch 2: looking up the target row
        return {
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: state.targetRow, error: null }),
          }),
        };
      },
      update: () => ({
        eq: () => ({
          select: () => ({
            single: () => Promise.resolve(state.updateOutcome.data
              ? { data: state.updateOutcome.data,  error: null }
              : { data: null,                      error: state.updateOutcome.error ?? { message: "no-update-data" } },
            ),
          }),
        }),
      }),
    }),
  }),
}));

// Now import the route under test
import { PATCH } from "../route";

function makeReq(body: unknown): Request {
  return new Request("http://localhost/api/admin/roles", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL  = "http://localhost";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
  requirePermissionSpy.mockResolvedValue({
    ok: true,
    ctx: { user_id: "caller-uuid", email: "caller@icareeros.com", admin_role: "super_admin" },
  });
  state.targetRow = {
    user_id:    "target-uuid",
    email:      "target@icareeros.com",
    role:       "admin",
    admin_role: "admin",
  };
  state.superAdminCount = 2;
  state.updateOutcome.data  = {
    user_id: "target-uuid",
    email:   "target@icareeros.com",
    role:    "admin",
    admin_role: "support_l2",
  };
  state.updateOutcome.error = null;
});

describe("PATCH /api/admin/roles — safety rules", () => {

  it("returns the permission gate's response when caller lacks roles.assign", async () => {
    requirePermissionSpy.mockResolvedValueOnce({ ok: false, status: 403, error: "forbidden" });
    const res = await PATCH(makeReq({ user_id: "x", admin_role: "viewer" }) as never);
    expect(res.status).toBe(403);
  });

  it("rejects empty body with 400", async () => {
    const res = await PATCH(makeReq({}) as never);
    expect(res.status).toBe(400);
  });

  it("rejects an invalid role string with 400", async () => {
    const res = await PATCH(makeReq({ user_id: "target-uuid", admin_role: "god_mode" }) as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Invalid admin_role/i);
  });

  it("blocks self-demotion (caller targets their own user_id)", async () => {
    const res = await PATCH(makeReq({ user_id: "caller-uuid", admin_role: "support_l1" }) as never);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/your own admin_role/i);
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("blocks demoting the last super_admin (count==1)", async () => {
    state.targetRow = {
      user_id:    "target-uuid",
      email:      "lone@icareeros.com",
      role:       null,
      admin_role: "super_admin",
    };
    state.superAdminCount = 1;
    const res = await PATCH(makeReq({ user_id: "target-uuid", admin_role: "admin" }) as never);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/last super_admin/i);
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("allows demoting one of multiple super_admins (count==2)", async () => {
    state.targetRow = {
      user_id:    "target-uuid",
      email:      "second@icareeros.com",
      role:       null,
      admin_role: "super_admin",
    };
    state.superAdminCount = 2;
    state.updateOutcome.data = {
      user_id: "target-uuid", email: "second@icareeros.com",
      role: null, admin_role: "admin",
    };
    const res = await PATCH(makeReq({ user_id: "target-uuid", admin_role: "admin" }) as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.user.admin_role).toBe("admin");
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0].action).toBe("roles.assigned");
  });

  it("logs roles.cleared when admin_role is set to null", async () => {
    state.updateOutcome.data = {
      user_id: "target-uuid", email: "target@icareeros.com",
      role: "user", admin_role: null,
    };
    const res = await PATCH(makeReq({ user_id: "target-uuid", admin_role: null }) as never);
    expect(res.status).toBe(200);
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0].action).toBe("roles.cleared");
  });

  it("returns 404 when target user does not exist", async () => {
    state.targetRow = null;
    const res = await PATCH(makeReq({ user_id: "missing-uuid", admin_role: "viewer" }) as never);
    expect(res.status).toBe(404);
    expect(logSpy).not.toHaveBeenCalled();
  });
});
