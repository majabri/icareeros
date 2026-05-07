/**
 * milestoneService — pure helper tests.
 *
 * The HTTP-bound listMilestones / getCareerXp helpers go through Supabase
 * REST and are exercised by route integration; here we just verify the
 * level math.
 */

import { describe, it, expect, vi } from "vitest";

// @/lib/supabase has a top-level createBrowserClient() call that fails
// without env vars. Mock it before importing milestoneService.
vi.mock("@/lib/supabase", () => ({
  createClient: () => ({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      order:  vi.fn().mockReturnThis(),
      limit:  vi.fn().mockResolvedValue({ data: [], error: null }),
    }),
  }),
}));

import { levelForXp } from "../milestoneService";

describe("levelForXp", () => {
  it("base level is 1 for 0 XP", () => {
    expect(levelForXp(0)).toBe(1);
  });
  it("499 XP is still level 1", () => {
    expect(levelForXp(499)).toBe(1);
  });
  it("500 XP unlocks level 2", () => {
    expect(levelForXp(500)).toBe(2);
  });
  it("999 XP is still level 2", () => {
    expect(levelForXp(999)).toBe(2);
  });
  it("1500 XP is level 4", () => {
    expect(levelForXp(1500)).toBe(4);
  });
  it("clamps negative XP to level 1", () => {
    expect(levelForXp(-100)).toBe(1);
  });
});
