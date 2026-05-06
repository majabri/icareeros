/**
 * subscriptionService unit tests
 *
 * Focus: NEXT_PUBLIC_MONETIZATION_ENABLED guard. Until monetization is live,
 * every billing-service call must short-circuit at the client without making
 * a network request, because the edge function is not deployed in the
 * icareeros Supabase project (kuneabeiwcxavvyyfjkx). Phase 0 P0 Fix 3 — see
 * docs/specs/COWORK-BRIEF-phase0-p0-bugs-v1.md.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock supabase BEFORE importing the service so the mock is in place when
// the service module evaluates its imports.
const mockInvoke = vi.fn();
vi.mock("@/lib/supabase", () => ({
  createClient: () => ({ functions: { invoke: mockInvoke } }),
}));

// Snapshot the env var so we can flip it per test and restore on teardown.
const ORIGINAL_FLAG = process.env.NEXT_PUBLIC_MONETIZATION_ENABLED;

beforeEach(() => {
  vi.clearAllMocks();
  mockInvoke.mockReset();
});

afterEach(() => {
  if (ORIGINAL_FLAG === undefined) {
    delete process.env.NEXT_PUBLIC_MONETIZATION_ENABLED;
  } else {
    process.env.NEXT_PUBLIC_MONETIZATION_ENABLED = ORIGINAL_FLAG;
  }
});

// Re-imports the service module fresh after the env-var change so the
// `process.env.NEXT_PUBLIC_MONETIZATION_ENABLED` read inside the helper is
// re-evaluated for each test. (Next.js inlines NEXT_PUBLIC_* at build time
// in production, but at test runtime under Vitest these are read from
// process.env on each call to isMonetizationEnabled().)
async function loadService() {
  vi.resetModules();
  return await import("../subscriptionService");
}

describe("subscriptionService — monetization disabled (env var unset/false)", () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_MONETIZATION_ENABLED;
  });

  it("getSubscription returns null without calling the edge function", async () => {
    const { getSubscription } = await loadService();
    const result = await getSubscription();
    expect(result).toBeNull();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("createCheckoutSession returns null without calling the edge function", async () => {
    const { createCheckoutSession } = await loadService();
    const result = await createCheckoutSession("premium");
    expect(result).toBeNull();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("getBillingPortalUrl returns null without calling the edge function", async () => {
    const { getBillingPortalUrl } = await loadService();
    const result = await getBillingPortalUrl();
    expect(result).toBeNull();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("cancelSubscription returns false without calling the edge function", async () => {
    const { cancelSubscription } = await loadService();
    const result = await cancelSubscription();
    expect(result).toBe(false);
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("canAccessFeature returns true (fail-open / gating disabled) without calling the edge function", async () => {
    const { canAccessFeature } = await loadService();
    const result = await canAccessFeature("ai_resume_rewrite" as never);
    expect(result).toBe(true);
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("getCurrentPlan returns 'free' without calling the edge function", async () => {
    const { getCurrentPlan } = await loadService();
    const result = await getCurrentPlan();
    expect(result).toBe("free");
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("isOnPaidPlan returns false without calling the edge function", async () => {
    const { isOnPaidPlan } = await loadService();
    const result = await isOnPaidPlan();
    expect(result).toBe(false);
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("explicit 'false' string also short-circuits", async () => {
    process.env.NEXT_PUBLIC_MONETIZATION_ENABLED = "false";
    const { getSubscription } = await loadService();
    const result = await getSubscription();
    expect(result).toBeNull();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("any non-'true' string short-circuits (only the literal 'true' opens the gate)", async () => {
    process.env.NEXT_PUBLIC_MONETIZATION_ENABLED = "1";
    const { getSubscription } = await loadService();
    const result = await getSubscription();
    expect(result).toBeNull();
    expect(mockInvoke).not.toHaveBeenCalled();
  });
});

describe("subscriptionService — monetization enabled (env var = 'true')", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_MONETIZATION_ENABLED = "true";
  });

  it("getSubscription DOES call the edge function when the flag is on", async () => {
    mockInvoke.mockResolvedValueOnce({
      data: { success: true, data: { plan: "premium", status: "active" } },
      error: null,
    });
    const { getSubscription } = await loadService();
    const result = await getSubscription();
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke).toHaveBeenCalledWith(
      "billing-service",
      expect.objectContaining({ body: { action: "get_subscription" } })
    );
    expect(result).toEqual({ plan: "premium", status: "active" });
  });

  it("getSubscription returns null on edge function error (existing fail-safe)", async () => {
    mockInvoke.mockResolvedValueOnce({
      data: null,
      error: { message: "boom" },
    });
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { getSubscription } = await loadService();
    const result = await getSubscription();
    expect(result).toBeNull();
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    consoleSpy.mockRestore();
  });
});
