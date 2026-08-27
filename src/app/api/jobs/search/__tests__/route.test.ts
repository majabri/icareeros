process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

import { beforeEach, describe, expect, it, vi } from "vitest";

const searchOpportunitiesMock = vi.fn();
const attachCompanyApplyUrlsMock = vi.fn((opps: unknown) => opps);
const chaseApplyUrlsBatchMock = vi.fn(async (opps: unknown) => opps);

let careerProfileHeadline: string | null = null;
let employerRows: Array<Record<string, unknown>> = [];
let upsertedRows: Array<Record<string, unknown>> = [];

const serviceQueryCalls = {
  eq:  [] as Array<unknown[]>,
  not: [] as Array<unknown[]>,
  or:  [] as Array<unknown[]>,
};

function makeCareerProfileChain() {
  return {
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data: { headline: careerProfileHeadline }, error: null }),
      }),
    }),
  };
}

function makeServiceOpportunitiesChain() {
  let upsertMode = false;
  const chain: Record<string, any> = {};
  chain.select = vi.fn(() => {
    if (upsertMode) return Promise.resolve({ data: upsertedRows, error: null });
    return chain;
  });
  chain.eq = vi.fn((...args: unknown[]) => {
    serviceQueryCalls.eq.push(args);
    return chain;
  });
  chain.not = vi.fn((...args: unknown[]) => {
    serviceQueryCalls.not.push(args);
    return chain;
  });
  chain.or = vi.fn((...args: unknown[]) => {
    serviceQueryCalls.or.push(args);
    return chain;
  });
  chain.order = vi.fn(() => chain);
  chain.limit = vi.fn(async () => ({ data: employerRows, error: null }));
  chain.upsert = vi.fn(() => {
    upsertMode = true;
    return chain;
  });
  return chain;
}

vi.mock("@/services/integrations/opportunityAggregator", () => ({
  searchOpportunities: (args: unknown) => searchOpportunitiesMock(args),
}));
vi.mock("@/services/jobs/companyUrlResolver", () => ({
  attachCompanyApplyUrls: (opps: unknown) => attachCompanyApplyUrlsMock(opps),
}));
vi.mock("@/services/jobs/applyUrlChaser", () => ({
  chaseApplyUrlsBatch: (opps: unknown) => chaseApplyUrlsBatchMock(opps),
}));
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } }, error: null }) },
    from: (table: string) => {
      if (table === "career_profiles") return makeCareerProfileChain();
      throw new Error(`unexpected server table: ${table}`);
    },
  }),
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table: string) => {
      if (table === "opportunities") return makeServiceOpportunitiesChain();
      throw new Error(`unexpected service table: ${table}`);
    },
  }),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => [], set: vi.fn() }),
}));

import { POST } from "../route";

function makeReq(body: unknown): Request {
  return new Request("http://localhost/api/jobs/search", {
    method:  "POST",
    headers: { "content-type": "application/json" },
    body:    JSON.stringify(body),
  });
}

function makeEmployerRow(overrides: Record<string, unknown> = {}) {
  return {
    id:              "employer-1",
    title:           "Payments Engineer",
    company:         "iCareerOS",
    location:        "Remote",
    description:     "Build payments infrastructure for hiring workflows.",
    url:             "https://hire.icareeros.com/jobs/payments-engineer",
    job_type:        "full_time",
    is_remote:       true,
    salary_min:      150000,
    salary_max:      180000,
    salary_currency: "USD",
    posted_at:       "2026-08-20T00:00:00Z",
    first_seen_at:   null,
    created_at:      "2026-08-21T00:00:00Z",
    is_flagged:      false,
    source:          "employer",
    ...overrides,
  };
}

function makeAdzunaOpportunity(overrides: Record<string, unknown> = {}) {
  return {
    id:              "adzuna-1",
    title:           "Payments Engineer",
    company:         "Acme Payments",
    location:        "Remote",
    type:            "full_time",
    description:     "Own the payments platform.",
    url:             "https://adzuna.example/jobs/1",
    matchReason:     "",
    salary_min:      160000,
    salary_max:      190000,
    salary_currency: "USD",
    is_remote:       true,
    source:          "adzuna",
    first_seen_at:   "2026-08-22T00:00:00Z",
    ...overrides,
  };
}

function mockSearch(baseOpportunities: Array<Record<string, unknown>>, total = baseOpportunities.length) {
  searchOpportunitiesMock.mockImplementation(async ({ filters }: { filters: { query: string } }) => {
    if (filters.query !== "payments") {
      return { opportunities: [], total: 0, sources: {} };
    }
    return {
      opportunities: baseOpportunities,
      total,
      sources: { adzuna: { count: baseOpportunities.length, fallback: false } },
    };
  });
}

describe("POST /api/jobs/search — employer union", () => {
  beforeEach(() => {
    careerProfileHeadline = null;
    employerRows = [];
    upsertedRows = [];
    serviceQueryCalls.eq = [];
    serviceQueryCalls.not = [];
    serviceQueryCalls.or = [];
    searchOpportunitiesMock.mockReset();
    attachCompanyApplyUrlsMock.mockClear();
    chaseApplyUrlsBatchMock.mockClear();
    attachCompanyApplyUrlsMock.mockImplementation((opps: unknown) => opps);
    chaseApplyUrlsBatchMock.mockImplementation(async (opps: unknown) => opps);
    mockSearch([]);
  });

  it("returns an employer-source row when one matches the query", async () => {
    employerRows = [makeEmployerRow()];

    const res = await POST(makeReq({ mode: "manual", what: "payments" }));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.opportunities).toHaveLength(1);
    expect(body.opportunities[0]).toMatchObject({
      id:         "employer-1",
      source:     "employer",
      source_tag: "employer",
      title:      "Payments Engineer",
    });
    expect(body.total).toBe(1);
    expect(body.sources.employer).toEqual({ count: 1, fallback: false });
    expect(serviceQueryCalls.eq).toContainEqual(["source", "employer"]);
    expect(serviceQueryCalls.not).toContainEqual(["is_flagged", "is", true]);
    expect(serviceQueryCalls.or[0]?.[0]).toContain("title.ilike.%payments%");
  });

  it("still returns Adzuna rows when they exist", async () => {
    const adzunaOpportunity = makeAdzunaOpportunity();
    employerRows = [makeEmployerRow()];
    upsertedRows = [{
      id:        "db-adzuna-1",
      source:    "adzuna",
      source_id: "1",
      title:     adzunaOpportunity.title,
      company:   adzunaOpportunity.company,
    }];
    mockSearch([adzunaOpportunity]);

    const res = await POST(makeReq({ mode: "manual", what: "payments" }));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.opportunities).toHaveLength(2);
    expect(body.opportunities).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id:         "db-adzuna-1",
        source:     "adzuna",
        source_tag: "adzuna",
      }),
      expect.objectContaining({
        id:         "employer-1",
        source:     "employer",
        source_tag: "employer",
      }),
    ]));
    expect(body.total).toBe(2);
  });

  it("excludes flagged employer rows from results", async () => {
    employerRows = [makeEmployerRow({ id: "employer-flagged", is_flagged: true })];

    const res = await POST(makeReq({ mode: "manual", what: "payments" }));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.opportunities).toEqual([]);
    expect(body.total).toBe(0);
    expect(body.sources.employer).toBeUndefined();
  });

  it("does not double-count identical employer and Adzuna rows", async () => {
    const adzunaOpportunity = makeAdzunaOpportunity({
      title:   "Senior Payments Engineer",
      company: "SharedCo",
    });
    employerRows = [makeEmployerRow({
      id:      "shared-db-id",
      title:   "Senior Payments Engineer",
      company: "SharedCo",
    })];
    upsertedRows = [{
      id:        "shared-db-id",
      source:    "adzuna",
      source_id: "1",
      title:     adzunaOpportunity.title,
      company:   adzunaOpportunity.company,
    }];
    mockSearch([adzunaOpportunity]);

    const res = await POST(makeReq({ mode: "manual", what: "payments" }));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.opportunities).toHaveLength(1);
    expect(body.total).toBe(1);
    expect(body.opportunities[0]).toMatchObject({
      id:         "shared-db-id",
      source:     "adzuna",
      source_tag: "adzuna",
    });
  });
});
