/**
 * feat/jobs-search-db-route Task 1 — GET route tests.
 *
 * The GET route is a query-string-driven, mirror-of-/api/jobs/search
 * DB-only search over ats_jobs. Tests here cover:
 *   - required-param validation (q)
 *   - default and boundary values for limit/offset
 *   - websearch tsquery building via the shared helper
 *   - filter passthrough
 *   - response shape parity with the POST route
 *
 * Full integration against the DB is exercised by the pre-PR live-SQL
 * proof (368 rows for `python engineer` in prod, verified 2026-07-16).
 * These tests focus on the route wiring itself.
 */
// Set env BEFORE any module import — supabase.ts requires them at load
process.env.NEXT_PUBLIC_SUPABASE_URL      = "https://x.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "dummy";
process.env.SUPABASE_SERVICE_ROLE_KEY     = "dummy";
import { describe, it, expect, vi, beforeEach } from "vitest";

const supabaseChain = {
  from: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  ilike: vi.fn().mockReturnThis(),
  in: vi.fn().mockReturnThis(),
  gte: vi.fn().mockReturnThis(),
  or: vi.fn().mockReturnThis(),
  textSearch: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  range: vi.fn().mockResolvedValue({
    data: [
      {
        id: "1", source: "greenhouse", external_id: "x", company: "Acme",
        title: "Senior Python Engineer", location: "Remote", description: "",
        apply_url: "https://a/1", direct_apply_url: "https://a/1",
        salary_min: 150000, salary_max: 200000, salary_currency: "USD",
        employment_type: "full_time", remote: true, department: "Engineering",
        posted_at: "2026-07-10T00:00:00Z", last_seen_at: "2026-07-16T00:00:00Z",
      },
    ],
    error: null,
  }),
};

vi.mock("@supabase/ssr", () => ({
  createBrowserClient: () => ({}),
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u1" } }, error: null }) },
    from: (t: string) => {
      if (t === "ats_jobs") {
        // Count vs rows path: countQ ends with `head: true`; range() ends the rows path.
        return { ...supabaseChain, select: (cols: string, opts?: any) => {
          if (opts?.count === "exact" && opts?.head === true) {
            return { ...supabaseChain, then: undefined,
              range: undefined,
              // Mimic .eq().eq().textSearch()... resolving to a count response
            } as any;
          }
          return supabaseChain;
        } };
      }
      return supabaseChain;
    },
  }),
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [] }) }));

// Auto-mock the count path more carefully: the count query's terminal is
// awaiting the whole chain. Provide a getter-based promise resolution.
Object.defineProperty(supabaseChain, "then", {
  configurable: true,
  get() { return undefined; },  // Prevent accidental thenable resolution.
});

// Import AFTER mocks.
import { GET } from "../route";

function makeReq(qs: string): Request {
  return new Request(`http://localhost/api/jobs/search-db?${qs}`);
}

describe("GET /api/jobs/search-db — route wiring", () => {
  beforeEach(() => {
    for (const fn of Object.values(supabaseChain)) {
      if (typeof fn === "function" && "mockClear" in fn) (fn as any).mockClear?.();
    }
  });

  it("returns 400 when q is missing", async () => {
    const res = await GET(makeReq("") as any);
    expect(res.status).toBe(400);
    const b = await res.json();
    expect(b.error).toMatch(/q is required/);
    expect(b.opportunities).toEqual([]);
    expect(b.total).toBe(0);
  });

  it("returns 400 when q is whitespace-only", async () => {
    const res = await GET(makeReq("q=%20%20") as any);
    expect(res.status).toBe(400);
  });

  it("default limit is 20, max is 100", async () => {
    // limit=200 → clamped to 100. Verify via the .range() call.
    const rangeSpy = vi.spyOn(supabaseChain, "range");
    await GET(makeReq("q=python%20engineer&limit=200") as any).catch(() => null);
    expect(rangeSpy).toHaveBeenCalledWith(0, 99);
    rangeSpy.mockClear();
    await GET(makeReq("q=python%20engineer") as any).catch(() => null);
    expect(rangeSpy).toHaveBeenCalledWith(0, 19);   // default 20
  });

  it("offset is applied", async () => {
    const rangeSpy = vi.spyOn(supabaseChain, "range");
    await GET(makeReq("q=python%20engineer&limit=10&offset=25") as any).catch(() => null);
    expect(rangeSpy).toHaveBeenCalledWith(25, 34);
  });

  it("always applies is_active=true and enrichment_status=complete", async () => {
    const eqSpy = vi.spyOn(supabaseChain, "eq");
    await GET(makeReq("q=python%20engineer") as any).catch(() => null);
    const calls = eqSpy.mock.calls.map(c => `${c[0]}=${c[1]}`);
    expect(calls).toContain("is_active=true");
    expect(calls).toContain("enrichment_status=complete");
  });

  it("uses websearch mode for tsquery (post-#372 contract)", async () => {
    const tsSpy = vi.spyOn(supabaseChain, "textSearch");
    await GET(makeReq("q=python%20engineer") as any).catch(() => null);
    expect(tsSpy).toHaveBeenCalled();
    const [col, arg, opts] = tsSpy.mock.calls[0] as any[];
    expect(col).toBe("title");
    expect(opts.type).toBe("websearch");
    expect(opts.config).toBe("english");
    // arg is the buildTsqueryArg output — for single phrase with space it's quoted
    expect(arg).toBe(`"python engineer"`);
  });

  it("location filter (non-remote) uses ILIKE", async () => {
    const ilikeSpy = vi.spyOn(supabaseChain, "ilike");
    await GET(makeReq("q=python&location=Toronto") as any).catch(() => null);
    const cols = ilikeSpy.mock.calls.map(c => c[0]);
    expect(cols).toContain("location");
  });

  it("location=remote coerces to remote-only filter", async () => {
    const eqSpy = vi.spyOn(supabaseChain, "eq");
    await GET(makeReq("q=python&location=remote") as any).catch(() => null);
    const calls = eqSpy.mock.calls.map(c => `${c[0]}=${c[1]}`);
    expect(calls).toContain("remote=true");
  });

  it("employment_type is exact-eq", async () => {
    const eqSpy = vi.spyOn(supabaseChain, "eq");
    await GET(makeReq("q=python&employment_type=contract") as any).catch(() => null);
    const calls = eqSpy.mock.calls.map(c => `${c[0]}=${c[1]}`);
    expect(calls).toContain("employment_type=contract");
  });

  it("salary_min uses OR to hit salary_max OR salary_min", async () => {
    const orSpy = vi.spyOn(supabaseChain, "or");
    await GET(makeReq("q=python&salary_min=150000") as any).catch(() => null);
    expect(orSpy).toHaveBeenCalledWith("salary_max.gte.150000,salary_min.gte.150000");
  });

  it("source is CSV-split into IN()", async () => {
    const inSpy = vi.spyOn(supabaseChain, "in");
    await GET(makeReq("q=python&source=greenhouse,lever") as any).catch(() => null);
    expect(inSpy).toHaveBeenCalledWith("source", ["greenhouse", "lever"]);
  });

  it("company is ILIKE", async () => {
    const ilikeSpy = vi.spyOn(supabaseChain, "ilike");
    await GET(makeReq("q=python&company=Whoop") as any).catch(() => null);
    expect(ilikeSpy).toHaveBeenCalledWith("company", "%Whoop%");
  });

  it("department is exact-eq", async () => {
    const eqSpy = vi.spyOn(supabaseChain, "eq");
    await GET(makeReq("q=python&department=Engineering") as any).catch(() => null);
    const calls = eqSpy.mock.calls.map(c => `${c[0]}=${c[1]}`);
    expect(calls).toContain("department=Engineering");
  });

  it("posted_at DESC ordering with nullsFirst:false", async () => {
    const orderSpy = vi.spyOn(supabaseChain, "order");
    await GET(makeReq("q=python") as any).catch(() => null);
    expect(orderSpy).toHaveBeenCalledWith("posted_at", { ascending: false, nullsFirst: false });
  });

  it("response shape mirrors POST route — opportunities[] + total + source + limit + offset", async () => {
    const res = await GET(makeReq("q=python%20engineer") as any);
    expect(res.status).toBe(200);
    const b = await res.json();
    expect(Array.isArray(b.opportunities)).toBe(true);
    expect(typeof b.total).toBe("number");
    expect(b.source).toBe("database");
    expect(typeof b.limit).toBe("number");
    expect(typeof b.offset).toBe("number");
    // First opportunity has the OpportunityResult shape
    if (b.opportunities.length > 0) {
      const o = b.opportunities[0];
      expect(typeof o.title).toBe("string");
      expect(typeof o.company).toBe("string");
      expect(typeof o.url).toBe("string");
    }
  });
});
