import { describe, it, expect, vi, beforeEach } from "vitest";

// ── next/cache ───────────────────────────────────────────────────────────────
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// ── next/headers — Next.js 15 strict request-scope check ─────────────────────
// `requireAdmin()` does `await cookies()` inside the server action. Without a
// mock, Next.js 15 throws "cookies was called outside a request scope" when
// the action runs in a Vitest unit test (which has no request context).
vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({
    getAll: vi.fn().mockReturnValue([]),
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  }),
}));

// ── @supabase/ssr — used by requireAdmin() to identify the user ──────────────
// requireAdmin() calls createServerClient(...).auth.getUser(). Stub it with a
// fixed admin user; per-test overrides can re-stub via vi.mocked() if needed.
vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn().mockReturnValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "mock-admin-id", email: "admin@test.com" } },
        error: null,
      }),
    },
  }),
}));

// ── @supabase/supabase-js (service-role client) ──────────────────────────────
// Two query shapes used in adminActions:
//   1. requireAdmin:  svc.from("profiles").select("role").eq("user_id", id).maybeSingle()
//   2. setUserPlan:   svc.from("user_subscriptions").update({ ... }).eq("user_id", id)
// from() must return an object that supports BOTH .select() and .update().
const mockEq           = vi.fn();
const mockUpdate       = vi.fn(() => ({ eq: mockEq }));
const mockMaybeSingle  = vi.fn();
const mockSelectChain  = {
  select:      vi.fn().mockReturnThis(),
  eq:          vi.fn().mockReturnThis(),
  maybeSingle: mockMaybeSingle,
};
const mockSelect = vi.fn(() => mockSelectChain);
const mockFrom   = vi.fn(() => ({ update: mockUpdate, select: mockSelect }));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({ from: mockFrom })),
}));

import { resetUserPlan } from "../adminActions";

beforeEach(() => {
  vi.clearAllMocks();
  // Default: setUserPlan's update().eq() resolves OK
  mockEq.mockResolvedValue({ error: null });
  mockUpdate.mockReturnValue({ eq: mockEq });
  // Default: requireAdmin's profile lookup returns admin
  mockMaybeSingle.mockResolvedValue({ data: { role: "admin" }, error: null });
  mockFrom.mockReturnValue({ update: mockUpdate, select: mockSelect });
  mockSelect.mockReturnValue(mockSelectChain);
});

describe("resetUserPlan", () => {
  it("calls update on user_subscriptions with free plan", async () => {
    const result = await resetUserPlan("user-123");
    expect(result).toEqual({});
    expect(mockFrom).toHaveBeenCalledWith("user_subscriptions");
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ plan: "free", status: "active" })
    );
    expect(mockEq).toHaveBeenCalledWith("user_id", "user-123");
  });

  it("returns error when Supabase fails", async () => {
    mockEq.mockResolvedValue({ error: { message: "DB error" } });
    const result = await resetUserPlan("user-456");
    expect(result).toEqual({ error: "DB error" });
  });

  it("calls revalidatePath on success", async () => {
    const { revalidatePath } = await import("next/cache");
    await resetUserPlan("user-789");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/users");
  });

  it("does not call revalidatePath on failure", async () => {
    mockEq.mockResolvedValue({ error: { message: "fail" } });
    const { revalidatePath } = await import("next/cache");
    vi.mocked(revalidatePath).mockClear();
    await resetUserPlan("user-000");
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
