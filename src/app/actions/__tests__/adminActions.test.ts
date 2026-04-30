import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock next/cache
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// Mock Supabase createClient
const mockEq = vi.fn();
const mockUpdate = vi.fn(() => ({ eq: mockEq }));
const mockFrom = vi.fn(() => ({ update: mockUpdate }));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({ from: mockFrom })),
}));

import { resetUserPlan } from "../adminActions";

beforeEach(() => {
  vi.clearAllMocks();
  mockEq.mockResolvedValue({ error: null });
  mockUpdate.mockReturnValue({ eq: mockEq });
  mockFrom.mockReturnValue({ update: mockUpdate });
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
    expect(revalidatePath).toHaveBeenCalledWith("/admin");
  });

  it("does not call revalidatePath on failure", async () => {
    mockEq.mockResolvedValue({ error: { message: "fail" } });
    const { revalidatePath } = await import("next/cache");
    vi.mocked(revalidatePath).mockClear();
    await resetUserPlan("user-000");
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
