import { describe, it, expect, vi } from "vitest";
import { getAuthedUser, getAuthedUserId } from "@/lib/supabaseAuth";

function makeSupabase(overrides: {
  getSession?: () => Promise<any>;
  getUser?: () => Promise<any>;
}) {
  return {
    auth: {
      getSession: overrides.getSession ?? (async () => ({ data: { session: null } })),
      getUser: overrides.getUser ?? (async () => ({ data: { user: null } })),
    },
  } as any;
}

describe("supabaseAuth", () => {
  it("prefers session user when present", async () => {
    const getSession = vi.fn(async () => ({
      data: { session: { user: { id: "u-1", email: "a@b.com" } } },
    }));
    const getUser = vi.fn(async () => ({ data: { user: { id: "u-2" } } }));
    const supabase = makeSupabase({ getSession, getUser });

    const u = await getAuthedUser(supabase);
    expect(u?.id).toBe("u-1");
    expect(getSession).toHaveBeenCalledTimes(1);
    expect(getUser).not.toHaveBeenCalled();
  });

  it("falls back to getUser when session is missing", async () => {
    const getSession = vi.fn(async () => ({ data: { session: null } }));
    const getUser = vi.fn(async () => ({
      data: { user: { id: "u-2", email: "x@y.com" } },
    }));
    const supabase = makeSupabase({ getSession, getUser });

    const id = await getAuthedUserId(supabase);
    expect(id).toBe("u-2");
    expect(getSession).toHaveBeenCalledTimes(1);
    expect(getUser).toHaveBeenCalledTimes(1);
  });

  it("returns null when neither path yields a user", async () => {
    const getSession = vi.fn(async () => ({ data: { session: null } }));
    const getUser = vi.fn(async () => ({ data: { user: null } }));
    const supabase = makeSupabase({ getSession, getUser });

    const u = await getAuthedUser(supabase);
    expect(u).toBeNull();
  });
});

