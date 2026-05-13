/**
 * /api/jobs/deep-fit route tests.
 *
 * Focuses on the plan-gate logic — this is the launch-blocking compliance
 * surface. Cache hit / job-not-found / no-profile paths are sanity-tested.
 *
 * Supabase is mocked. The analyzeJobFit function is real (the engine tests
 * cover its correctness in jobFitAnalysis.test.ts).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const mockGetUser = vi.fn();
const mockUpsert = vi.fn();

function makeQueryChain() {
  const chain: any = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq     = vi.fn().mockReturnValue(chain);
  chain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
  chain.upsert = mockUpsert;
  chain.single = chain.maybeSingle;
  return chain;
}
let chains: any[];

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getUser: mockGetUser },
    from: (_t: string) => { const c = chains.shift() ?? makeQueryChain(); return c; },
  }),
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (_t: string) => { const c = chains.shift() ?? makeQueryChain(); return c; },
  }),
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => {} }) }));

import { POST } from "../route";

beforeEach(() => {
  vi.clearAllMocks();
  chains = [];
  mockUpsert.mockResolvedValue({ error: null });
  process.env.NEXT_PUBLIC_SUPABASE_URL      = "http://stub";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "stub-anon";
  process.env.SUPABASE_SERVICE_ROLE_KEY     = "stub-service";
});

function unauthedUser() { mockGetUser.mockResolvedValue({ data: { user: null } }); }
function authedUser(id = "u-1") { mockGetUser.mockResolvedValue({ data: { user: { id } } }); }
function nextFlag(enabled: boolean) {
  const c = makeQueryChain();
  c.maybeSingle = vi.fn().mockResolvedValue({ data: { enabled }, error: null });
  chains.push(c);
}
function nextSub(plan: string, status = "active") {
  const c = makeQueryChain();
  c.maybeSingle = vi.fn().mockResolvedValue({ data: { plan, status }, error: null });
  chains.push(c);
}
function nextCacheMiss() {
  const c = makeQueryChain();
  c.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
  chains.push(c);
}
function nextOpportunity(desc = "Python AWS Docker Kubernetes Senior Engineer") {
  const c = makeQueryChain();
  c.maybeSingle = vi.fn().mockResolvedValue({ data: { id: "j-1", title: "T", company: "C", description: desc }, error: null });
  chains.push(c);
}
function nextProfile() {
  const c = makeQueryChain();
  c.maybeSingle = vi.fn().mockResolvedValue({
    data: {
      headline: "Senior Engineer",
      summary:  "8 years experience",
      skills:   ["python", "aws", "docker", "kubernetes"],
      work_experience: [{ title: "SE", company: "X", description: "Python on AWS" }],
      education: [],
      certifications: [],
    }, error: null,
  });
  chains.push(c);
}
function nextUpsertOK() {
  const c = makeQueryChain();
  c.upsert = vi.fn().mockResolvedValue({ error: null });
  chains.push(c);
}
function postJson(body: unknown) {
  return new Request("http://localhost/api/jobs/deep-fit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/jobs/deep-fit — auth + body", () => {
  it("401 on unauthenticated", async () => {
    unauthedUser();
    const res = await POST(postJson({ jobId: "j-1" }));
    expect(res.status).toBe(401);
  });
  it("400 on missing jobId", async () => {
    authedUser();
    const res = await POST(postJson({}));
    expect(res.status).toBe(400);
  });
});

describe("/api/jobs/deep-fit — plan gate", () => {
  it("monetization OFF → free plan still allowed", async () => {
    authedUser();
    nextFlag(false); nextCacheMiss(); nextOpportunity(); nextProfile(); nextUpsertOK();
    const res = await POST(postJson({ jobId: "j-1" }));
    expect(res.status).toBe(200);
  });
  it("monetization ON + free → 403 upgrade_required", async () => {
    authedUser();
    nextFlag(true); nextSub("free");
    const res = await POST(postJson({ jobId: "j-1" }));
    expect(res.status).toBe(403);
    const j = await res.json();
    expect(j.error).toBe("upgrade_required");
    expect(j.plan).toBe("standard");
  });
  it("monetization ON + starter → 403", async () => {
    authedUser();
    nextFlag(true); nextSub("starter");
    const res = await POST(postJson({ jobId: "j-1" }));
    expect(res.status).toBe(403);
  });
  it("monetization ON + standard → 200", async () => {
    authedUser();
    nextFlag(true); nextSub("standard"); nextCacheMiss(); nextOpportunity(); nextProfile(); nextUpsertOK();
    const res = await POST(postJson({ jobId: "j-1" }));
    expect(res.status).toBe(200);
  });
  it("monetization ON + pro → 200", async () => {
    authedUser();
    nextFlag(true); nextSub("pro"); nextCacheMiss(); nextOpportunity(); nextProfile(); nextUpsertOK();
    const res = await POST(postJson({ jobId: "j-1" }));
    expect(res.status).toBe(200);
  });
  it("monetization ON + canceled standard → 403 (status not active)", async () => {
    authedUser();
    nextFlag(true); nextSub("standard", "canceled");
    const res = await POST(postJson({ jobId: "j-1" }));
    expect(res.status).toBe(403);
  });
});

describe("/api/jobs/deep-fit — result + cache", () => {
  it("cache hit returns { cached: true, result } without re-running", async () => {
    authedUser();
    nextFlag(false);
    const c = makeQueryChain();
    c.maybeSingle = vi.fn().mockResolvedValue({
      data: { deep_fit_analysis: { overallScore: 88, matchedSkills: [], gaps: [], strengths: [], interviewProbability: 70, experienceMatch: 80, keywordAlignment: 90, improvementPlan: [], summary: "cached", jobLevel: "Senior" } },
      error: null,
    });
    chains.push(c);
    const res = await POST(postJson({ jobId: "j-1" }));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.cached).toBe(true);
    expect(j.result.overallScore).toBe(88);
  });
  it("404 if opportunity not found", async () => {
    authedUser();
    nextFlag(false); nextCacheMiss();
    const c = makeQueryChain();
    c.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    chains.push(c);
    const res = await POST(postJson({ jobId: "j-1" }));
    expect(res.status).toBe(404);
  });
});
