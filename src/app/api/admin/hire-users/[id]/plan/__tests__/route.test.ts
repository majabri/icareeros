import { describe, it, expect, vi, beforeEach } from "vitest";

/** PATCH /api/admin/hire-users/[id]/plan — admin gate test. */

const { requirePermissionSpy, permissionErrorResponseSpy } = vi.hoisted(() => ({
  requirePermissionSpy: vi.fn(),
  permissionErrorResponseSpy: vi.fn((r: { status: number; error: string }) =>
    new Response(JSON.stringify({ error: r.error }), { status: r.status }),
  ),
}));

vi.mock("@/lib/admin/permissions.server", () => ({
  requirePermission:       requirePermissionSpy,
  permissionErrorResponse: permissionErrorResponseSpy,
}));
vi.mock("@/lib/admin/audit", () => ({ logAdminAction: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }) }) }),
}));

import { PATCH } from "../route";

beforeEach(() => {
  requirePermissionSpy.mockResolvedValueOnce({ ok: false, status: 403, error: "Forbidden" });
});

describe("PATCH /api/admin/hire-users/[id]/plan", () => {
  it("403s for non-admins", async () => {
    const req = new Request("http://localhost/api/admin/hire-users/x/plan", {
      method: "PATCH",
      body: JSON.stringify({ plan: "growth" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "emp-1" }) });
    expect(res.status).toBe(403);
  });
});
