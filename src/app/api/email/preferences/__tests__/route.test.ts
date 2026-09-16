import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Covers the token-based unsubscribe branch of GET /api/email/preferences.
 *
 * The bug these tests pin down: a PostgREST update that matches zero rows is
 * NOT an error — it resolves to { data: null, error: null }. The route used to
 * check only `error`, so an unknown token returned 200 "Unsubscribed
 * successfully" while changing nothing, and a user whose link had been mangled
 * was told the unsubscribe worked while still receiving mail.
 *
 * e2e/email-preferences.spec.ts asserts the same 400, but the E2E suite runs
 * only against a live deployment, so nothing caught this below that layer.
 */

// Captures the arguments the route passes down the query chain.
const fromSpy = vi.fn();
const updateSpy = vi.fn();
const eqSpy = vi.fn();
const selectSpy = vi.fn();
let queryResult: { data: unknown; error: unknown } = { data: null, error: null };

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table: string) => {
      fromSpy(table);
      return {
        update: (patch: unknown) => {
          updateSpy(patch);
          return {
            eq: (col: string, val: unknown) => {
              eqSpy(col, val);
              return {
                select: (cols: string) => {
                  selectSpy(cols);
                  return Promise.resolve(queryResult);
                },
              };
            },
          };
        },
      };
    },
  }),
}));

// The token branch never builds the cookie-backed client, but the module
// imports these at load time.
vi.mock("@supabase/ssr", () => ({ createServerClient: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));

import { GET } from "../route";

function makeReq(token?: string) {
  const url = new URL("http://localhost/api/email/preferences");
  if (token !== undefined) url.searchParams.set("token", token);
  return { nextUrl: url };
}

beforeEach(() => {
  vi.clearAllMocks();
  queryResult = { data: null, error: null };
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key-for-tests";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
});

describe("GET /api/email/preferences?token=… (unsubscribe)", () => {
  it("returns 400 when the token matches no row", async () => {
    // The regression: zero rows matched, and no error is raised for it.
    queryResult = { data: [], error: null };

    const res = await GET(makeReq("not-a-real-token") as never);

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Invalid unsubscribe token",
    });
  });

  it("returns 400 when the driver reports no rows as null data", async () => {
    queryResult = { data: null, error: null };

    const res = await GET(makeReq("not-a-real-token") as never);

    expect(res.status).toBe(400);
  });

  it("returns 200 and unsubscribes when the token matches a row", async () => {
    queryResult = { data: [{ id: "pref-1" }], error: null };

    const res = await GET(makeReq("a-valid-token") as never);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      ok: true,
      message: "Unsubscribed successfully",
    });
    // Unsubscribe clears the two mailing flags and is scoped by the token.
    expect(fromSpy).toHaveBeenCalledWith("email_preferences");
    expect(updateSpy).toHaveBeenCalledWith({
      weekly_insights: false,
      job_alerts: false,
    });
    expect(eqSpy).toHaveBeenCalledWith("unsubscribe_token", "a-valid-token");
    // Without asking for the affected rows back there is no way to tell a
    // matched update from an unmatched one.
    expect(selectSpy).toHaveBeenCalled();
  });

  it("returns 500, not 400, when the update genuinely fails", async () => {
    // A database failure is not a bad token; reporting it as 400 sent the user
    // to re-check a link that was fine.
    queryResult = { data: null, error: { message: "connection reset" } };

    const res = await GET(makeReq("a-valid-token") as never);

    expect(res.status).toBe(500);
  });

  it("returns 500 when the service role key is not configured", async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const res = await GET(makeReq("any-token") as never);

    expect(res.status).toBe(500);
  });
});
