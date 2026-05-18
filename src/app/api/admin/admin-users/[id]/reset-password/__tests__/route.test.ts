import { describe, it, expect, vi, beforeEach } from "vitest";

/** POST /api/admin/admin-users/[id]/reset-password — admin gate. */

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
vi.mock("@/lib/mailer",       () => ({ sendMail: vi.fn().mockResolvedValue({ accepted: [], rejected: [] }) }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }) }),
    auth: { admin: {
      getUserById: () => Promise.resolve({ data: { user: null }, error: null }),
      generateLink: () => Promise.resolve({ data: null, error: null }),
    }},
  }),
}));

import { POST } from "../route";

beforeEach(() => {
  requirePermissionSpy.mockResolvedValueOnce({ ok: false, status: 403, error: "Forbidden" });
});

describe("POST /api/admin/admin-users/[id]/reset-password", () => {
  it("403s for non-admins", async () => {
    const req = new Request("http://localhost/api/admin/admin-users/x/reset-password", { method: "POST" });
    const res = await POST(req, { params: Promise.resolve({ id: "a1" }) });
    expect(res.status).toBe(403);
  });
});
