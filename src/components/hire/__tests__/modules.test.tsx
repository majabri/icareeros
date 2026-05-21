import { describe, it, expect, vi } from "vitest";

const { supabaseClientStub } = vi.hoisted(() => ({
  supabaseClientStub: {
    auth: { getUser: vi.fn() },
    from: vi.fn(),
    storage: { from: vi.fn() },
  },
}));

vi.mock("@/lib/supabase", () => ({
  createClient: vi.fn(() => supabaseClientStub),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

describe("hire/* component modules compile + export defaults", () => {
  it("PathwayRing exports a function", async () => {
    const mod = await import("@/components/hire/PathwayRing");
    expect(typeof mod.PathwayRing).toBe("function");
    expect(typeof mod.default).toBe("function");
  });

  it("StageHeader exports a function", async () => {
    const mod = await import("@/components/hire/StageHeader");
    expect(typeof mod.StageHeader).toBe("function");
  });

  it("StageLocked exports a function", async () => {
    const mod = await import("@/components/hire/StageLocked");
    expect(typeof mod.StageLocked).toBe("function");
  });

  it("StageComingSoon exports a function (used by Design stage)", async () => {
    const mod = await import("@/components/hire/StageComingSoon");
    expect(typeof mod.StageComingSoon).toBe("function");
  });
});
